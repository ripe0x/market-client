import { Chrome } from "@/components/chrome";
import { CollectionsView } from "@/components/views/CollectionsView";
import type { Period } from "@/components/screens";

// Screen 02 · Marketplace Collections.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const p = Array.isArray(sp.period) ? sp.period[0] : sp.period;
  const period: Period = p === "24h" || p === "30d" ? p : "7d";
  return (
    <Chrome>
      <div className="page">
        <CollectionsView period={period} />
      </div>
    </Chrome>
  );
}
