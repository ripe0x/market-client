"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance } from "wagmi";
import type { Address } from "viem";
import {
  eth, until, fixedSchedule, randomSalt, sameAddress, tx,
  type ApiCollection, type ApiOrder, type OrderSpec,
} from "@market/protocol";
import { MakeOfferForm, ErrorNote, Loading, type MakeOfferValue, type LadderRow } from "@/components/screens";
import { useHead, useIndexer } from "@/data/hooks";
import { paths, type TokenView } from "@/data/indexer";
import { priceNow, deadlineOf, remaining } from "@/lib/orderDisplay";
import { parseEth } from "@/lib/listingConfig";
import { LagBanner } from "@/components/app/Trading";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { bidSteps } from "@/data/flows";
import { DEPLOYMENT } from "@/lib/deployment";

const EXPIRY_SECONDS: Record<Exclude<MakeOfferValue["expires"], "Never">, bigint> = { "1D": 86_400n, "3D": 259_200n, "7D": 604_800n, "30D": 2_592_000n };

export function OfferView({ nft, tokenId }: { nft: Address; tokenId?: string }) {
  const router = useRouter();
  const now = useHead();
  const { address } = useAccount();
  const { data: bal } = useBalance({ address });
  const single = !!tokenId;

  // An Actions-token bid may only name one token and may carry a minimum remaining lifetime.
  const isActions = !!DEPLOYMENT.actions && sameAddress(nft, DEPLOYMENT.actions);

  const col = useIndexer<ApiCollection>(paths.collection(nft)).data;
  const offers = useIndexer<ApiOrder[]>(paths.offers(nft, { sort: "highest", token: tokenId })).data ?? [];
  const tv = useIndexer<TokenView>(single ? paths.token(nft, tokenId!) : null).data;

  const [value, setValue] = useState<MakeOfferValue>({ amount: "", quantity: 1, expires: "7D" });

  const qty = single ? 1 : value.quantity;
  const amountWei = parseEth(value.amount);
  const total = amountWei * BigInt(qty);
  // Salt and deadline anchor stay fixed while the form is open so a retry targets the same order
  // address (bidSteps' done check); the anchor follows the chain until a flow starts.
  const [salt] = useState(() => randomSalt());
  const [anchor, setAnchor] = useState(now);
  const deadline = value.expires === "Never" ? 0n : anchor + EXPIRY_SECONDS[value.expires];

  const spec: OrderSpec | null = address && amountWei > 0n
    ? buildBidSpec({ issuer: address, nft, anyToken: !single, tokenId, isActions, amountWei, qty, deadline })
    : null;
  const flowSteps = spec ? bidSteps(spec, salt, total) : [];
  const { flow } = useFlowUi(flowSteps, { kind: "bid" });
  useEffect(() => {
    if (!flow.running && !flow.done && !flow.error && now - anchor > 30n) setAnchor(now);
  }, [now, anchor, flow.running, flow.done, flow.error]);

  if (isActions && !single) return <ErrorNote>Offers on Actions tokens must name one token. Open the token to make an offer.</ErrorNote>;
  if (!col) return <Loading />;

  // Ladder: existing offers with the user's prospective offer inserted, highest first.
  const rows = [
    ...offers.map((o) => ({ wei: priceNow(o, now), qty: remaining(o), expires: until(deadlineOf(o), now), yours: false })),
    { wei: amountWei, qty, expires: value.expires === "Never" ? "Never" : until(deadline, now), yours: true },
  ].sort((a, b) => (a.wei < b.wei ? 1 : a.wei > b.wei ? -1 : 0));
  const ladder: LadderRow[] = rows.map((r) => ({ price: eth(r.wei), qty: r.qty, expires: r.expires, yours: r.yours }));

  const topOffer = col?.topOffer ? BigInt(col.topOffer) : null;
  const listingPrice = tv?.listing ? priceNow(tv.listing, now) : null;
  const canOffer = !!address && amountWei > 0n && (!bal || bal.value >= total);

  return (
    <>
      <LagBanner />
      <MakeOfferForm
        collectionName={col?.name ?? "Collection"}
        anyToken={!single}
        tokenId={tokenId}
        floor={col?.floor ? BigInt(col.floor) : null}
        listed={col?.listed ?? 0}
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

/** Build a Public bid spec funded by the order's balance (ExchangeAction). The incoming-token
 * approval a seller gives always targets ExchangeAction, never this order (A1). */
function buildBidSpec(a: {
  issuer: Address; nft: Address; anyToken: boolean; tokenId?: string; isActions: boolean;
  amountWei: bigint; qty: number; deadline: bigint;
}): OrderSpec {
  return tx.bidSpec(DEPLOYMENT, {
    issuer: a.issuer,
    nft: a.nft,
    schedule: fixedSchedule(a.amountWei),
    recipient: a.issuer,
    maxExecutions: BigInt(a.qty),
    anyToken: a.anyToken,
    tokenId: a.anyToken ? undefined : BigInt(a.tokenId!),
    isActionsCollection: a.isActions,
    deadline: a.deadline,
  });
}
