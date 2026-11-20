import { getAddress, isAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { ReservedDetailView } from "@/components/views/ReservedView";

export default async function Page({ params }: { params: Promise<{ order: string }> }) {
  const { order } = await params;
  if (!isAddress(order)) notFound();
  return (
    <Chrome mobileNav={{ title: "Reserved action", backHref: "/reserved" }}>
      <div className="page gutter"><ReservedDetailView key={order.toLowerCase()} order={getAddress(order)} /></div>
    </Chrome>
  );
}
