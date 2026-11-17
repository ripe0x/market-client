import { Chrome } from "@/components/chrome";
import { GiantTabs, Hero } from "@/components/ui";
import { Loading } from "@/components/screens";

// Screen 01 · Marketplace Listings. Data wiring (indexer listings) is added by the lead; until then
// the route renders the chrome and the Loading state.
export default function Page() {
  return (
    <Chrome>
      <div className="page">
        <Hero>
          <GiantTabs
            tabs={[
              { label: "Listings", href: "/", active: true },
              { label: "Collections", href: "/collections" },
            ]}
          />
        </Hero>
        <Loading />
      </div>
    </Chrome>
  );
}
