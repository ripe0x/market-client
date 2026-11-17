import { isAddress, getAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { OfferView } from "@/components/views/OfferView";

// Screen 07 · Make offer (single token).
export default async function Page({ params }: { params: Promise<{ nft: string; tokenId: string }> }) {
  const { nft, tokenId } = await params;
  if (!isAddress(nft) || !/^\d{1,78}$/.test(tokenId)) notFound();
  return (
    <Chrome mobileNav={{ title: "Make offer", leading: "cancel", backHref: `/c/${nft}/${tokenId}` }}>
      <div className="page">
        <OfferView nft={getAddress(nft)} tokenId={tokenId} />
      </div>
    </Chrome>
  );
}
