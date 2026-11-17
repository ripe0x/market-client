import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Screen 04 · Collection Offers.
export default async function Page({ params }: { params: Promise<{ nft: string }> }) {
  const { nft } = await params;
  return (
    <Chrome mobileNav={{ title: "Offers", backHref: `/c/${nft}` }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
