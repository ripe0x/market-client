import { Chrome } from "@/components/chrome";
import { GiantTabs, Hero } from "@/components/ui";
import { Loading } from "@/components/screens";

// Screen 02 · Marketplace Collections.
export default function Page() {
  return (
    <Chrome>
      <div className="page">
        <Hero>
          <GiantTabs
            tabs={[
              { label: "Listings", href: "/" },
              { label: "Collections", href: "/collections", active: true },
            ]}
          />
        </Hero>
        <Loading />
      </div>
    </Chrome>
  );
}
