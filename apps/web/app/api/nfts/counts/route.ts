import { collectionCounts } from "@/server/nft";
import { getAddress, isAddress } from "viem";

/** GET /api/nfts/counts?nft= → { items, owners }, null when unknown. */
export async function GET(req: Request) {
  const nft = new URL(req.url).searchParams.get("nft") ?? "";
  if (!isAddress(nft)) return Response.json({ error: "bad address" }, { status: 400 });
  return Response.json(await collectionCounts(getAddress(nft)), { headers: { "Cache-Control": "public, max-age=3600" } });
}
