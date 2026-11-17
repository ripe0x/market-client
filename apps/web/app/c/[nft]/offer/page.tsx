import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Screen 07 · Make offer (collection).
export default async function Page({ params }: { params: Promise<{ nft: string }> }) {
  const { nft } = await params;
  return (
    <Chrome mobileNav={{ title: "Make offer", leading: "cancel", backHref: `/c/${nft}` }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
