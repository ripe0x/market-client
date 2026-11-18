"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { eth, when, readRight, sameAddress, type ApiRight, randomSalt, toSchedule, buyMaxPrice, tx, verifyOrder, newOrderFeeBps, split, type Page } from "@market/protocol";
import { getAddress, isAddress, type Address } from "viem";
import { Button, KeyValueRows, TokenMedia } from "@/components/ui";
import { ErrorNote, Loading } from "@/components/screens";
import { useHead, useIndexer, useApi } from "@/data/hooks";
import { indexer, paths } from "@/data/indexer";
import { DEPLOYMENT as d } from "@/lib/deployment";
import { rightAction } from "@/data/rightsFlows";
import { buySteps, cancelSteps, listingSteps } from "@/data/flows";
import { FlowModal } from "./FlowModal";
import type { Step } from "@/data/txflow";
import { parseEth } from "@/lib/listingConfig";
import styles from "./Rights.module.css";

const states = ["pending setup", "active", "exercised", "expired", "surrendered", "canceled setup"];
export const rightStatus = (r: ApiRight) => r.effectiveExpired && (r.state === 0 || r.state === 1) ? "expired, awaiting finalization" : states[r.state];
const deadlineLabel = (deadline: bigint) => deadline === 0n ? "Perpetual commitment" : deadline <= 8_640_000_000_000n ? new Date(Number(deadline) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC") : `${deadline} seconds since Unix epoch`;
const rightsPath = (wallet?: Address) => `/api/rights${wallet ? `?account=${wallet}` : ""}`;

export function RightsSection({ items, title = "Your rights" }: { items: ApiRight[]; title?: string }) {
  return <section className={styles.section}><h2>{title}</h2>
    {!items.length ? <p className={styles.note}>No rights here yet.</p> : <table className={styles.table}>
      <thead><tr><th>Right</th><th>Status</th><th>Exercise price</th><th>Deadline</th></tr></thead>
      <tbody>{items.map(r => <tr key={r.account}>
        <td><Link href={`/rights/${r.account}`}>{r.assetId ? `nft #${r.assetId}` : "Execution right"}</Link><div className={styles.mono}>{r.account.slice(0, 8)}…{r.account.slice(-4)}</div></td>
        <td>{rightStatus(r)}{r.listing ? <div>listed for {eth(BigInt(r.listing.priceNow))} eth</div> : null}</td>
        <td>{r.price != null ? `${eth(BigInt(r.price))} eth` : "Unsupported operation"}</td>
        <td>{deadlineLabel(BigInt(r.deadline))}</td>
      </tr>)}</tbody>
    </table>}
  </section>;
}

export function RightsView() {
  const [lookup, setLookup] = useState("");
  const q = useIndexer<Page<ApiRight>>(d.rights ? rightsPath() : null);
  return <>
    <header className={styles.header}><h1>Execution rights</h1><p>Buy the right now. Pay the separate exercise price later to receive the underlying nft.</p></header>
    <div className={styles.toolbar}><Button href="/rights/issue">Issue a right</Button><Button variant="text" href="/positions">Your positions</Button>
      <input aria-label="Backing account address" placeholder="Backing account address" value={lookup} onChange={e => setLookup(e.target.value)} />
      {isAddress(lookup) ? <Button variant="text" href={`/rights/${lookup}`}>Inspect right</Button> : null}
    </div>
    {!d.rights ? <ErrorNote>This release has no native rights. Your legacy positions are still available.</ErrorNote> : q.isError ? <ErrorNote>{q.error.message}</ErrorNote> : !q.data ? <Loading /> : <RightsSection items={q.data.items} title="Issued rights" />}
  </>;
}

export function RightDetailView({ account }: { account: Address }) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const now = useHead();
  const indexed = useIndexer<ApiRight>(`/api/rights/${account}`);
  const config = indexed.data?.config ?? undefined;
  const beneficiaries = indexed.data?.credits.map(c => c.beneficiary) ?? [];
  const live = useQuery({ queryKey: ["right", d.deploymentId, account, config, beneficiaries.join()], enabled: !!pub && !!d.rights,
    queryFn: () => readRight(pub!, d, account, { config, beneficiaries }), retry: false, refetchInterval: 4_000, placeholderData: previous => sameAddress(previous?.account, account) ? previous : undefined });
  const r = live.data;
  const listing = indexed.data?.listing;
  const media = useApi<{ image?: string }>(r?.nft && r.assetId != null ? `/api/nfts/token?nft=${r.nft}&id=${r.assetId}` : null);
  const [action, setAction] = useState<{ title: string; label: string; steps: Step[]; destination?: Address } | null>(null);
  const [premium, setPremium] = useState("");
  const [exerciseRecipient, setExerciseRecipient] = useState("");
  const [transferRecipient, setTransferRecipient] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [releaseBeneficiary, setReleaseBeneficiary] = useState("");
  const [ack, setAck] = useState(false);
  const [listingSalt, setListingSalt] = useState<`0x${string}` | null>(null);
  const [listingAnchor, setListingAnchor] = useState<bigint | null>(null);
  const newFee = useQuery({ queryKey: ["right-new-order-fee", d.deploymentId],
    enabled: !!pub && !!d.rights && r?.stateCode === 1 && sameAddress(address, r.holder),
    queryFn: () => newOrderFeeBps(pub!, d), refetchInterval: 12_000 });
  if (!d.rights) return <ErrorNote>This release doesn't support rights.</ErrorNote>;
  if (live.error) return <ErrorNote>{live.error.message}</ErrorNote>;
  if (!r) return <Loading />;
  const active = r.stateCode === 1 && !r.effectiveExpired;
  const holder = sameAddress(address, r.holder);
  const issuer = sameAddress(address, r.issuer);
  const terminal = r.stateCode >= 2;
  const canExercise = active && holder && r.supported && !r.configError && r.backed;
  const activate = (title: string, kind: Parameters<typeof rightAction>[1], target?: Address) => setAction({ title, label: title, steps: rightAction(account, kind, target, config), destination: ["exercise", "transfer", "release", "withdraw"].includes(kind) ? target ?? address : undefined });
  const list = () => {
    if (!address || !d.rights || !holder || !active || parseEth(premium) <= 0n) return;
    const salt = listingSalt ?? randomSalt();
    const anchor = listingAnchor ?? now;
    setListingSalt(salt); setListingAnchor(anchor);
    const expiry = r.deadline === 0n ? anchor + 7n * 86400n : r.deadline - 3600n;
    setAction({ title: "List the right", label: "Create premium listing", steps: listingSteps({ salt, config: {
      nft: d.rights, tokenId: r.tokenId, schedule: { startPrice: parseEth(premium), endPrice: parseEth(premium), startTime: anchor, endTime: anchor, expiry },
      proceedsTo: address, maxRoyaltyBps: 0,
    } }, "right") });
  };
  const price = listing ? buyMaxPrice(toSchedule(listing.schedule), now) : null;
  const premiumSplit = newFee.data !== undefined ? split(parseEth(premium), newFee.data, 0n) : null;
  const listingSplit = listing && price !== null ? split(price, BigInt(listing.feeBps), 0n) : null;
  const surrenderCopy = r.supported ? "I give up this right. The issuer can recover the nft and my premium isn't refunded." : "I give up this right. The residual beneficiary can recover any remaining backing.";
  return <>
    <header className={styles.header}><Link href="/rights">← Rights</Link><h1>{r.supported && r.assetId !== null ? `Right to nft #${r.assetId}` : "Execution right"}</h1><p>Exercise deadline: {deadlineLabel(r.deadline)}</p><p className={styles.mono}>{account}</p></header>
    <div className={styles.layout}><div className={styles.main}>
      {r.nft && r.assetId != null ? <><TokenMedia src={media.data?.image} alt={`nft #${r.assetId}`} /><p className={styles.mono}>Collection {r.nft}</p><Link href={`/c/${r.nft}/${r.assetId}`}>Underlying nft ↗</Link></> : null}
      <section className={styles.section}><h2>Committed terms</h2><KeyValueRows rows={[
        { key: "State", value: r.effectiveExpired && r.stateCode < 2 ? "Expired, awaiting finalization" : states[r.stateCode] },
        { key: "Exercise price", value: r.price != null ? `${eth(r.price)} eth` : "Unsupported" },
        { key: "Exercise deadline", value: deadlineLabel(r.deadline) },
        { key: "Backing", value: r.backed ? "nft held by this account" : terminal ? "Terminated" : "Not verified" },
        { key: "Current token holder", value: <span className={styles.mono}>{r.holder ?? "Token consumed"}</span> },
        { key: "Issuer", value: <span className={styles.mono}>{r.issuer}</span> },
        { key: "Residual beneficiary", value: <span className={styles.mono}>{r.residual}</span> },
        { key: "Exercise royalty", value: r.stateCode === 0 ? "Committed at activation" : `${eth(r.royaltyAmount)} eth` },
        { key: "Royalty recipient", value: <span className={styles.mono}>{r.royaltyTo ?? "None"}</span> },
        { key: "Proceeds recipient", value: <span className={styles.mono}>{r.proceedsTo ?? "Unknown"}</span> },
      ]} /></section>
      <p className={styles.note}>{r.supported ? "Surrender gives up this entitlement. After surrender or expiry, the issuer can recover the nft. A premium you've already paid isn't refunded. Every successful exercise allocates the committed royalty. Exercise has no trading fee. The nft collection's rules can still freeze, seize, or prevent delivery." : "Surrender gives up this entitlement. The committed residual beneficiary controls terminal recovery. External permissions can remain in their target contracts after termination."}</p>
      {r.configError ? <ErrorNote>{r.configError}</ErrorNote> : null}
      {!r.supported ? <ErrorNote>This handler isn't supported. Inspect its contract before using it. No exercise form is available.</ErrorNote> : null}
    </div><div className={styles.panel}>
      {listing && active ? <section className={styles.section}><h2>Acquire the right</h2><p className={styles.figure}>{eth(price!)} eth</p><p className={styles.note}>Premium only. Buying this token doesn't deliver the underlying nft.</p><KeyValueRows rows={[
        { key: "Separate exercise payment", value: `${eth(r.price ?? 0n)} eth` },
        { key: "Premium plus exercise", value: `${eth(price! + (r.price ?? 0n))} eth`, total: true },
        { key: "Trading fee", value: `${listing.feeBps / 100}% · ${eth(listingSplit!.fee)} eth` },
        { key: "Seller receives", value: `${eth(listingSplit!.proceeds)} eth` },
        { key: "Network gas", value: "Separate, shown by your wallet" },
        { key: "Listing seller", value: <span className={styles.mono}>{listing.owner}</span> },
      ]} /><div className={styles.actions}>
        {!sameAddress(address, listing.owner) ? <Button disabled={!!r.configError || !r.supported} onClick={() => setAction({ title: "Buy the right", label: `Pay at most ${eth(price!)} eth premium`, steps: buySteps(listing) })}>Buy the right</Button> : null}
        {sameAddress(address, listing.owner) ? <Button onClick={() => setAction({ title: "Cancel listing and return token", label: "Cancel listing and return token", steps: cancelSteps(listing, "right") })}>Cancel listing and return token</Button> : null}
      </div><p className={styles.note}>The trading fee is included in the premium. The sale order holds the token. Its former holder can't exercise until the token is returned.</p></section> : null}
      {active && !holder ? <Button href={`/c/${d.rights}/${r.tokenId}/offer`} variant="secondary">Make an offer for this right</Button> : null}
      {canExercise ? <section className={styles.section}><h2>Exercise</h2><label className={styles.label}>nft recipient<InputAddress value={exerciseRecipient} onChange={setExerciseRecipient} placeholder={address} /></label><p className={styles.note}>Pay exactly {eth(r.price!)} eth to receive the nft. Payment collection happens separately.</p><Button disabled={!!exerciseRecipient && !isAddress(exerciseRecipient)} onClick={() => activate("Exercise right", "exercise", exerciseRecipient ? getAddress(exerciseRecipient) : address)}>Exercise for {eth(r.price!)} eth</Button></section> : null}
      {listing && !active && !listing.closed && sameAddress(address, listing.owner) ? <section className={styles.section}><h2>Stale listing</h2><p className={styles.note}>Closing this listing doesn't return an expired token or recover the underlying nft. Anyone can finalize expiry. Only the issuer can recover the backing.</p><Button onClick={() => setAction({ title: "Close stale listing", label: "Close stale listing", steps: [{ key: "close", label: "Close stale listing", call: async c => { await verifyOrder(c.pub, d, { address: listing.address, kind: "sale", config: listing.config, owner: c.account }); return tx.close(listing.address); } }] })}>Close stale listing</Button></section> : null}
      {active && holder ? <section className={styles.section}><h2>Resell</h2><label className={styles.label}>Premium in eth<input inputMode="decimal" value={premium} onChange={e => setPremium(e.target.value)} /></label>{premiumSplit ? <KeyValueRows rows={[
        { key: "Trading fee", value: `${Number(newFee.data!) / 100}% · ${eth(premiumSplit.fee)} eth` },
        { key: "You receive", value: `${eth(premiumSplit.proceeds)} eth`, total: true },
      ]} /> : <p className={styles.note}>{newFee.isError ? "The trading fee couldn't be read." : "Reading trading fee…"}</p>}<Button disabled={parseEth(premium) <= 0n || !premiumSplit || r.configError !== null || r.deadline !== 0n && r.deadline - now <= 7200n} onClick={list}>List the right</Button><p className={styles.note}>The trading fee is included in the premium. {r.deadline === 0n ? "This listing lasts seven days." : "Listing needs more than two hours remaining. It ends one hour before exercise expires."}</p><Link href={`/c/${d.rights}/${r.tokenId}/offer`}>Make a token specific offer ↗</Link></section> : null}
      {active && holder ? <section className={styles.section}><h2>Transfer</h2><label className={styles.label}>Right recipient<InputAddress value={transferRecipient} onChange={setTransferRecipient} /></label><Button variant="secondary" disabled={!isAddress(transferRecipient)} onClick={() => activate("Transfer right", "transfer", getAddress(transferRecipient))}>Transfer entitlement</Button><p className={styles.note}>The backing stays in this account. An approved token operator can also transfer this right.</p></section> : null}
      {r.stateCode === 0 && issuer ? <section className={styles.section}><h2>Pending setup</h2><p className={styles.note}>A deposit sent in a separate transaction stays here if activation fails.</p><div className={styles.actions}>{!r.backed && r.supported && !r.configError && !r.effectiveExpired ? <Button onClick={() => activate("Deposit nft", "deposit")}>Deposit nft</Button> : null}{r.backed && !r.configError && !r.effectiveExpired ? <Button onClick={() => activate("Activate right", "activate")}>Activate right</Button> : null}<Button variant="secondary" onClick={() => activate("Cancel pending setup", "cancel")}>Cancel pending setup</Button></div></section> : null}
      {active && holder ? <section className={styles.section}><h2>Surrender</h2><label className={styles.check}><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />{surrenderCopy}</label><Button variant="secondary" disabled={!ack} onClick={() => activate("Surrender right", "surrender")}>Surrender right</Button></section> : null}
      {r.effectiveExpired && r.stateCode < 2 ? <section className={styles.section}><h2>Expiry</h2><p className={styles.note}>This entitlement can't be exercised or sold. Anyone can finalize it.</p><Button onClick={() => activate("Finalize expiry", "expire")}>Finalize expiry</Button></section> : null}
      {terminal && sameAddress(address, r.residual) && r.backed ? <section className={styles.section}><h2>Recover collateral</h2><Button onClick={() => activate("Recover nft", "recover")}>Recover nft</Button></section> : null}
      {terminal && sameAddress(address, r.residual) && r.balance > r.totalCredits ? <section className={styles.section}><Button variant="secondary" onClick={() => activate("Recover free eth", "recoverEth")}>Recover {eth(r.balance - r.totalCredits)} free eth</Button><p className={styles.note}>Outstanding payment credits stay reserved.</p></section> : null}
      {active && holder && indexed.data?.offers?.length ? <section className={styles.section}><h2>Offers for this right</h2>{indexed.data.offers.map(o => <p key={o.address}><Link href={`/c/${d.rights}/offers/${o.address}/sell`}>Sell for {eth(BigInt(o.priceNow))} eth premium</Link></p>)}</section> : null}
      <section className={styles.section}><h2>Payments</h2>{r.credits.filter(c => c.amount > 0n).map(c => <div key={c.beneficiary}><p className={styles.mono}>{c.beneficiary}</p><p>{eth(c.amount)} eth</p><div className={styles.actions}><Button variant="secondary" onClick={() => activate("Release payment", "release", c.beneficiary)}>Release payment</Button>{sameAddress(address, c.beneficiary) ? <Button variant="secondary" disabled={!!withdrawRecipient && !isAddress(withdrawRecipient)} onClick={() => activate("Withdraw payment", "withdraw", withdrawRecipient ? getAddress(withdrawRecipient) : address)}>Withdraw to recipient</Button> : null}</div></div>)}{r.totalCredits === 0n ? <p className={styles.note}>No unpaid credits.</p> : <><label className={styles.label}>Alternate recipient for your own credit<InputAddress value={withdrawRecipient} onChange={setWithdrawRecipient} placeholder={address} /></label><p className={styles.note}>Anyone can release a payment to its recorded beneficiary. Only that beneficiary can choose another recipient. A failed payout leaves the credit available.</p></>}</section>
      {r.totalCredits > r.credits.reduce((sum, c) => sum + c.amount, 0n) ? <section className={styles.section}><h2>Unresolved payments</h2><p className={styles.note}>There are {eth(r.totalCredits)} eth in outstanding credits. Some beneficiaries could not be identified. Enter a beneficiary to release its recorded credit.</p><label className={styles.label}>Payment beneficiary<InputAddress value={releaseBeneficiary} onChange={setReleaseBeneficiary} /></label><Button disabled={!isAddress(releaseBeneficiary)} onClick={() => activate("Release payment", "release", getAddress(releaseBeneficiary))}>Release recorded credit</Button>{address ? <Button variant="secondary" disabled={!!withdrawRecipient && !isAddress(withdrawRecipient)} onClick={() => activate("Withdraw payment", "withdraw", withdrawRecipient ? getAddress(withdrawRecipient) : address)}>Withdraw your credit</Button> : null}</section> : null}
    </div></div>
    <section className={styles.section}><h2>History</h2>{indexed.data?.history?.map((e, i) => <p className={styles.mono} key={i}>{e.kind.replaceAll("_", " ")} · {when(e.timestamp)}{e.amount ? ` · ${eth(BigInt(e.amount))} eth` : ""}{e.recipient ? ` · nft delivered to ${e.recipient}` : ""}</p>) ?? <p className={styles.note}>History is retained after the token is burned.</p>}</section>
    {action ? <FlowModal title={action.title} ctaLabel={action.label} description={action.destination ? <p className={styles.mono}>Recipient: {action.destination}</p> : undefined} ctx={{ kind: "right" }} steps={action.steps} onDone={() => { if (action.title === "List the right") { setListingSalt(null); setListingAnchor(null); } }} onClose={() => setAction(null)} /> : null}
  </>;
}

function InputAddress({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "0x…"} />;
}
