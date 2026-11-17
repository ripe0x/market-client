import type { NextConfig } from "next";

// Security headers that do not depend on a per-request nonce live here; the CSP (which needs a
// nonce) is set in middleware.ts. See PLAN.md §8.
// The Base Account wallet connector in @wagmi/connectors does `await import('@base-org/account')`,
// which drags in @coinbase/cdp-sdk and a tree of optional x402/solana payment deps that aren't
// installed. We only use the injected wallet (DECISIONS D32) and never call that connector, so stub
// the package to an empty module; the dynamic import resolves and nothing in it ever runs.
const STUB = "./stubs/empty.ts";

const nextConfig: NextConfig = {
  transpilePackages: ["@market/protocol"],
  reactStrictMode: true,
  // Don't auto-generate AGENTS.md; this repo manages its own agent docs.
  agentRules: false,
  turbopack: {
    resolveAlias: { "@base-org/account": STUB },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
