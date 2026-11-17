// Fetching untrusted token media for /api/media. Only images and video, size-capped, never from
// private networks, and served with a sandbox CSP so an SVG cannot run script even if opened
// directly (PLAN.md §8).
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const ALLOWED = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/avif", "video/mp4", "video/webm"];
export const MAX_BYTES = 15 * 1024 * 1024;

const PRIVATE4 = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^(22[4-9]|2[3-5]\d)\./];
const PRIVATE6 = [/^::1?$/, /^f[cd]/i, /^fe[89ab]/i];
/** Loopback, private, link-local, CGNAT, multicast; IPv4-mapped IPv6 checked as IPv4. */
function isPrivate(ip: string): boolean {
  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  const mapped = hex
    ? [parseInt(hex[1]!, 16) >> 8, parseInt(hex[1]!, 16) & 255, parseInt(hex[2]!, 16) >> 8, parseInt(hex[2]!, 16) & 255].join(".")
    : ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  const v4 = mapped ?? (isIP(ip) === 4 ? ip : null);
  return v4 ? PRIVATE4.some((r) => r.test(v4)) : PRIVATE6.some((r) => r.test(ip));
}
// ponytail: DNS is resolved here and again by fetch, so a rebinding host could switch to a
// private address in between; bounded by redirect:"error", the content-type allowlist and the
// sandbox CSP. Pin the vetted IP with a custom dispatcher if this proxy ever returns more.

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
