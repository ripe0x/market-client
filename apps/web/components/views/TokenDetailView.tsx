"use client";

import { useAccount } from "wagmi";
import type { Address } from "viem";
import { eth, when, until, sameAddress, priceAt, type ApiOrder } from "@market/protocol";
import { TokenDetail, ErrorNote, Loading, type TokenOffer } from "@/components/screens";
import { Button } from "@/components/ui";
import { useHead, useIndexer, useApi } from "@/data/hooks";
import { paths, type TokenView } from "@/data/indexer";
import { LagBanner, useRoyaltyBps } from "@/components/app/Trading";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { buySteps } from "@/data/flows";
import { buyMaxPrice, controllerOf, deadlineOf, remaining, scheduleOf } from "@/lib/orderDisplay";

const statusNote = (o: ApiOrder, now: bigint): string | null => {
  const s = scheduleOf(o);
  switch (o.status) {
    case "not_started":
      return `This listing opens ${when(s.startTime, now)}.`;
    case "expired":
      return `This listing expired ${when(deadlineOf(o), now)}.`;
    case "awaiting_nft":
      return "This listing isn't ready: its NFT hasn't been deposited yet.";
    case "blocked":
      return "Sale stopped: the collection's royalty is above the seller's limit.";
    default:
      return null;
  }
};

export function TokenDetailView({ nft, tokenId }: { nft: Address; tokenId: string }) {
  const now = useHead();
  const { address } = useAccount();
  const token = useIndexer<TokenView>(paths.token(nft, tokenId)).data;
  const meta = useApi<{ name: string | null; image: string | null }>(`/api/nfts/token?nft=${nft}&id=${tokenId}`).data;
  const royaltyBps = useRoyaltyBps(nft, tokenId);
  const moreFrom = useIndexer<{ items: ApiOrder[] }>(paths.listings({ collection: nft, limit: 7 })).data?.items ?? [];

  const listing = token?.listing ?? null;
  const own = !!(listing && address && sameAddress(controllerOf(listing), address));
  const { flow } = useFlowUi(listing ? buySteps(listing) : [], { kind: "sale", token: `#${tokenId}`, owner: own });

  // Independent eligibility: a sale whose collection royalty exceeds the seller's committed limit
  // reverts on every buy (RoyaltyAboveLimit). Determine this from the on-chain royalty (royaltyBps)
  // against the order's own limit, so a buy is withheld even if the indexer still reports "live"
  // (owner spec: check eligibility from chain data, not the possibly-lagging indexer).
  const royaltyBlocked = !!listing && listing.kind === "sale" && royaltyBps != null && royaltyBps > (listing.maxRoyaltyBps ?? 0);

  if (!token) return <Loading />;

  const offerHref = `/c/${nft}/${tokenId}/offer`;
  const offerBtn = (
    <Button href={offerHref} variant="secondary" size="desktop" block>
      Make offer
    </Button>
  );

  const buyable = listing && listing.status === "live" && !own && !royaltyBlocked;
  const note = royaltyBlocked
    ? "Sale stopped: the collection's royalty is above the seller's limit."
    : listing ? statusNote(listing, now) : null;

  let cta: React.ReactNode;
  let payNote = false;
  if (buyable && listing) {
    cta = (
      <>
        <FlowButton flow={flow} label={`Buy for ${eth(buyMaxPrice(scheduleOf(listing), now), "up")} ETH`} />
        {offerBtn}
      </>
    );
    payNote = true;
  } else {
    cta = (
      <>
        {own && <ErrorNote emphasis>This is your listing.</ErrorNote>}
        {note && <ErrorNote>{note}</ErrorNote>}
        {offerBtn}
      </>
    );
  }

  const offers: TokenOffer[] = (token.offers ?? []).map((o) => {
    const rem = remaining(o);
    return {
      price: priceAt(scheduleOf(o), now),
      desc: o.anyToken ? `Any ${o.collectionName ?? "collection"}${rem > 1 ? ` · ${rem} left` : ""}` : `For #${o.tokenId} only`,
      expires: until(deadlineOf(o), now),
    };
  });

  return (
    <>
      <LagBanner />
      <TokenDetail
        nft={nft}
        tokenId={tokenId}
        collectionName={token.collectionName}
        now={now}
        order={listing}
        mediaSrc={meta?.image ?? undefined}
        royaltyBps={royaltyBps}
        offers={offers}
        moreFrom={moreFrom.filter((o) => o.tokenId !== tokenId).slice(0, 6)}
        totalListed={moreFrom.length}
        cta={cta}
        payNote={payNote}
      />
    </>
  );
}
