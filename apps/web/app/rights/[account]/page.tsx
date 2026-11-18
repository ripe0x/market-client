import { getAddress, isAddress } from "viem";
import { notFound } from "next/navigation";
import { Chrome } from "@/components/chrome";
import { RightDetailView } from "@/components/views/RightsView";
export default async function Page({ params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  if (!isAddress(account)) notFound();
  return <Chrome mobileNav={{ title: "Execution right", backHref: "/rights" }}><div className="page gutter"><RightDetailView key={account.toLowerCase()} account={getAddress(account)} /></div></Chrome>;
}
