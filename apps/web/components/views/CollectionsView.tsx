"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiCollection } from "@market/protocol";
import { GiantTabs, Hero, Segmented } from "@/components/ui";
import { CollectionsTable, type Period, Loading, Empty } from "@/components/screens";
import { useIndexer } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { LagBanner } from "@/components/app/Trading";
import { withParams } from "@/lib/href";
import { isActionsCollection } from "@/lib/deployment";

export function CollectionsView({ period = "7d" }: { period?: Period }) {
  const router = useRouter();
  const { data, isLoading } = useIndexer<ApiCollection[]>(paths.collections({ period }));
  // The Actions ERC721 is not an ordinary collection: keep it out of browse (its tokens show
  // through their own action/resale views, and its stats are never aggregated here).
  const cols = (data ?? []).filter((c) => !isActionsCollection(c.address));
  const [owners, setOwners] = useState<Record<string, number | null>>({});

  // Owners come from the NFT API, not the indexer (DECISIONS D30).
  useEffect(() => {
    let live = true;
    Promise.all(
      cols.map(async (c) => {
        try {
          const r = await fetch(`/api/nfts/counts?nft=${c.address}`);
          const j = (await r.json()) as { owners: number | null };
          return [c.address, j.owners] as const;
        } catch {
          return [c.address, null] as const;
        }
      }),
    ).then((rows) => live && setOwners(Object.fromEntries(rows)));
    return () => {
      live = false;
    };
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <LagBanner />
      <Hero>
        <GiantTabs tabs={[{ label: "Listings", href: "/" }, { label: "Collections", href: "/collections", active: true }]} />
        <Segmented
          options={[{ value: "24h", label: "24H" }, { value: "7d", label: "7D" }, { value: "30d", label: "30D" }]}
          value={period}
          onChange={(p) => router.push(withParams("/collections", { period: p }))}
        />
      </Hero>
      {isLoading ? (
        <Loading />
      ) : cols.length === 0 ? (
        <Empty title="No collections yet" note="Collections appear here once a token is listed or offered on them." />
      ) : (
        <CollectionsTable collections={cols} period={period} ownersOf={(c) => owners[c.address] ?? null} />
      )}
    </>
  );
}
