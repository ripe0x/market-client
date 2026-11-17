import { Chrome } from "@/components/chrome";
import { Loading } from "@/components/screens";

// Screen 08 · Positions.
export default function Page() {
  return (
    <Chrome mobileNav={{ title: "Positions", backHref: "/" }}>
      <div className="page">
        <Loading />
      </div>
    </Chrome>
  );
}
