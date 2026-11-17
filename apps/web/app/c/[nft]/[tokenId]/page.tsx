import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Screen 05 · NFT detail.
export default async function Page({ params }: { params: Promise<{ nft: string; tokenId: string }> }) {
  const { nft } = await params;
  return (
    <Chrome mobileNav={{ title: "Token", backHref: `/c/${nft}` }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
