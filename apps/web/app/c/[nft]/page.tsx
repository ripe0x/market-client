import { isAddress, getAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { CollectionListingsView } from "@/components/views/CollectionListingsView";
import type { ListingSort } from "@/data/indexer";

// Screen 03 · Collection Listings.
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
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sort = (one(sp.sort) as ListingSort) || "price_asc";
  const view = one(sp.view) === "grid" ? "grid" : "table";
  return (
    <Chrome mobileNav={{ title: "Collection", backHref: "/collections" }}>
      <div className="page">
        <CollectionListingsView nft={getAddress(nft)} sort={sort} view={view} />
      </div>
    </Chrome>
  );
}
