import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Screen 03 · Collection Listings.
export default async function Page({ params }: { params: Promise<{ nft: string }> }) {
  await params;
  return (
    <Chrome mobileNav={{ title: "Collection", backHref: "/collections" }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
