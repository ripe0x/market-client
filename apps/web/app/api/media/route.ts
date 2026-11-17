import { ALLOWED, decodeDataUri, MAX_BYTES, MEDIA_HEADERS, safeUrl } from "@/server/media";

/** GET /api/media?src=<url or data URI>: token media through one controlled origin. */
export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src") ?? "";
  if (src.startsWith("data:")) {
    const d = decodeDataUri(src);
    if (!d || !ALLOWED.includes(d.type) || d.body.length > MAX_BYTES) return new Response(null, { status: 415 });
    return new Response(new Uint8Array(d.body), { headers: { ...MEDIA_HEADERS, "Content-Type": d.type } });
  }
  const url = await safeUrl(src);
  if (!url) return new Response(null, { status: 400 });
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const type = r?.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!r?.ok || !r.body || !ALLOWED.includes(type)) return new Response(null, { status: 502 });
  if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) return new Response(null, { status: 413 });
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) return new Response(null, { status: 413 });
  return new Response(buf, { headers: { ...MEDIA_HEADERS, "Content-Type": type } });
}
