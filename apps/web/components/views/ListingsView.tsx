"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import type { ApiOrder, Page } from "@market/protocol";
import { GiantTabs, Hero, Toolbar, SortOptions, ViewToggle } from "@/components/ui";
import { ListingsTable, ListingsGrid, Loading, Empty } from "@/components/screens";
import { useHead, useIndexer } from "@/data/hooks";
import { paths, indexer, type ListingSort } from "@/data/indexer";
import { LagBanner } from "@/components/app/Trading";
import { CollectionMenu } from "./CollectionMenu";
import { withParams } from "@/lib/href";

const PAGE = 20;

export function ListingsView({ collection, sort = "newest", view = "table" }: { collection?: string; sort?: ListingSort; view?: "table" | "grid" }) {
  const now = useHead();
  const base = paths.listings({ collection: collection as Address | undefined, sort, limit: PAGE });
  const first = useIndexer<Page<ApiOrder>>(base);
  const [more, setMore] = useState<ApiOrder[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reset appended pages when the query changes.
  useEffect(() => {
    setMore([]);
    setCursor(null);
  }, [base]);

  const items = [...(first.data?.items ?? []), ...more];
  const total = first.data?.total ?? items.length;
  const nextCursor = cursor ?? first.data?.next ?? null;
  const remaining = Math.max(0, total - items.length);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const p = await indexer<Page<ApiOrder>>(paths.listings({ collection: collection as Address | undefined, sort, cursor: nextCursor, limit: PAGE }));
      setMore((m) => [...m, ...p.items]);
      setCursor(p.next);
    } finally {
      setLoadingMore(false);
    }
  };

  const href = (p: { sort?: string; view?: string }) => withParams("/", { collection, sort, view, ...p });

  return (
    <>
      <LagBanner />
      <Hero>
        <GiantTabs tabs={[{ label: "Listings", href: "/", active: true }, { label: "Collections", href: "/collections" }]} />
      </Hero>
      <Toolbar
        left={
          <>
            <CollectionMenu selected={collection} sort={sort} view={view} />
            <SortOptions
              options={[
                { label: "Newest", href: href({ sort: "newest" }), active: sort === "newest" },
                { label: "Price low", href: href({ sort: "price_asc" }), active: sort === "price_asc" },
                { label: "Price high", href: href({ sort: "price_desc" }), active: sort === "price_desc" },
              ]}
            />
          </>
        }
        right={<ViewToggle value={view} hrefFor={(v) => href({ view: v })} />}
      />
      {first.isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty title="No listings yet" note="When sellers list tokens here, they appear in this table." />
      ) : view === "grid" ? (
        <ListingsGrid orders={items} now={now} />
      ) : (
        <ListingsTable
          orders={items}
          now={now}
          moreLabel={remaining > 0 ? (loadingMore ? "Loading…" : `Show ${remaining} more`) : undefined}
          onMore={loadMore}
        />
      )}
    </>
  );
}
