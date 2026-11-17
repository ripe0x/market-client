import { NextResponse, type NextRequest } from "next/server";

// Nonce-based Content-Security-Policy (PLAN.md §8). The nonce is generated per request, passed to
// Next via a request header (Next stamps it onto its own <script> tags) and echoed in the CSP
// response header. Everything else is 'self'; only the hosts we actually talk to are allowed in
// connect-src.
const origin = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";

  const connect = [
    "'self'",
    origin(process.env.NEXT_PUBLIC_INDEXER_URL),
    origin(process.env.NEXT_PUBLIC_RPC_URL),
    "https://*.gateway.tenderly.co",
    dev ? "http://127.0.0.1:*" : null,
    dev ? "ws://127.0.0.1:*" : null,
    dev ? "ws://localhost:*" : null,
    // WalletConnect relay/explorer only when a project id is configured (DECISIONS D32).
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? "wss://relay.walletconnect.com" : null,
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? "https://*.walletconnect.com" : null,
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? "https://*.walletconnect.org" : null,
  ].filter(Boolean);

  const script = dev
    ? `'self' 'nonce-${nonce}' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  const csp = [
    `default-src 'self'`,
    `base-uri 'self'`,
    `script-src ${script}`,
    // next/font and RainbowKit inject stylesheets; style hashes are unstable so inline is allowed.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `media-src 'self'`,
    `font-src 'self'`,
    `connect-src ${connect.join(" ")}`,
    `frame-src 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Skip Next internals (static assets, image optimizer, HMR) and the favicon; CSP matters on
  // documents, API routes and pages. Running on _next/* would also break the dev HMR socket.
  matcher: [{ source: "/((?!_next/|favicon.ico).*)" }],
};
