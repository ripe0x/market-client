import { ownedTokens } from "@/server/nft";
import { getAddress, isAddress, type Address } from "viem";

/** GET /api/nfts/owned?owner=&collection=… → ERC721s the wallet holds (escrowed ones excluded). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const owner = q.get("owner") ?? "";
  const collections = q.getAll("collection").filter((a) => isAddress(a)).map((a) => getAddress(a)) as Address[];
  // Without ALCHEMY_API_KEY holdings come from chain logs, so a collection list is required.
  const keyed = !!process.env.ALCHEMY_API_KEY;
  if (!isAddress(owner) || (!keyed && collections.length === 0) || collections.length > 50) return Response.json({ error: "bad request" }, { status: 400 });
  const items = await ownedTokens(getAddress(owner), collections);
  return Response.json(
    items.map((t) => ({ ...t, image: t.image ? `/api/media?src=${encodeURIComponent(t.image)}` : null })),
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}
