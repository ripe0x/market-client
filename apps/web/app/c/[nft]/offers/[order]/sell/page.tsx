import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Accept offer (mobile page; desktop uses the collection page's right panel).
export default async function Page({ params }: { params: Promise<{ nft: string; order: string }> }) {
  const { nft } = await params;
  return (
    <Chrome mobileNav={{ title: "Sell to offer", leading: "cancel", backHref: `/c/${nft}/offers` }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
