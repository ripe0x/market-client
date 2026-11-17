import { Chrome } from "@/components/chrome";
import { PositionsView } from "@/components/views/PositionsView";

// Screen 08 · Positions.
export default function Page() {
  return (
    <Chrome mobileNav={{ title: "Positions", backHref: "/" }}>
      <div className="page">
        <PositionsView />
      </div>
    </Chrome>
  );
}
