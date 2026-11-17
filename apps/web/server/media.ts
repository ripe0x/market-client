// Fetching untrusted token media for /api/media. Only images and video, size-capped, never from
// private networks, and served with a sandbox CSP so an SVG cannot run script even if opened
// directly (PLAN.md §8).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif", "video/mp4", "video/webm"];
export const MAX_BYTES = 15 * 1024 * 1024;

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::ffff:(127|10|192\.168)\./];
const isPrivate = (ip: string) => PRIVATE.some((r) => r.test(ip));

export async function safeUrl(src: string): Promise<URL | null> {
  let u: URL;
  try {
    u = new URL(src);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost") return null;
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (ips.length === 0 || ips.some(isPrivate)) return null;
  return u;
}

export function decodeDataUri(src: string): { type: string; body: Buffer } | null {
  const m = src.match(/^data:([a-z0-9.+/-]+)(;[^,]*)?,(.*)$/is);
  if (!m) return null;
  const type = m[1]!.toLowerCase();
  const body = (m[2] ?? "").includes(";base64") ? Buffer.from(m[3]!, "base64") : Buffer.from(decodeURIComponent(m[3]!), "utf8");
  return { type, body };
}

export const MEDIA_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=86400, immutable",
};
