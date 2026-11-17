import { Chrome } from "@/components/chrome";
import { ListingsView } from "@/components/views/ListingsView";
import type { ListingSort } from "@/data/indexer";

// Screen 01 · Marketplace Listings.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const sort = (one(sp.sort) as ListingSort) || "newest";
  const view = one(sp.view) === "grid" ? "grid" : "table";
  return (
    <Chrome>
      <div className="page">
        <ListingsView collection={one(sp.collection)} sort={sort} view={view} />
      </div>
    </Chrome>
  );
}
