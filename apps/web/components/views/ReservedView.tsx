"use client";

// The local Artwork reserved-action example: issue a reserved palette/renderer change (create ->
// reserve on the deployed order -> activate, fresh salt), inspect a reserved order, execute it with
// an allowed choice for the exact price, and clean up after termination. Reserved orders are not in
// the indexer's positions, so discovery is by address (the issue flow hands you the new address).
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { getAddress, isAddress, decodeAbiParameters, type Address, type Hex } from "viem";
import {
  eth, until, sameAddress, shortAddress, isExpiredAt, decodeReservedConfig, readOrder, erc721Abi,
  OrderState, randomSalt,
} from "@market/protocol";
import { Button, KeyValueRows, StepList } from "@/components/ui";
import { ErrorNote, Loading } from "@/components/screens";
import { useHead } from "@/data/hooks";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { FlowModal } from "./FlowModal";
import {
  ArtworkKind, allowedChoices, artworkIssuancePlan, executeArtworkSteps, artworkColor, artworkRenderer,
  finalizeExpirySteps, releaseSteps,
} from "@/data/flows";
import type { Step } from "@/data/txflow";
import type { ExecutionMode } from "@/data/txflow";
import { DEPLOYMENT as d, IS_ACTIONS, ARTWORK } from "@/lib/deployment";
import { parseEth } from "@/lib/listingConfig";
import { deadlineOf } from "@/lib/orderDisplay";
import styles from "./Rights.module.css";

const KIND_LABEL = ["Palette", "Renderer"];
const parseEthSafe = parseEth;

/** Decode an Artwork operation `abi.encode(tokenId, kind, allowed)`. */
const decodeOperation = (op: Hex) => {
  const [tokenId, kind, allowed] = decodeAbiParameters([{ type: "uint256" }, { type: "uint8" }, { type: "uint256" }], op);
  return { tokenId, kind: Number(kind), allowed };
};

export function ReservedView() {
  const { address } = useAccount();
  const pub = usePublicClient();
  const router = useRouter();
  const [lookup, setLookup] = useState("");

  // Issue form.
  const [tokenId, setTokenId] = useState("");
  const [kind, setKind] = useState<number>(ArtworkKind.Palette);
  const [choices, setChoices] = useState<number[]>([0, 1, 2, 3]);
  const [price, setPrice] = useState("0.1");
  const [targetValue, setTargetValue] = useState("0.05");
  const [deadlineH, setDeadlineH] = useState("24");
  const [mode, setMode] = useState<ExecutionMode>("staged");
  const [salt] = useState(() => randomSalt());
  const [plan, setPlan] = useState<{ steps: Step[]; order: Address } | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  const allowed = useMemo(() => choices.reduce((m, c) => m | (1n << BigInt(c)), 0n), [choices]);
  const now = useHead();

  const valid = IS_ACTIONS && !!ARTWORK && !!address && /^\d+$/.test(tokenId) && allowed > 0n
    && parseEthSafe(price) >= parseEthSafe(targetValue) && parseEthSafe(targetValue) >= 0n && Number(deadlineH) > 0;

  // Resolve the issuance plan (reads the operation + predicts the address) when the form is valid.
  useEffect(() => {
    if (!pub || !address || !ARTWORK || !valid) { setPlan(null); return; }
    let live = true;
    setPlanError(null);
    const deadline = now + BigInt(Math.floor(Number(deadlineH) * 3600));
    artworkIssuancePlan(pub, {
      issuer: address, artwork: ARTWORK, tokenId: BigInt(tokenId), kind, allowed,
      price: parseEthSafe(price), targetValue: parseEthSafe(targetValue), proceedsTo: address, deadline, salt,
    }).then((p) => live && setPlan(p)).catch((e) => live && setPlanError(e instanceof Error ? e.message : "Couldn't prepare the reservation."));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub, address, tokenId, kind, allowed.toString(), price, targetValue, deadlineH]);

  const { flow, uiSteps } = useFlowUi(plan?.steps ?? [], { kind: "reserved" }, mode);

  if (!IS_ACTIONS) return <ErrorNote>This release has no reserved actions.</ErrorNote>;
  if (!ARTWORK) return <ErrorNote>The Artwork example isn&apos;t configured for this deployment.</ErrorNote>;

  return (
    <>
      <header className={styles.header}>
        <h1>Reserved actions</h1>
        <p>Reserve one future Artwork change for an order. The executor pays the set price; the surplus over the amount forwarded to the artist is credited to you.</p>
      </header>
      <div className={styles.toolbar}>
        <input aria-label="Reserved order address" placeholder="Reserved order address" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        {isAddress(lookup) ? <Button variant="text" href={`/reserved/${getAddress(lookup)}`}>Inspect reserved action</Button> : null}
      </div>
      {!address ? <ErrorNote>Connect your wallet to issue a reserved action.</ErrorNote> : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <label className={styles.label}>Artwork token id<input aria-label="Artwork token id" inputMode="numeric" value={tokenId} onChange={(e) => setTokenId(e.target.value)} /></label>
            <label className={styles.label}>Change<select aria-label="Change kind" value={kind} onChange={(e) => setKind(Number(e.target.value))}><option value={ArtworkKind.Palette}>Palette</option><option value={ArtworkKind.Renderer}>Renderer</option></select></label>
            <fieldset className={styles.section}>
              <legend className={styles.label}>Allowed options</legend>
              <div className={styles.actions}>
                {Array.from({ length: 8 }, (_, i) => (
                  <label key={i} className={styles.check}>
                    <input type="checkbox" checked={choices.includes(i)} onChange={(e) => setChoices((cs) => e.target.checked ? [...cs, i].sort((a, b) => a - b) : cs.filter((c) => c !== i))} />{i}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={styles.label}>Price in ETH (executor pays)<input aria-label="Price in ETH" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
            <label className={styles.label}>Forwarded to the artist in ETH<input aria-label="Forwarded to the artist" inputMode="decimal" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} /></label>
            <label className={styles.label}>Deadline in hours<input aria-label="Deadline in hours" inputMode="numeric" value={deadlineH} onChange={(e) => setDeadlineH(e.target.value)} /></label>
          </div>
          <div className={styles.panel}>
            <h2>Reservation</h2>
            <KeyValueRows rows={[
              { key: "Executor pays", value: `${eth(parseEthSafe(price), "up")} ETH` },
              { key: "To the artist", value: `${eth(parseEthSafe(targetValue), "up")} ETH` },
              { key: "Credited to you", value: `${eth(parseEthSafe(price) - parseEthSafe(targetValue))} ETH` },
              { key: "Allowed options", value: choices.join(", ") || "none" },
            ]} />
            <p className={styles.note}>You own this Artwork token; a fresh order address is reserved so a third party can&apos;t poison it. {mode === "staged" ? "Three transactions: create, reserve, activate." : "One atomic batch where your wallet supports it."}</p>
            <div className={styles.mode}>
              <label><input type="radio" name="reservedMode" checked={mode === "staged"} onChange={() => setMode("staged")} disabled={flow.running} />Separate transactions</label>
              <label><input type="radio" name="reservedMode" checked={mode === "atomic"} onChange={() => setMode("atomic")} disabled={flow.running} />Atomic wallet batch</label>
            </div>
            <StepList steps={uiSteps} />
            {planError ? <ErrorNote>{planError}</ErrorNote> : null}
            <FlowButton flow={flow} label="Reserve and activate" disabled={!valid || !plan} onDone={() => plan && router.push(`/reserved/${plan.order}`)} />
            {plan ? <p className={styles.mono}><Link href={`/reserved/${plan.order}`}>Order {shortAddress(plan.order)}</Link></p> : null}
          </div>
        </div>
      )}
    </>
  );
}

type Action = { title: string; label: string; steps: Step[] };

export function ReservedDetailView({ order }: { order: Address }) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const now = useHead();
  const [choice, setChoice] = useState<number | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  const q = useQuery({
    queryKey: ["reserved", d.deploymentId, order],
    enabled: !!pub && IS_ACTIONS,
    retry: false,
    refetchInterval: 4_000,
    queryFn: async () => {
      const info = await readOrder(pub!, d, order);
      if (info.kind !== "reserved") throw new Error("This account is not a reserved action.");
      const cfg = decodeReservedConfig(info.config);
      const op = decodeOperation(cfg.operation as Hex);
      const target = cfg.target;
      const isArtwork = !!ARTWORK && sameAddress(target, ARTWORK);
      const [curColor, curRenderer, holder] = await Promise.all([
        isArtwork ? artworkColor(pub!, target, op.tokenId).catch(() => null) : Promise.resolve(null),
        isArtwork ? artworkRenderer(pub!, target, op.tokenId).catch(() => null) : Promise.resolve(null),
        pub!.readContract({ address: d.actions!, abi: erc721Abi, functionName: "ownerOf", args: [BigInt(order)] }).catch(() => null),
      ]);
      return { info, cfg, op, isArtwork, curColor, curRenderer, holder };
    },
  });

  if (!IS_ACTIONS) return <ErrorNote>This release has no reserved actions.</ErrorNote>;
  if (q.error) return <ErrorNote>{q.error.message}</ErrorNote>;
  if (!q.data) return <Loading />;
  const { info, cfg, op, isArtwork, curColor, curRenderer } = q.data;
  const o = { address: order, kind: "reserved", config: info.config, deadline: info.deadline.toString() } as unknown as import("@market/protocol").ApiOrder;
  const expired = isExpiredAt(info.deadline, now);
  const active = info.isLive && !expired;
  const terminal = info.state >= OrderState.Completed;
  const isResidual = sameAddress(address, info.residual);
  const options = allowedChoices(op.allowed);
  const run = (title: string, label: string, steps: Step[]) => setAction({ title, label, steps });

  return (
    <>
      <header className={styles.header}>
        <Link href="/reserved">← Reserved actions</Link>
        <h1>{isArtwork ? `${KIND_LABEL[op.kind]} change · token #${op.tokenId.toString()}` : "Reserved action"}</h1>
        <p>Deadline: {info.deadline === 0n ? "Perpetual" : until(deadlineOf(o), now)}</p>
        <p className={styles.mono}>{order}</p>
      </header>
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section}>
            <h2>Committed terms</h2>
            <KeyValueRows rows={[
              { key: "State", value: expired && info.state < OrderState.Completed ? "Expired, awaiting finalization" : ["Pending", "Live", "Executed", "Cancelled", "Expired", "Surrendered"][info.state] ?? String(info.state) },
              { key: "Target", value: <span className={styles.mono}>{cfg.target}</span> },
              { key: "Price", value: `${eth(cfg.price, "up")} ETH` },
              { key: "Forwarded to target", value: `${eth(cfg.targetValue, "up")} ETH` },
              { key: "Surplus credited to", value: <span className={styles.mono}>{cfg.proceedsTo}</span> },
              ...(isArtwork ? [
                { key: "Change", value: `${KIND_LABEL[op.kind]} → one of ${options.join(", ")}` },
                { key: "Current palette", value: curColor != null ? String(curColor) : "—" },
                { key: "Current renderer", value: curRenderer != null ? String(curRenderer) : "—" },
              ] : []),
            ]} />
          </section>
        </div>
        <div className={styles.panel}>
          {active ? (
            <section className={styles.section}>
              <h2>Execute</h2>
              <label className={styles.label}>Choice<select aria-label="Choice" value={choice ?? ""} onChange={(e) => setChoice(e.target.value === "" ? null : Number(e.target.value))}><option value="">Choose an allowed option</option>{options.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
              <p className={styles.note}>Pay exactly {eth(cfg.price, "up")} ETH to apply the change.</p>
              <Button disabled={choice === null} onClick={() => choice !== null && run("Execute", `Execute for ${eth(cfg.price, "up")} ETH`, executeArtworkSteps(o, choice, cfg.price))}>Execute</Button>
            </section>
          ) : null}
          {expired && info.state < OrderState.Completed ? (
            <section className={styles.section}>
              <h2>Expiry</h2>
              <p className={styles.note}>This reservation passed its deadline. Anyone can finalize it.</p>
              <Button onClick={() => run("Finalize expiry", "Finalize expiry", finalizeExpirySteps(o))}>Finalize expiry</Button>
            </section>
          ) : null}
          {terminal && isResidual && info.freeBalance > 0n ? (
            <section className={styles.section}>
              <h2>Recover</h2>
              <Button variant="secondary" onClick={() => run("Recover", "Recover backing", releaseSteps(o, info.residual))}>Recover to residual</Button>
            </section>
          ) : null}
        </div>
      </div>
      {action ? <FlowModal title={action.title} ctaLabel={action.label} ctx={{ kind: "reserved" }} steps={action.steps} onClose={() => setAction(null)} /> : null}
    </>
  );
}
