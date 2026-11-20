"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import {
  eth, until, sameAddress, shortAddress, isExpiredAt, decodeCoveredConfig, readOrder,
  erc721Abi, OrderState, type ApiOrder, type ApiPositions,
} from "@market/protocol";
import { getAddress, isAddress, type Address } from "viem";
import { Button, KeyValueRows, TokenMedia } from "@/components/ui";
import { ErrorNote, Loading } from "@/components/screens";
import { useHead, useIndexer, useApi } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { DEPLOYMENT as d, IS_ACTIONS } from "@/lib/deployment";
import { deadlineOf } from "@/lib/orderDisplay";
import {
  exerciseSteps, surrenderSteps, finalizeExpirySteps, cancelSteps, releaseSteps,
  withdrawSurplusSteps, releaseCreditSteps, withdrawCreditSteps,
} from "@/data/flows";
import { FlowModal } from "./FlowModal";
import type { Step } from "@/data/txflow";
import styles from "./Rights.module.css";

const STATE_WORDS = ["Pending setup", "Active", "Exercised", "Cancelled", "Expired", "Surrendered"];
const deadlineLabel = (deadline: bigint, now: bigint) =>
  deadline === 0n ? "Perpetual" : `${new Date(Number(deadline) * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")} · ${until(deadline, now)}`;

/** Covered purchase orders a wallet issued or holds. Used on the positions page too. */
export function CoveredSection({ items, title = "Purchase rights" }: { items: ApiOrder[]; viewer?: Address; title?: string }) {
  const now = useHead();
  return (
    <section className={styles.section}>
      <h2>{title}</h2>
      {!items.length ? (
        <p className={styles.note}>No purchase rights here yet.</p>
      ) : (
        <table className={styles.table}>
          <thead><tr><th>Right</th><th>Status</th><th>Exercise price</th><th>Deadline</th></tr></thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.address}>
                <td>
                  <Link href={`/rights/${o.address}`}>{o.tokenId != null ? `${o.collectionName ?? "NFT"} #${o.tokenId}` : "Purchase right"}</Link>
                  <div className={styles.mono}>{shortAddress(o.address)}</div>
                </td>
                <td>{o.status}</td>
                <td>{o.price != null ? `${eth(BigInt(o.price))} ETH` : "—"}</td>
                <td>{o.deadline === "0" ? "Perpetual" : until(deadlineOf(o), now)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function RightsView() {
  const { address } = useAccount();
  const [lookup, setLookup] = useState("");
  const positions = useIndexer<ApiPositions>(address ? paths.positions(address) : null).data;
  if (!IS_ACTIONS) return <ErrorNote>This release has no covered purchase rights. Your positions are still available.</ErrorNote>;
  return (
    <>
      <header className={styles.header}>
        <h1>Purchase rights</h1>
        <p>Hold a right now. Pay its fixed exercise price before the deadline to receive the underlying NFT.</p>
      </header>
      <div className={styles.toolbar}>
        <Button href="/rights/issue">Issue a right</Button>
        <Button variant="text" href="/positions">Your positions</Button>
        <input aria-label="Backing account address" placeholder="Backing account address" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        {isAddress(lookup) ? <Button variant="text" href={`/rights/${getAddress(lookup)}`}>Inspect right</Button> : null}
      </div>
      <CoveredSection items={positions?.rights ?? []} viewer={address} title="Your purchase rights" />
    </>
  );
}

type Action = { title: string; label: string; steps: Step[]; recipient?: Address };

export function RightDetailView({ account }: { account: Address }) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const now = useHead();
  const indexed = useIndexer<ApiOrder>(IS_ACTIONS ? paths.order(account) : null).data;
  const live = useQuery({
    queryKey: ["covered", d.deploymentId, account],
    enabled: !!pub && IS_ACTIONS,
    retry: false,
    refetchInterval: 4_000,
    queryFn: async () => {
      const info = await readOrder(pub!, d, account);
      if (info.kind !== "covered") throw new Error("This account is not a covered purchase right.");
      const cfg = decodeCoveredConfig(info.config);
      const [holder, tokenOwner] = await Promise.all([
        pub!.readContract({ address: d.actions!, abi: erc721Abi, functionName: "ownerOf", args: [BigInt(account)] }).catch(() => null),
        pub!.readContract({ address: cfg.nft, abi: erc721Abi, functionName: "ownerOf", args: [cfg.tokenId] }).catch(() => null),
      ]);
      return { info, cfg, holder, backed: sameAddress(tokenOwner, account) };
    },
  });

  const [action, setAction] = useState<Action | null>(null);
  const [exerciseRecipient, setExerciseRecipient] = useState("");
  const [surplusRecipient, setSurplusRecipient] = useState("");
  const [creditBeneficiary, setCreditBeneficiary] = useState("");
  const [withdrawRecipient, setWithdrawRecipient] = useState("");
  const [ack, setAck] = useState(false);

  const media = useApi<{ image?: string }>(live.data ? `/api/nfts/token?nft=${live.data.cfg.nft}&id=${live.data.cfg.tokenId}` : null);

  if (!IS_ACTIONS) return <ErrorNote>This release doesn&apos;t support covered purchase rights.</ErrorNote>;
  if (live.error) return <ErrorNote>{live.error.message}</ErrorNote>;
  if (!live.data) return <Loading />;

  const { info, cfg, holder, backed } = live.data;
  // `o` is the minimal order the flows read (address, kind, nft, tokenId, config, balance,
  // collectionName). Every flow re-reads and re-authenticates the chain before signing.
  const o = {
    address: account, kind: "covered", nft: cfg.nft, tokenId: cfg.tokenId.toString(),
    config: info.config, collectionName: indexed?.collectionName ?? null, balance: info.freeBalance.toString(),
    deadline: info.deadline.toString(),
  } as unknown as ApiOrder;

  const expired = isExpiredAt(info.deadline, now);
  const active = info.isLive && !expired;
  const pending = info.state === OrderState.Pending;
  const terminal = info.state >= OrderState.Completed;
  const isHolder = sameAddress(address, holder);
  const isIssuer = sameAddress(address, info.issuer);
  const isResidual = sameAddress(address, info.residual);

  const run = (title: string, label: string, steps: Step[], recipient?: Address) => setAction({ title, label, steps, recipient });

  return (
    <>
      <header className={styles.header}>
        <Link href="/rights">← Rights</Link>
        <h1>Right to {cfg.nft ? `#${cfg.tokenId}` : "NFT"}</h1>
        <p>Exercise deadline: {deadlineLabel(info.deadline, now)}</p>
        <p className={styles.mono}>{account}</p>
      </header>
      <div className={styles.layout}>
        <div className={styles.main}>
          <TokenMedia src={media.data?.image} alt={`NFT #${cfg.tokenId}`} />
          <p className={styles.mono}>Collection {cfg.nft}</p>
          <Link href={`/c/${cfg.nft}/${cfg.tokenId}`}>Underlying NFT ↗</Link>
          <section className={styles.section}>
            <h2>Committed terms</h2>
            <KeyValueRows rows={[
              { key: "State", value: expired && info.state < OrderState.Completed ? "Expired, awaiting finalization" : STATE_WORDS[info.state] ?? String(info.state) },
              { key: "Exercise price", value: `${eth(cfg.price)} ETH` },
              { key: "Exercise deadline", value: deadlineLabel(info.deadline, now) },
              { key: "Backing", value: backed ? "NFT held by this account" : terminal ? "Recovered" : "Not held" },
              { key: "Current holder", value: <span className={styles.mono}>{holder ?? "Token consumed"}</span> },
              { key: "Issuer", value: <span className={styles.mono}>{info.issuer}</span> },
              { key: "Residual beneficiary", value: <span className={styles.mono}>{info.residual}</span> },
              { key: "Proceeds recipient", value: <span className={styles.mono}>{cfg.proceedsTo}</span> },
              { key: "Max exercise royalty", value: `${cfg.maxRoyaltyBps / 100}%` },
            ]} />
          </section>
          <p className={styles.note}>Exercise pays the issuer&apos;s proceeds recipient and delivers the NFT with no trading fee. Surrender or expiry returns the NFT to the residual beneficiary. The collection&apos;s own rules can still affect delivery.</p>
        </div>
        <div className={styles.panel}>
          {active && isHolder ? (
            <section className={styles.section}>
              <h2>Exercise</h2>
              <label className={styles.label}>NFT recipient<InputAddress value={exerciseRecipient} onChange={setExerciseRecipient} placeholder={address} /></label>
              <p className={styles.note}>Pay exactly {eth(cfg.price, "up")} ETH to receive the NFT.</p>
              <Button disabled={!!exerciseRecipient && !isAddress(exerciseRecipient)} onClick={() => run("Exercise", `Exercise for ${eth(cfg.price, "up")} ETH`, exerciseSteps(o, exerciseRecipient ? getAddress(exerciseRecipient) : address!), exerciseRecipient ? getAddress(exerciseRecipient) : address)}>Exercise for {eth(cfg.price, "up")} ETH</Button>
            </section>
          ) : null}
          {active && !isHolder ? (
            <Button href={`/c/${d.actions}/${BigInt(account).toString()}/offer`} variant="secondary">Make an offer for this right</Button>
          ) : null}
          {active && isHolder ? (
            <section className={styles.section}>
              <h2>Surrender</h2>
              <label className={styles.check}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />I give up this right. The residual beneficiary recovers the NFT.</label>
              <Button variant="secondary" disabled={!ack} onClick={() => run("Surrender", "Surrender the right", surrenderSteps(o))}>Surrender the right</Button>
            </section>
          ) : null}
          {pending && isIssuer ? (
            <section className={styles.section}>
              <h2>Pending setup</h2>
              <p className={styles.note}>Cancel returns the escrowed NFT to you.</p>
              <Button variant="secondary" onClick={() => run("Cancel pending setup", "Cancel and recover", cancelSteps(o))}>Cancel and recover</Button>
            </section>
          ) : null}
          {expired && info.state < OrderState.Completed ? (
            <section className={styles.section}>
              <h2>Expiry</h2>
              <p className={styles.note}>This right has passed its deadline. Anyone can finalize it; the issuer then recovers the NFT.</p>
              <Button onClick={() => run("Finalize expiry", "Finalize expiry", finalizeExpirySteps(o))}>Finalize expiry</Button>
            </section>
          ) : null}
          {terminal && isResidual && backed ? (
            <section className={styles.section}>
              <h2>Recover backing</h2>
              <KeyValueRows rows={[{ key: "NFT", value: <span className={styles.mono}>{cfg.nft} #{cfg.tokenId.toString()}</span> }, { key: "Destination", value: <span className={styles.mono}>{info.residual}</span> }]} />
              <Button onClick={() => run("Recover backing", "Recover the NFT", releaseSteps(o, info.residual))}>Recover the NFT</Button>
            </section>
          ) : null}
          {terminal && isResidual && info.freeBalance > 0n ? (
            <section className={styles.section}>
              <h2>Free ETH</h2>
              <label className={styles.label}>Recipient<InputAddress value={surplusRecipient} onChange={setSurplusRecipient} placeholder={address} /></label>
              <Button variant="secondary" disabled={!!surplusRecipient && !isAddress(surplusRecipient)} onClick={() => run("Withdraw free ETH", `Withdraw ${eth(info.freeBalance)} ETH`, withdrawSurplusSteps(o, surplusRecipient ? getAddress(surplusRecipient) : info.residual))}>Withdraw {eth(info.freeBalance)} ETH</Button>
              <p className={styles.note}>Outstanding payment credits stay reserved.</p>
            </section>
          ) : null}
          {info.totalCredits > 0n ? (
            <section className={styles.section}>
              <h2>Payments</h2>
              <p className={styles.note}>{eth(info.totalCredits)} ETH in reserved credits. Anyone can release a credit to its recorded beneficiary; a beneficiary can send its own credit anywhere.</p>
              <label className={styles.label}>Beneficiary<InputAddress value={creditBeneficiary} onChange={setCreditBeneficiary} /></label>
              <div className={styles.actions}>
                <Button variant="secondary" disabled={!isAddress(creditBeneficiary)} onClick={() => run("Release payment", "Release payment", releaseCreditSteps(o, getAddress(creditBeneficiary)), getAddress(creditBeneficiary))}>Release to beneficiary</Button>
                {address ? <Button variant="secondary" disabled={!!withdrawRecipient && !isAddress(withdrawRecipient)} onClick={() => run("Withdraw your payment", "Withdraw your payment", withdrawCreditSteps(o, withdrawRecipient ? getAddress(withdrawRecipient) : address), withdrawRecipient ? getAddress(withdrawRecipient) : address)}>Withdraw your credit</Button> : null}
              </div>
              <label className={styles.label}>Alternate recipient for your own credit<InputAddress value={withdrawRecipient} onChange={setWithdrawRecipient} placeholder={address} /></label>
            </section>
          ) : null}
          {/* TODO acquireAndExecute: atomic buy-and-exercise needs the resale listing's address and
              activation-terms hash, which require an indexer order lookup not yet available. Wire
              acquireSteps(params, value) once the indexer exposes the listing for an Actions token. */}
        </div>
      </div>
      {action ? (
        <FlowModal
          title={action.title}
          ctaLabel={action.label}
          description={action.recipient ? <p className={styles.mono}>Recipient: {action.recipient}</p> : undefined}
          ctx={{ kind: "covered", owner: isIssuer || isHolder }}
          steps={action.steps}
          onClose={() => setAction(null)}
        />
      ) : null}
    </>
  );
}

function InputAddress({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "0x…"} />;
}
