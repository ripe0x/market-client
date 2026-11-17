"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance } from "wagmi";
import type { Address } from "viem";
import { eth, until, fixedSchedule, type ApiCollection, type ApiOrder, type BidConfig } from "@market/protocol";
import { MakeOfferForm, ErrorNote, Loading, type MakeOfferValue, type LadderRow } from "@/components/screens";
import { useHead, useIndexer } from "@/data/hooks";
import { paths, type TokenView } from "@/data/indexer";
import { priceNow } from "@/lib/orderDisplay";
import { parseEth } from "@/lib/listingConfig";
import { LagBanner } from "@/components/app/Trading";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { offerSteps } from "@/data/flows";
import { randomSalt } from "@market/protocol";

const EXPIRY_SECONDS: Record<Exclude<MakeOfferValue["expires"], "Never">, bigint> = { "1D": 86_400n, "3D": 259_200n, "7D": 604_800n, "30D": 2_592_000n };
const remaining = (o: ApiOrder) => (o.maxFills === "0" ? 1 : Number(o.maxFills)) - o.fills;

export function OfferView({ nft, tokenId }: { nft: Address; tokenId?: string }) {
  const router = useRouter();
  const now = useHead();
  const { address } = useAccount();
  const { data: bal } = useBalance({ address });
  const single = !!tokenId;

  const col = useIndexer<ApiCollection>(paths.collection(nft)).data;
  const offers = useIndexer<ApiOrder[]>(paths.offers(nft, { sort: "highest", token: tokenId })).data ?? [];
  const tv = useIndexer<TokenView>(single ? paths.token(nft, tokenId!) : null).data;

  const [value, setValue] = useState<MakeOfferValue>({ amount: "", quantity: 1, expires: "7D" });

  const qty = single ? 1 : value.quantity;
  const amountWei = parseEth(value.amount);
  const total = amountWei * BigInt(qty);
  // Salt and expiry anchor stay fixed while the form is open so a retry targets the same order
  // address (offerSteps' done check); the anchor follows the chain until a flow starts.
  const [salt] = useState(() => randomSalt());
  const [anchor, setAnchor] = useState(now);
  const expiry = value.expires === "Never" ? 0n : anchor + EXPIRY_SECONDS[value.expires];

  const config: BidConfig = {
    nft,
    anyToken: !single,
    tokenId: single ? BigInt(tokenId!) : 0n,
    schedule: fixedSchedule(amountWei, expiry),
    recipient: (address ?? "0x0000000000000000000000000000000000000000") as Address,
    maxFills: BigInt(qty),
  };
  const flowSteps = address && amountWei > 0n ? offerSteps(config, total, salt) : [];
  const { flow } = useFlowUi(flowSteps, { kind: "bid" });
  useEffect(() => {
    if (!flow.running && !flow.done && !flow.error && now - anchor > 30n) setAnchor(now);
  }, [now, anchor, flow.running, flow.done, flow.error]);

  if (!col) return <Loading />;

  // Ladder: existing offers with the user's prospective offer inserted, highest first.
  const rows = [
    ...offers.map((o) => ({ wei: priceNow(o, now), qty: remaining(o), expires: until(BigInt(o.schedule.expiry), now), yours: false })),
    { wei: amountWei, qty, expires: value.expires === "Never" ? "Never" : value.expires, yours: true },
  ].sort((a, b) => (a.wei < b.wei ? 1 : a.wei > b.wei ? -1 : 0));
  const ladder: LadderRow[] = rows.map((r) => ({ price: eth(r.wei), qty: r.qty, expires: r.expires, yours: r.yours }));

  const topOffer = col.topOffer ? BigInt(col.topOffer) : null;
  const listingPrice = tv?.listing ? priceNow(tv.listing, now) : null;
  const canOffer = !!address && amountWei > 0n && (!bal || bal.value >= total);

  return (
    <>
      <LagBanner />
      <MakeOfferForm
        collectionName={col.name}
        anyToken={!single}
        tokenId={tokenId}
        floor={col.floor ? BigInt(col.floor) : null}
        listed={col.listed}
        ladder={single ? undefined : ladder}
        value={value}
        onChange={setValue}
        walletBalance={bal?.value ?? 0n}
        single={single}
        topOffer={topOffer}
        listingPrice={listingPrice}
        cta={
          <>
            {!!address && bal && bal.value < total && <ErrorNote>Your wallet balance is below {eth(total, "up")} ETH.</ErrorNote>}
            <FlowButton
              flow={flow}
              label={`Deposit ${eth(total, "up")} ETH and offer`}
              disabled={!canOffer}
              onDone={() => router.push(single ? `/c/${nft}/${tokenId}` : `/c/${nft}/offers`)}
            />
          </>
        }
      />
    </>
  );
}
