import { isAddress, getAddress } from "viem";
import { DEPLOYMENT } from "@/lib/deployment";
import { sameAddress } from "@market/protocol";
import { redirect, notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { TokenDetailView } from "@/components/views/TokenDetailView";

// Screen 05 · NFT detail.
export default async function Page({ params }: { params: Promise<{ nft: string; tokenId: string }> }) {
  const { nft, tokenId } = await params;
  if (!isAddress(nft) || !/^\d{1,78}$/.test(tokenId)) notFound();
  if (DEPLOYMENT.rights && sameAddress(nft, DEPLOYMENT.rights)) {
    const id = BigInt(tokenId);
    if (id >= (1n << 160n)) notFound();
    redirect(`/rights/0x${id.toString(16).padStart(40, "0")}`);
  }
  return (
    <Chrome mobileNav={{ title: "Token", backHref: `/c/${nft}` }}>
      <div className="page">
        <TokenDetailView nft={getAddress(nft)} tokenId={tokenId} />
      </div>
    </Chrome>
  );
}
