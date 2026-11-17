import { isAddress, getAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { AcceptView } from "@/components/views/AcceptView";

// Accept offer (mobile page; desktop renders the same panel). PLAN.md §6.4, DECISIONS D13/D14.
export default async function Page({ params }: { params: Promise<{ nft: string; order: string }> }) {
  const { nft, order } = await params;
  if (!isAddress(nft) || !isAddress(order)) notFound();
  return (
    <Chrome mobileNav={{ title: "Sell to offer", leading: "cancel", backHref: `/c/${nft}/offers` }}>
      <div className="page">
        <AcceptView nft={getAddress(nft)} order={getAddress(order)} />
      </div>
    </Chrome>
  );
}
