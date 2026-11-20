// Public runtime config. NEXT_PUBLIC_* values are inlined at build; everything here is safe for the
// browser. Keys and server RPC live in server-only route handlers the lead adds later (PLAN.md §11).

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337");

/** Override for the browser RPC; falls back to the deployment's rpcUrl (Tenderly / local Anvil). */
export const RPC_URL_OVERRIDE = process.env.NEXT_PUBLIC_RPC_URL || undefined;

export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || "";

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

/** The local Artwork reserved-action example address. Deployed per local chain start (its address
 * is written to `.local-chain.json`), so the dev/e2e runner passes it here; absent in production. */
export const ARTWORK_ADDRESS = process.env.NEXT_PUBLIC_ARTWORK || undefined;

/** Release selection is independent of chain; production defaults to verified legacy. */
export const RELEASE_ID = process.env.NEXT_PUBLIC_MARKET_RELEASE || undefined;
export const LEGACY_MARKET_URL = process.env.NEXT_PUBLIC_LEGACY_MARKET_URL || "https://ripe-market-v1.netlify.app/positions";
