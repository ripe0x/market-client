// Typed reads of the indexer REST API (apps/indexer/src/api). Works on the server (RSC) and in
// the browser. The indexer is for discovery and sorting; anything a transaction depends on is
// re-read from the chain before signing.
import type { ApiCollection, ApiFill, ApiOrder, ApiPositions, ApiSearch, ApiStatus, Page } from "@market/protocol";
import type { Address } from "viem";
import { INDEXER_URL } from "@/lib/env";

export class IndexerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function indexer<T>(path: string, init?: RequestInit): Promise<T> {
  const base = typeof window === "undefined" ? (process.env.INDEXER_URL ?? INDEXER_URL) : INDEXER_URL;
  const r = await fetch(`${base}${path}`, { ...init, cache: "no-store" });
  if (!r.ok) throw new IndexerError(r.status, `${path}: ${r.status}`);
  return r.json() as Promise<T>;
}

const qs = (o: Record<string, string | number | bigint | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export type ListingSort = "newest" | "price_asc" | "price_desc";
export type OfferSort = "highest" | "expiring" | "newest";
export type Period = "24h" | "7d" | "30d";
export type TokenView = { nft: Address; tokenId: string; collectionName: string | null; listing: ApiOrder | null; offers: ApiOrder[]; fills: ApiFill[] };

export const paths = {
  status: () => `/api/status`,
  listings: (p: { collection?: Address; sort?: ListingSort; cursor?: string | null; limit?: number; at?: bigint }) => `/api/listings${qs(p)}`,
  collections: (p: { period?: Period; at?: bigint }) => `/api/collections${qs(p)}`,
  collection: (nft: Address, p: { period?: Period } = {}) => `/api/collections/${nft}${qs(p)}`,
  offers: (nft: Address, p: { sort?: OfferSort; token?: string; at?: bigint } = {}) => `/api/collections/${nft}/offers${qs(p)}`,
  token: (nft: Address, id: string) => `/api/tokens/${nft}/${id}`,
  order: (a: Address) => `/api/orders/${a}`,
  positions: (a: Address) => `/api/accounts/${a}/positions`,
  activity: (a: Address, cursor?: string | null) => `/api/accounts/${a}/activity${qs({ cursor })}`,
  search: (q: string) => `/api/search${qs({ q })}`,
};

export type { ApiCollection, ApiFill, ApiOrder, ApiPositions, ApiSearch, ApiStatus, Page };
