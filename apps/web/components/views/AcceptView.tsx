"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { sameAddress, type ApiOrder } from "@market/protocol";
import { AcceptOffer, ErrorNote, Loading, type EligibleNft, type AcceptBreakdown } from "@/components/screens";
import { useHead, useIndexer, useApi } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { LagBanner } from "@/components/app/Trading";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { acceptSteps, acceptQuote, isApprovedForBids } from "@/data/flows";

type Owned = { nft: Address; tokenId: string; image: string | null }[];
const ZERO: AcceptBreakdown = { offer: 0n, royalty: 0n, royaltyBps: 0, fee: 0n, receive: 0n };

export function AcceptView({ nft, order: orderAddr }: { nft: Address; order: Address }) {
  const router = useRouter();
  const now = useHead();
  const { address } = useAccount();
  const pub = usePublicClient();
  const order = useIndexer<ApiOrder>(paths.order(orderAddr)).data;
  const holdings = useApi<Owned>(address ? `/api/nfts/owned?owner=${address}&collection=${nft}` : null).data ?? [];

  const eligible: EligibleNft[] = (order?.anyToken ? holdings : holdings.filter((h) => h.tokenId === order?.tokenId))
    .filter((h) => sameAddress(h.nft, nft))
    .map((h) => ({ tokenId: h.tokenId, mediaSrc: h.image }));

  const [selected, setSelected] = useState<string | undefined>();
  useEffect(() => {
    if (!selected && eligible[0]) setSelected(eligible[0].tokenId);
  }, [eligible, selected]);

  const [breakdown, setBreakdown] = useState<AcceptBreakdown>(ZERO);
  const [approved, setApproved] = useState(false);
  useEffect(() => {
    if (!pub || !order || !selected || !address) return;
    let live = true;
    const id = BigInt(selected);
    acceptQuote(pub, order, id)
      .then((q) => {
        if (!live) return;
        const royaltyBps = q.price > 0n ? Number((q.royalty * 10_000n) / q.price) : 0;
        setBreakdown({ offer: q.price, royalty: q.royalty, royaltyBps, fee: q.fee, receive: q.proceeds });
      })
      .catch(() => live && setBreakdown(ZERO));
    isApprovedForBids(pub, nft, address, id).then((a) => live && setApproved(a));
    return () => {
      live = false;
    };
  }, [pub, order, selected, address, nft]);

  const tok = selected ? `#${selected}` : "the NFT";
  const flowSteps = order && selected ? acceptSteps(order, BigInt(selected), tok) : [];
  const { flow, uiSteps } = useFlowUi(flowSteps, { kind: "bid", token: tok });

  if (!order) return <Loading />;
  if (!address) return <ErrorNote>Connect your wallet to sell to this offer.</ErrorNote>;

  return (
    <>
      <LagBanner />
      {eligible.length === 0 ? (
        <ErrorNote>You don&apos;t hold an eligible token for this offer. Cancel a listing first to sell its NFT.</ErrorNote>
      ) : (
        <AcceptOffer
          offer={order}
          now={now}
          eligible={eligible}
          breakdown={breakdown}
          selectedTokenId={selected}
          onSelect={setSelected}
          approved={approved}
          stepsOverride={uiSteps}
          cta={<FlowButton flow={flow} label={approved ? `Sell ${tok}` : `Approve ${tok}`} onDone={() => router.push("/positions")} />}
        />
      )}
    </>
  );
}
