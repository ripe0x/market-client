import { Chrome } from "@/components/chrome";
import { ReservedView } from "@/components/views/ReservedView";

export default function Page() {
  return (
    <Chrome mobileNav={{ title: "Reserved actions", backHref: "/" }}>
      <div className="page gutter"><ReservedView /></div>
    </Chrome>
  );
}
