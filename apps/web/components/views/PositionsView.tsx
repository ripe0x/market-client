"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { eth, sameAddress, erc721Abi, type ApiPositions, type ApiFill, type ApiOrder, type Page, type ErrorContext } from "@market/protocol";
import { Positions, ApprovalsRow, Loading, ErrorNote } from "@/components/screens";
import { useHead, useIndexer } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { LagBanner } from "@/components/app/Trading";
import { RightsSection } from "./RightsView";
import { FlowModal } from "./FlowModal";
import { cancelSteps, depositStep, topUpSteps, revokeAllSteps } from "@/data/flows";
import type { Step as FlowStep } from "@/data/txflow";
import { priceNow } from "@/lib/orderDisplay";
import { DEPLOYMENT } from "@/lib/deployment";

type FlowAction = { title: string; label: string; steps: FlowStep[]; ctx: ErrorContext };

export function PositionsView() {
  const now = useHead();
  const { address } = useAccount();
  const pub = usePublicClient();

  const positions = useIndexer<ApiPositions>(address ? paths.positions(address) : null).data;
  const activity = useIndexer<Page<ApiFill>>(address ? paths.activity(address) : null).data;
  const collections = useIndexer<{ address: Address; name: string | null }[]>(paths.collections({})).data ?? [];

  const [action, setAction] = useState<FlowAction | null>(null);
  const [topUp, setTopUp] = useState<ApiOrder | null>(null);

  // Approve-all approvals to NFTBid, by collection (PLAN.md §8.1).
  const [approvals, setApprovals] = useState<{ nft: Address; name: string | null }[]>([]);
  useEffect(() => {
    if (!pub || !address || collections.length === 0) return;
    let live = true;
    Promise.all(
      collections.map(async (c) => {
        const ok = await pub
          .readContract({ address: c.address, abi: erc721Abi, functionName: "isApprovedForAll", args: [address, DEPLOYMENT.nftBid] })
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

  const ctxOf = (o: ApiOrder): ErrorContext => ({ kind: o.kind, owner: true, token: `#${o.tokenId}` });

  const closeOnly = (o: ApiOrder) => !!o.rightAccount && o.rightTransferable === false;
  const onCancel = (o: ApiOrder) =>
    setAction({
      title: closeOnly(o) ? "Close stale listing" : o.kind === "sale" ? "Cancel and withdraw" : "Cancel offer",
      label: closeOnly(o) ? "Close stale listing" : o.kind === "sale" ? "Cancel and withdraw" : `Cancel and refund ${eth(BigInt(o.balance))}`,
      steps: cancelSteps(o, `#${o.tokenId}`),
      ctx: ctxOf(o),
    });
  const onWithdraw = (o: ApiOrder) =>
    setAction({
      title: "Withdraw",
      label: o.kind === "sale" ? `Withdraw #${o.tokenId}` : `Withdraw ${eth(BigInt(o.balance))} ETH`,
      steps: cancelSteps(o, `#${o.tokenId}`),
      ctx: ctxOf(o),
    });
  const onMoveNft = (o: ApiOrder) =>
    setAction({ title: "Move into listing", label: `Move #${o.tokenId} into it`, steps: depositStep(o, `#${o.tokenId}`), ctx: ctxOf(o) });

  const suggested = topUp
    ? (() => {
        const rem = (topUp.maxFills === "0" ? 1n : BigInt(topUp.maxFills)) - BigInt(topUp.fills);
        const need = priceNow(topUp, now) * rem - BigInt(topUp.balance);
        return need > 0n ? need : 0n;
      })()
    : undefined;

  return (
    <>
      <LagBanner />
      <Positions
        viewer={address}
        listings={positions.listings.map(o => {
          const r = positions.rights?.find(r => sameAddress(r.account, o.rightAccount));
          return r ? { ...o, rightTransferable: r.state === 1 && (r.deadline === "0" || now < BigInt(r.deadline)) } : o;
        })}
        offers={positions.offers}
        activity={activity?.items ?? []}
        now={now}
        onCancel={onCancel}
        onWithdraw={onWithdraw}
        onMoveNft={onMoveNft}
        onAddFunds={(o) => setTopUp(o)}
      />
      {DEPLOYMENT.rights ? <div className="gutter"><RightsSection items={positions.rights ?? []} /></div> : null}
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
