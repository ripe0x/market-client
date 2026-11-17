import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Screen 06 · Create listing.
export default function Page() {
  return (
    <Chrome sellActive mobileNav={{ title: "Sell", leading: "cancel", backHref: "/" }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
