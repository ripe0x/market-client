import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Screen 07 · Make offer (single token).
export default async function Page({ params }: { params: Promise<{ nft: string; tokenId: string }> }) {
  const { nft, tokenId } = await params;
  return (
    <Chrome mobileNav={{ title: "Make offer", leading: "cancel", backHref: `/c/${nft}/${tokenId}` }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
