import { Chrome } from "@/components/chrome";
import { SellView } from "@/components/views/SellView";

// Screen 06 · Create listing.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return (
    <Chrome sellActive mobileNav={{ title: "Sell", leading: "cancel", backHref: "/" }}>
      <div className="page">
        <SellView nft={one(sp.nft)} id={one(sp.id)} />
      </div>
    </Chrome>
  );
}
