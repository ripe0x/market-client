"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { eth, sameAddress, erc721Abi, type ApiPositions, type ApiFill, type ApiOrder, type Page, type ErrorContext, type ActionKind } from "@market/protocol";
import { Positions, ApprovalsRow, Loading, ErrorNote } from "@/components/screens";
import { useHead, useIndexer } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { LagBanner } from "@/components/app/Trading";
import { CoveredSection } from "./RightsView";
import { FlowModal } from "./FlowModal";
import { cancelSteps, depositStep, topUpSteps, revokeAllSteps } from "@/data/flows";
import type { Step as FlowStep } from "@/data/txflow";
import { priceNow, remaining } from "@/lib/orderDisplay";
import { DEPLOYMENT, IS_ACTIONS } from "@/lib/deployment";

type FlowAction = { title: string; label: string; steps: FlowStep[]; ctx: ErrorContext };

/** The ErrorContext kind for an order; an unrecognized action falls back to the generic "action". */
const ctxKind = (k: ActionKind): ErrorContext["kind"] => (k === "unknown" ? "action" : k);

export function PositionsView() {
  const now = useHead();
  const { address } = useAccount();
  const pub = usePublicClient();

  const positions = useIndexer<ApiPositions>(address ? paths.positions(address) : null).data;
  const activity = useIndexer<Page<ApiFill>>(address ? paths.activity(address) : null).data;
  const collections = useIndexer<{ address: Address; name: string | null }[]>(paths.collections({})).data ?? [];

  const [action, setAction] = useState<FlowAction | null>(null);
  const [topUp, setTopUp] = useState<ApiOrder | null>(null);

  // Approve-all approvals a seller may have granted ExchangeAction for incoming bids (A1 — the
  // approval target is ExchangeAction, never an order), listed by collection so they can be revoked.
  const [approvals, setApprovals] = useState<{ nft: Address; name: string | null }[]>([]);
  useEffect(() => {
    if (!pub || !address || !IS_ACTIONS || collections.length === 0) return;
    let live = true;
    Promise.all(
      collections.map(async (c) => {
        const ok = await pub
          .readContract({ address: c.address, abi: erc721Abi, functionName: "isApprovedForAll", args: [address, DEPLOYMENT.exchange!] })
          .catch(() => false);
        return ok ? { nft: c.address, name: c.name } : null;
      }),
    ).then((rows) => live && setApprovals(rows.filter((r): r is { nft: Address; name: string | null } => !!r)));
    return () => {
      live = false;
    };
  }, [pub, address, collections]);

  if (!address) return <ErrorNote>Connect your wallet to see your positions.</ErrorNote>;
  if (!positions) return <Loading />;

  const ctxOf = (o: ApiOrder): ErrorContext => ({ kind: ctxKind(o.kind), owner: true, token: `#${o.tokenId}` });

  const onCancel = (o: ApiOrder) =>
    setAction({
      title: o.kind === "sale" ? "Cancel and withdraw" : "Cancel offer",
      label: o.kind === "sale" ? "Cancel and withdraw" : `Cancel and refund ${eth(BigInt(o.balance))}`,
      steps: cancelSteps(o),
      ctx: ctxOf(o),
    });
  const onWithdraw = (o: ApiOrder) =>
    setAction({
      title: "Recover",
      label: o.kind === "sale" ? `Recover #${o.tokenId}` : `Withdraw ${eth(BigInt(o.balance))} ETH`,
      steps: cancelSteps(o),
      ctx: ctxOf(o),
    });
  const onMoveNft = (o: ApiOrder) =>
    setAction({ title: "Move into listing", label: `Move #${o.tokenId} into it`, steps: depositStep(o, `#${o.tokenId}`), ctx: ctxOf(o) });

  const suggested = topUp
    ? (() => {
        const need = priceNow(topUp, now) * BigInt(remaining(topUp)) - BigInt(topUp.balance);
        return need > 0n ? need : 0n;
      })()
    : undefined;

  return (
    <>
      <LagBanner />
      <Positions
        viewer={address}
        listings={positions.listings}
        offers={positions.offers}
        activity={activity?.items ?? []}
        now={now}
        onCancel={onCancel}
        onWithdraw={onWithdraw}
        onMoveNft={onMoveNft}
        onAddFunds={(o) => setTopUp(o)}
      />
      {IS_ACTIONS && positions.rights && positions.rights.length ? (
        <div className="gutter"><CoveredSection items={positions.rights} viewer={address} /></div>
      ) : null}
      <ApprovalsRow
        items={approvals.map((a) => ({
          label: `Approval for all ${a.name ?? "this collection"}`,
          onRemove: () => setAction({ title: "Remove approval", label: `Remove approval for all ${a.name ?? "collection"}`, steps: revokeAllSteps(a.nft, a.name ?? "collection"), ctx: { kind: "bid" } }),
        }))}
      />

      {action && <FlowModal title={action.title} ctaLabel={action.label} ctx={action.ctx} steps={action.steps} onClose={() => setAction(null)} />}
      {topUp && (
        <FlowModal
          title="Add funds"
          ctaLabel="Add funds"
          ctx={{ kind: "bid", owner: true }}
          amount={{ suggested, build: (v) => topUpSteps(topUp, v) }}
          onClose={() => setTopUp(null)}
        />
      )}
    </>
  );
}
