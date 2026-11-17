import { isAddress, getAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { OfferView } from "@/components/views/OfferView";

// Screen 07 · Make offer (collection).
export default async function Page({ params }: { params: Promise<{ nft: string }> }) {
  const { nft } = await params;
  if (!isAddress(nft)) notFound();
  return (
    <Chrome mobileNav={{ title: "Make offer", leading: "cancel", backHref: `/c/${nft}` }}>
      <div className="page">
        <OfferView nft={getAddress(nft)} />
      </div>
    </Chrome>
  );
}
