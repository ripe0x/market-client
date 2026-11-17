import { tokenMeta } from "@/server/nft";
import { getAddress, isAddress } from "viem";

/** GET /api/nfts/token?nft=&id= → { name, image } with image routed through /api/media. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const nft = q.get("nft") ?? "";
  const id = q.get("id") ?? "";
  if (!isAddress(nft) || !/^\d{1,78}$/.test(id)) return Response.json({ error: "bad token" }, { status: 400 });
  const m = await tokenMeta(getAddress(nft), BigInt(id));
  return Response.json(
    { name: m.name, image: m.image ? `/api/media?src=${encodeURIComponent(m.image)}` : null },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
