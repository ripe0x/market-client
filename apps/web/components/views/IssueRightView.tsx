"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { useRouter } from "next/navigation";
import { getAddress, isAddress, parseEther, formatEther, type Address, type Hex } from "viem";
import { randomSalt, type ApiCollection } from "@market/protocol";
import { Button, StepList } from "@/components/ui";
import { ErrorNote } from "@/components/screens";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { useIndexer, useApi } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { issuanceSteps, predictedRight, rightDraftKey, type RightDraft } from "@/data/rightsFlows";
import { DEPLOYMENT as d } from "@/lib/deployment";
import type { ExecutionMode } from "@/data/txflow";
import styles from "./Rights.module.css";

type Form = { nft: string; tokenId: string; priceEth: string; deadline: string; maxRoyaltyBps: number; salt: Hex };
const fresh = (): Form => ({ nft: "", tokenId: "", priceEth: "", deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16), maxRoyaltyBps: 1000, salt: randomSalt() });

export function IssueRightView() {
  const router = useRouter();
  const { address } = useAccount();
  const pub = usePublicClient();
  const [form, setForm] = useState<Form>(fresh);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [mode, setMode] = useState<ExecutionMode>("staged");
  const [predicted, setPredicted] = useState<Address | null>(null);
  const key = address ? rightDraftKey(address) : null;
  const collections = useIndexer<ApiCollection[]>(paths.collections({})).data ?? [];
  const owned = useApi<{ nft: Address; tokenId: string; collectionName?: string }[]>(address && collections.length ? `/api/nfts/owned?owner=${address}&${collections.map(c => `collection=${c.address}`).join("&")}` : null);
  useEffect(() => {
    if (!key) return;
    let restored = fresh();
    try { const raw = localStorage.getItem(key); if (raw) restored = { ...restored, ...JSON.parse(raw) }; } catch {}
    setForm(restored); setLoaded(key);
  }, [key]);
  useEffect(() => { if (key && loaded === key) localStorage.setItem(key, JSON.stringify(form)); }, [key, loaded, form]);
  let draft: RightDraft | null = null;
  try {
    if (Number.isInteger(form.maxRoyaltyBps) && form.maxRoyaltyBps >= 0 && form.maxRoyaltyBps <= 10000 && isAddress(form.nft) && /^\d{1,78}$/.test(form.tokenId) && parseEther(form.priceEth) > 0n && Number.isFinite(Date.parse(form.deadline)))
      draft = { nft: getAddress(form.nft), tokenId: form.tokenId, price: parseEther(form.priceEth).toString(), deadline: BigInt(Math.floor(Date.parse(`${form.deadline}Z`) / 1000)).toString(), maxRoyaltyBps: form.maxRoyaltyBps, salt: form.salt };
  } catch {}
  const serialized = draft ? JSON.stringify(draft) : null;
  const steps = useMemo(() => serialized ? issuanceSteps(JSON.parse(serialized)) : [], [serialized]);
  const { flow, uiSteps } = useFlowUi(steps, { kind: "right" }, mode);
  useEffect(() => {
    if (!pub || !address || !serialized) return setPredicted(null);
    let live = true;
    predictedRight({ pub, account: address, results: {} }, JSON.parse(serialized)).then(a => live && setPredicted(a)).catch(() => live && setPredicted(null));
    return () => { live = false; };
  }, [pub, address, serialized]);
  const frozen = flow.running || flow.states[0] === "done";
  const field = (name: keyof Form, value: string | number) => setForm(f => ({ ...f, [name]: value }));
  return <>
    <header className={styles.header}><Link href="/rights">← Rights</Link><h1>Issue a right</h1><p>Commit an nft to a fixed exercise price. The holder can sell the right or pay that price before the deadline to receive the nft.</p></header>
    {!d.rights ? <ErrorNote>This release doesn't support native rights.</ErrorNote> : !address ? <ErrorNote>Connect your wallet to issue a right.</ErrorNote> : <div className={styles.layout}>
      <div className={styles.main}>
        <label className={styles.label}>Owned nft<select aria-label="Owned nft" disabled={frozen} value="" onChange={e => { const [nft = "", tokenId = ""] = e.target.value.split(":"); setForm(f => ({ ...f, nft, tokenId })); }}><option value="">Choose an owned nft, or enter its address below</option>{owned.data?.map(n => <option key={`${n.nft}:${n.tokenId}`} value={`${n.nft}:${n.tokenId}`}>{n.collectionName ?? n.nft} #{n.tokenId}</option>)}</select></label>
        <label className={styles.label}>Collection address<input aria-label="nft collection address" value={form.nft} disabled={frozen} onChange={e => field("nft", e.target.value)} /></label>
        <label className={styles.label}>Token id<input aria-label="nft token id" inputMode="numeric" value={form.tokenId} disabled={frozen} onChange={e => field("tokenId", e.target.value)} /></label>
        <label className={styles.label}>Exercise price in eth<input aria-label="Exercise price in eth" inputMode="decimal" value={form.priceEth} disabled={frozen} onChange={e => field("priceEth", e.target.value)} /></label>
        <label className={styles.label}>Exercise deadline (UTC)<input aria-label="Exercise deadline" type="datetime-local" value={form.deadline} disabled={frozen} onChange={e => field("deadline", e.target.value)} /></label>
        <label className={styles.label}>Maximum exercise royalty<select aria-label="Maximum exercise royalty" disabled={frozen} value={form.maxRoyaltyBps} onChange={e => field("maxRoyaltyBps", Number(e.target.value))}>{[0, 250, 500, 750, 1000, 10000].map(n => <option key={n} value={n}>{n / 100}%</option>)}</select></label>
      </div>
      <div className={styles.panel}><h2>Commitment</h2><p className={styles.note}>After activation, you can't withdraw the nft through Market while the right is live. A holder's surrender or expiry releases the collateral to you. You can surrender an unsold or bought-back right. The nft collection's own rules can still affect delivery.</p><p className={styles.mono}>Issuer and residual beneficiary<br />{address}</p>
        <div className={styles.mode}><label><input type="radio" name="issuanceMode" checked={mode === "staged"} onChange={() => setMode("staged")} disabled={flow.running} />Separate transactions</label><label><input type="radio" name="issuanceMode" checked={mode === "atomic"} onChange={() => setMode("atomic")} disabled={flow.running} />Atomic wallet batch</label></div>
        <p className={styles.note}>{mode === "staged" ? "Create, deposit, and activate in three transactions. A failed activation won't undo an earlier deposit. You can resume or cancel the pending setup." : "Your wallet must execute all calls atomically. If preparation fails, nothing is sent. This flow won't switch to separate transactions automatically."}</p>
        <StepList steps={uiSteps} />
        <FlowButton flow={flow} label="Issue and activate right" disabled={!draft || loaded !== key || !steps.length} onDone={() => { if (key) localStorage.removeItem(key); if (predicted) router.push(`/rights/${predicted}`); }} />
        {predicted ? <p className={styles.mono}><Link href={`/rights/${predicted}`}>Pending account {predicted}</Link></p> : null}
        {frozen && !flow.running ? <Button variant="text" onClick={() => { setForm(fresh()); flow.reset(); }}>Start another issuance</Button> : null}
      </div>
    </div>}
  </>;
}
