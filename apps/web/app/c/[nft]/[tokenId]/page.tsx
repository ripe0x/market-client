import { isAddress, getAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { TokenDetailView } from "@/components/views/TokenDetailView";

// Screen 05 · NFT detail.
export default async function Page({ params }: { params: Promise<{ nft: string; tokenId: string }> }) {
  const { nft, tokenId } = await params;
  if (!isAddress(nft) || !/^\d{1,78}$/.test(tokenId)) notFound();
  return (
    <Chrome mobileNav={{ title: "Token", backHref: `/c/${nft}` }}>
      <div className="page">
        <TokenDetailView nft={getAddress(nft)} tokenId={tokenId} />
      </div>
    </Chrome>
  );
}
