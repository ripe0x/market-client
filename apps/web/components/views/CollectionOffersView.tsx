"use client";

import { useAccount } from "wagmi";
import { getAddress, type Address } from "viem";
import type { ApiCollection, ApiOrder } from "@market/protocol";
import { sameAddress } from "@market/protocol";
import { Toolbar, InlineTabs, SortOptions, Button } from "@/components/ui";
import { CollectionHeader, OffersTable, Loading, Empty, PastOrdersTable } from "@/components/screens";
import { useHead, useIndexer, useApi } from "@/data/hooks";
import { paths, type OfferSort } from "@/data/indexer";
import { LagBanner } from "@/components/app/Trading";
import { withParams } from "@/lib/href";

type Owned = { nft: Address; tokenId: string }[];

export function CollectionOffersView({ nft, sort = "highest" }: { nft: Address; sort?: OfferSort }) {
  const now = useHead();
  const { address } = useAccount();
  const col = useIndexer<ApiCollection>(paths.collection(nft)).data;
  const offers = useIndexer<ApiOrder[]>(paths.offers(nft, { sort })).data;
  const past = useIndexer<ApiOrder[]>(paths.offers(nft, { state: "past" })).data ?? [];
  const holdings = useApi<Owned>(address ? `/api/nfts/owned?owner=${address}&collection=${nft}` : null).data ?? [];
  const href = (s: OfferSort) => withParams(`/c/${nft}/offers`, { sort: s });

  if (!col) return <Loading />;
  const items = offers ?? [];

  // Sell shows only where the wallet holds an eligible, unlisted token and it isn't your own offer.
  const eligibleOf = (o: ApiOrder) => {
    if (!address || sameAddress(o.owner, address)) return false;
    if (o.anyToken) return holdings.some((h) => sameAddress(h.nft, nft));
    return holdings.some((h) => sameAddress(h.nft, nft) && h.tokenId === o.tokenId);
  };
  const inWallet = holdings.filter((h) => sameAddress(h.nft, nft)).length;

  return (
    <>
      <LagBanner />
      <CollectionHeader collection={col} compact inWallet={address ? inWallet : undefined} />
      <Toolbar
        left={
          <>
            <InlineTabs
              tabs={[
                { label: "Listings", count: col.listed, href: `/c/${nft}` },
                { label: "Offers", count: col.offers, active: true },
              ]}
            />
            <SortOptions
              options={[
                { label: "Highest", href: href("highest"), active: sort === "highest" },
                { label: "Expiring", href: href("expiring"), active: sort === "expiring" },
                { label: "Newest", href: href("newest"), active: sort === "newest" },
              ]}
            />
          </>
        }
        right={
          <Button size="inline" href={`/c/${nft}/offer`}>
            Make offer
          </Button>
        }
      />
      {items.length === 0 ? (
        past.length ? (
          <Empty title="No live offers" note="Past offers are below." />
        ) : (
          <Empty title="No offers" note="No one has made an offer on this collection yet." />
        )
      ) : (
        <OffersTable
          offers={items}
          now={now}
          eligibleOf={eligibleOf}
          sellHrefOf={(o) => `/c/${nft}/offers/${getAddress(o.address)}/sell`}
        />
      )}
      <PastOrdersTable orders={past} />
    </>
  );
}
