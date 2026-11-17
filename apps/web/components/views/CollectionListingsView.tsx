"use client";

import type { Address } from "viem";
import type { ApiCollection, ApiOrder, Page } from "@market/protocol";
import { Toolbar, InlineTabs, SortOptions, ViewToggle, Button } from "@/components/ui";
import { CollectionHeader, CollectionListingsTable, ListingsGrid, Loading, Empty, PastOrdersTable } from "@/components/screens";
import { useHead, useIndexer, useApi } from "@/data/hooks";
import { paths, type ListingSort } from "@/data/indexer";
import { LagBanner, useRoyaltyBps } from "@/components/app/Trading";
import { withParams } from "@/lib/href";

export function CollectionListingsView({ nft, sort = "price_asc", view = "table" }: { nft: Address; sort?: ListingSort; view?: "table" | "grid" }) {
  const now = useHead();
  const col = useIndexer<ApiCollection>(paths.collection(nft)).data;
  const listings = useIndexer<Page<ApiOrder>>(paths.listings({ collection: nft, sort })).data;
  const past = useIndexer<Page<ApiOrder>>(paths.listings({ collection: nft, state: "past", limit: 20 })).data?.items ?? [];
  const counts = useApi<{ items: number | null; owners: number | null }>(`/api/nfts/counts?nft=${nft}`).data;
  const royaltyBps = useRoyaltyBps(nft, listings?.items[0]?.tokenId);
  const href = (p: { sort?: string; view?: string }) => withParams(`/c/${nft}`, { sort, view, ...p });

  if (!col) return <Loading />;
  const items = listings?.items ?? [];

  return (
    <>
      <LagBanner />
      <CollectionHeader collection={col} royaltyBps={royaltyBps} items={counts?.items ?? undefined} owners={counts?.owners ?? undefined} />
      <Toolbar
        left={
          <>
            <InlineTabs
              tabs={[
                { label: "Listings", count: col.listed, active: true },
                { label: "Offers", count: col.offers, href: `/c/${nft}/offers` },
              ]}
            />
            <SortOptions
              options={[
                { label: "Price low", href: href({ sort: "price_asc" }), active: sort === "price_asc" },
                { label: "Price high", href: href({ sort: "price_desc" }), active: sort === "price_desc" },
                { label: "Newest", href: href({ sort: "newest" }), active: sort === "newest" },
              ]}
            />
          </>
        }
        right={
          <>
            <ViewToggle value={view} hrefFor={(v) => href({ view: v })} />
            <Button size="inline" href={`/c/${nft}/offer`}>
              Make offer
            </Button>
          </>
        }
      />
      {items.length === 0 ? (
        <Empty title="No listings" note="No tokens from this collection are listed right now." />
      ) : view === "grid" ? (
        <ListingsGrid orders={items} now={now} />
      ) : (
        <CollectionListingsTable orders={items} now={now} />
      )}
      <PastOrdersTable orders={past} />
    </>
  );
}
