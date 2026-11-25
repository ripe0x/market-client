"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useBalance, usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { eth, until, fixedSchedule, type ApiCollection, type ApiOrder, type ApiRight, type BidConfig } from "@market/protocol";
import { MakeOfferForm, ErrorNote, Loading, type MakeOfferValue, type LadderRow } from "@/components/screens";
import { useHead, useIndexer } from "@/data/hooks";
import { paths, type TokenView } from "@/data/indexer";
import { priceNow } from "@/lib/orderDisplay";
import { parseEth } from "@/lib/listingConfig";
import { LagBanner } from "@/components/app/Trading";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { offerSteps } from "@/data/flows";
import { DEPLOYMENT } from "@/lib/deployment";
import { sameAddress, randomSalt, readRight, when } from "@market/protocol";

const EXPIRY_SECONDS: Record<Exclude<MakeOfferValue["expires"], "Never">, bigint> = { "1D": 86_400n, "3D": 259_200n, "7D": 604_800n, "30D": 2_592_000n };
const remaining = (o: ApiOrder) => (o.maxFills === "0" ? 1 : Number(o.maxFills)) - o.fills;

export function OfferView({ nft, tokenId }: { nft: Address; tokenId?: string }) {
  const router = useRouter();
  const now = useHead();
  const { address } = useAccount();
  const { data: bal } = useBalance({ address });
  const single = !!tokenId;
  const pub = usePublicClient();
  const canonical = !!DEPLOYMENT.rights && sameAddress(nft, DEPLOYMENT.rights);
  const backing = canonical && tokenId && /^\d+$/.test(tokenId) && BigInt(tokenId) < 2n ** 160n
    ? `0x${BigInt(tokenId).toString(16).padStart(40, "0")}` as Address : null;
  const indexedRight = useIndexer<ApiRight>(backing ? `/api/rights/${backing}` : null).data;
  const right = useQuery({ queryKey: ["offer-right", DEPLOYMENT.deploymentId, backing, indexedRight?.config], enabled: !!pub && !!backing,
    queryFn: () => readRight(pub!, DEPLOYMENT, backing!, { config: indexedRight?.config ?? undefined }), retry: false, refetchInterval: 4_000 });

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
  const chosenExpiry = value.expires === "Never" ? 0n : anchor + EXPIRY_SECONDS[value.expires];
  const rightLimit = right.data?.deadline ? right.data.deadline - 3600n : null;
  const expiry = rightLimit !== null && (chosenExpiry === 0n || chosenExpiry > rightLimit) ? rightLimit : chosenExpiry;

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

  if (DEPLOYMENT.rights && sameAddress(nft, DEPLOYMENT.rights) && !tokenId) return <ErrorNote>Rights offers must name a specific token. Open a right to make an offer.</ErrorNote>;
  if (canonical && (right.error || (right.data && (!right.data.supported || right.data.configError || right.data.stateCode !== 1 || right.data.effectiveExpired)))) return <ErrorNote>{right.error?.message || right.data?.configError || "This right isn't available for a supported offer."}</ErrorNote>;
  if (!col && !canonical || canonical && !right.data) return <Loading />;

  // Ladder: existing offers with the user's prospective offer inserted, highest first.
  const rows = [
    ...offers.map((o) => ({ wei: priceNow(o, now), qty: remaining(o), expires: until(BigInt(o.schedule.expiry), now), yours: false })),
    { wei: amountWei, qty, expires: canonical ? until(expiry, now) : value.expires === "Never" ? "Never" : value.expires, yours: true },
  ].sort((a, b) => (a.wei < b.wei ? 1 : a.wei > b.wei ? -1 : 0));
  const ladder: LadderRow[] = rows.map((r) => ({ price: eth(r.wei), qty: r.qty, expires: r.expires, yours: r.yours }));

  const topOffer = col?.topOffer ? BigInt(col.topOffer) : null;
  const listingPrice = tv?.listing ? priceNow(tv.listing, now) : null;
  const canOffer = !!address && amountWei > 0n && (!bal || bal.value >= total) && (!canonical || expiry === 0n || expiry > now);

  return (
    <>
      <LagBanner />
      {canonical ? <p>This offer buys the right token. Exercise costs a separate {eth(right.data?.price ?? 0n)} eth. {expiry ? `The offer expires ${when(Number(expiry))}, leaving at least one hour before exercise expires.` : "The right has no expiry."}</p> : null}
      <MakeOfferForm
        collectionName={col?.name ?? "Market execution rights"}
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
