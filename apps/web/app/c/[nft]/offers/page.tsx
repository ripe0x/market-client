import { isAddress, getAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { CollectionOffersView } from "@/components/views/CollectionOffersView";
import type { OfferSort } from "@/data/indexer";

// Screen 04 · Collection Offers.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ nft: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { nft } = await params;
  if (!isAddress(nft)) notFound();
  const sp = await searchParams;
  const s = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort: OfferSort = s === "expiring" || s === "newest" ? s : "highest";
  return (
    <Chrome mobileNav={{ title: "Offers", backHref: `/c/${nft}` }}>
      <div className="page">
        <CollectionOffersView nft={getAddress(nft)} sort={sort} />
      </div>
    </Chrome>
  );
}
