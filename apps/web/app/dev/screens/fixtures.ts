// Representative props for the dev-only /dev/screens QA page. Values mirror the handoff mock data.
// Not imported by any shipped route.
import { parseEther } from "viem";
import { split, type ApiOrder, type ApiCollection, type ApiFill, type ApiSchedule } from "@market/protocol";
import type { RoyaltyOption, SplitFigures } from "@/components/screens";

export const NOW = 1794873574n;

const wei = (n: number): string => parseEther(n.toString()).toString();
const nowN = Number(NOW);

export const VIEWER = "0x7a3c00000000000000000000000000000000Ae41";
const OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export const COLL = {
  driftlines: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  meridian: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  tessellate: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
} as const;

const fixed = (p: number): ApiSchedule => ({ startPrice: wei(p), endPrice: wei(p), startTime: 0, endTime: 0, expiry: 0 });

// Falling/rising schedule placed so the current price sits at `frac` of the way through.
const moving = (start: number, end: number, frac: number, remaining: number): ApiSchedule => {
  const dur = Math.round(remaining / (1 - frac));
  return {
    startPrice: wei(start),
    endPrice: wei(end),
    startTime: nowN - Math.round(dur * frac),
    endTime: nowN + remaining,
    expiry: 0,
  };
};

let seq = 0;
const addr = (): `0x${string}` => `0x${(++seq).toString(16).padStart(40, "0")}` as `0x${string}`;
const tx = (): `0x${string}` => `0x${seq.toString(16).padStart(64, "f")}` as `0x${string}`;

type SaleOverrides = Partial<ApiOrder> & {
  nft: string;
  collectionName: string;
  tokenId: string;
  schedule: ApiSchedule;
};

function sale(o: SaleOverrides): ApiOrder {
  return {
    address: addr(),
    kind: "sale",
    owner: OWNER as `0x${string}`,
    config: "0x",
    anyToken: false,
    maxFills: "1",
    fills: 0,
    maxRoyaltyBps: 500,
    payee: OWNER as `0x${string}`,
    createdAt: nowN - 240,
    createdTx: tx(),
    feeBps: 100,
    closed: false,
    closedByFill: false,
    balance: "0",
    escrowed: true,
    quoteError: null,
    status: "live",
    priceNow: o.schedule.startPrice,
    withdrawable: false,
    lastSalePrice: null,
    ...o,
  } as ApiOrder;
}

type BidOverrides = Partial<ApiOrder> & {
  nft: string;
  collectionName: string;
  schedule: ApiSchedule;
};

function bid(o: BidOverrides): ApiOrder {
  const owner = (o.owner ?? "0x5100000000000000000000000000000000020a9b") as `0x${string}`;
  return {
    address: addr(),
    kind: "bid",
    config: "0x",
    tokenId: "0",
    anyToken: true,
    maxFills: "5",
    fills: 0,
    maxRoyaltyBps: 10000,
    createdAt: nowN - 3600,
    createdTx: tx(),
    feeBps: 100,
    closed: false,
    closedByFill: false,
    balance: wei(2.75),
    escrowed: false,
    quoteError: null,
    status: "live",
    withdrawable: false,
    lastSalePrice: null,
    ...o,
    owner,
    payee: owner,
    priceNow: o.schedule.startPrice,
  } as ApiOrder;
}

// --- Listings (screen 01 / 03) ---
export const LISTINGS: ApiOrder[] = [
  sale({ nft: COLL.driftlines, collectionName: "Driftlines", tokenId: "212", schedule: moving(2.4, 0.8, 0.61, 86400), lastSalePrice: wei(1.25) }),
  sale({ nft: COLL.meridian, collectionName: "Pixel Folk", tokenId: "4410", schedule: fixed(0.19), lastSalePrice: wei(0.17) }),
  sale({ nft: COLL.tessellate, collectionName: "Tessellate", tokenId: "887", schedule: moving(0.9, 0.6, 0.3, 50000), lastSalePrice: wei(0.39) }),
  sale({ nft: COLL.driftlines, collectionName: "Orbitals", tokenId: "12", schedule: fixed(4.6), lastSalePrice: wei(4.4) }),
  sale({ nft: COLL.meridian, collectionName: "Kiln", tokenId: "4", schedule: fixed(1.95), lastSalePrice: wei(1.8) }),
  sale({ nft: COLL.tessellate, collectionName: "Low Tide", tokenId: "63", schedule: fixed(0.52), lastSalePrice: null }),
  sale({ nft: COLL.driftlines, collectionName: "Weave", tokenId: "31", schedule: moving(2.2, 1.4, 0.45, 70000), lastSalePrice: wei(1.7) }),
  sale({ nft: COLL.driftlines, collectionName: "Driftlines", tokenId: "87", schedule: moving(1.2, 2.0, 0.35, 90000), lastSalePrice: wei(1.4) }),
];

// Collection listings (screen 03): #id only, varied sellers.
export const COLLECTION_LISTINGS: ApiOrder[] = [
  sale({ nft: COLL.driftlines, collectionName: "Driftlines", tokenId: "274", schedule: moving(0.72, 0.5, 0.83, 40000), owner: "0x9c000000000000000000000000000000000011a2" as `0x${string}`, lastSalePrice: wei(0.58) }),
  sale({ nft: COLL.driftlines, collectionName: "Driftlines", tokenId: "156", schedule: fixed(0.85), owner: "0x4100000000000000000000000000000000b07e00" as `0x${string}`, lastSalePrice: wei(0.9) }),
  sale({ nft: COLL.driftlines, collectionName: "Driftlines", tokenId: "212", schedule: moving(2.4, 0.8, 0.61, 86400), owner: "0x3a00000000000000000000000000000000091c40" as `0x${string}`, lastSalePrice: wei(1.25) }),
  sale({ nft: COLL.driftlines, collectionName: "Driftlines", tokenId: "331", schedule: fixed(1.68), owner: "0x0500000000000000000000000000000000aa6b00" as `0x${string}`, lastSalePrice: wei(1.8) }),
];

// --- Collections (screen 02) ---
const collection = (
  name: string,
  address: string,
  floor: number,
  top: number,
  listed: number,
  volume: number,
  sales: number,
): ApiCollection => ({
  address: address as `0x${string}`,
  name,
  symbol: name.slice(0, 4).toUpperCase(),
  isERC721: true,
  supports2981: true,
  floor: wei(floor),
  topOffer: wei(top),
  listed,
  offers: Math.round(listed / 6),
  volume: wei(volume),
  sales,
});

export const COLLECTIONS: ApiCollection[] = [
  collection("Pixel Folk", "0x1111111111111111111111111111111111111111", 0.17, 0.15, 604, 31.0, 182),
  collection("Orbitals", "0x2222222222222222222222222222222222222222", 4.46, 4.05, 31, 22.3, 5),
  collection("Driftlines", COLL.driftlines, 0.62, 0.55, 48, 18.4, 26),
  collection("Tessellate", COLL.tessellate, 0.4, 0.36, 287, 12.1, 31),
  collection("Low Tide", "0x4444444444444444444444444444444444444444", 0.46, 0.41, 112, 9.7, 22),
];

export const OWNERS: Record<string, number> = { "Pixel Folk": 4120, Orbitals: 210, Driftlines: 512, Tessellate: 1934, "Low Tide": 803 };

export const DRIFTLINES = COLLECTIONS[2]!;

// --- Offers (screen 04) ---
export const OFFERS: ApiOrder[] = [
  bid({ nft: COLL.driftlines, collectionName: "Driftlines", anyToken: false, tokenId: "212", schedule: fixed(1.05), maxFills: "1", owner: "0x9100000000000000000000000000000000004e0c" as `0x${string}`, balance: wei(1.05) }),
  bid({ nft: COLL.driftlines, collectionName: "Driftlines", schedule: fixed(0.55), maxFills: "7", owner: "0x5100000000000000000000000000000000020a9b" as `0x${string}`, balance: wei(3.85) }),
  bid({ nft: COLL.driftlines, collectionName: "Driftlines", schedule: moving(0.53, 0.6, 0.2, 200000), maxFills: "1", owner: "0xc400000000000000000000000000000000088120" as `0x${string}`, balance: wei(0.6) }),
  bid({ nft: COLL.driftlines, collectionName: "Driftlines", schedule: fixed(0.5), maxFills: "20", owner: "0x8f000000000000000000000000000000000e2710" as `0x${string}`, balance: wei(10) }),
  bid({ nft: COLL.driftlines, collectionName: "Driftlines", schedule: fixed(0.4), maxFills: "12", owner: "0xee00000000000000000000000000000000013b80" as `0x${string}`, balance: wei(4.8), status: "underfunded" }),
];

// --- Accept offer (screen 04) ---
export const ACCEPT_OFFER = OFFERS[1]!;
export const ELIGIBLE = [
  { tokenId: "305", note: "" },
  { tokenId: "118", note: "" },
];
export const ACCEPT_BREAKDOWN = (() => {
  const price = parseEther("0.55");
  const royaltyBps = 500n;
  const s = split(price, 100n, (price * royaltyBps) / 10000n);
  return { offer: s.price, royalty: s.royalty, royaltyBps: 500, fee: s.fee, receive: s.proceeds };
})();

// --- Token detail (screen 05) ---
export const DETAIL_ORDER = LISTINGS[0]!;
export const TOKEN_OFFERS = [
  { price: parseEther("1.05"), desc: "For #212 only", expires: "2 days" },
  { price: parseEther("0.55"), desc: "Any Driftlines · 7 left", expires: "3 days" },
  { price: parseEther("0.53"), desc: "Any Driftlines", expires: "5 days" },
];

// --- Create listing (screen 06) ---
export const WALLET_NFTS = [
  { nft: COLL.meridian, tokenId: "15", collectionName: "Meridian" },
  { nft: COLL.driftlines, tokenId: "305", collectionName: "Driftlines" },
  { nft: COLL.meridian, tokenId: "421", collectionName: "Pixel Folk" },
  { nft: COLL.tessellate, tokenId: "772", collectionName: "Tessellate" },
  { nft: COLL.driftlines, tokenId: "3", collectionName: "Weave" },
  { nft: COLL.tessellate, tokenId: "8", collectionName: "Orbitals", listed: true },
];

const splitFigs = (price: number): SplitFigures => {
  const p = parseEther(price.toString());
  const s = split(p, 100n, (p * 500n) / 10000n);
  return { salePrice: s.price, royalty: s.royalty, royaltyBps: 500, fee: s.fee, receive: s.proceeds };
};
export const CREATE_BREAKDOWN = { atStart: splitFigs(1.5), atEnd: splitFigs(1.0) };

export const ROYALTY_OPTIONS: RoyaltyOption[] = [
  { label: "Collection asks 5%", bps: 500 },
  { label: "0%", bps: 0 },
  { label: "2.5%", bps: 250 },
  { label: "5%", bps: 500 },
  { label: "7.5%", bps: 750 },
  { label: "10%", bps: 1000 },
  { label: "No limit", bps: 10000 },
];

// --- Make offer (screen 07) ---
export const OFFER_LADDER = [
  { price: "0.58", qty: 5, expires: "7 days", yours: true },
  { price: "0.55", qty: 7, expires: "3 days" },
  { price: "0.53", qty: 1, expires: "5 days" },
  { price: "0.50", qty: 20, expires: "14 days" },
  { price: "0.40", qty: 12, expires: "Never" },
];

// --- Positions (screen 08) ---
export const POS_LISTINGS: ApiOrder[] = [
  sale({ nft: COLL.meridian, collectionName: "Meridian", tokenId: "15", schedule: moving(2.0, 1.0, 0.95, 20000), owner: VIEWER as `0x${string}`, status: "live" }),
  sale({ nft: COLL.driftlines, collectionName: "Orbitals", tokenId: "8", schedule: fixed(4.8), owner: VIEWER as `0x${string}`, status: "awaiting_nft", escrowed: false }),
  sale({ nft: COLL.driftlines, collectionName: "Weave", tokenId: "3", schedule: fixed(2.1), owner: VIEWER as `0x${string}`, status: "cancelled", closed: true, withdrawable: true, escrowed: true }),
];

export const POS_OFFERS: ApiOrder[] = [
  bid({ nft: COLL.driftlines, collectionName: "Driftlines", schedule: fixed(0.58), maxFills: "5", fills: 2, owner: VIEWER as `0x${string}`, balance: wei(1.74) }),
  bid({ nft: COLL.driftlines, collectionName: "Driftlines", anyToken: false, tokenId: "212", schedule: fixed(1.1), maxFills: "1", fills: 0, owner: VIEWER as `0x${string}`, balance: wei(1.1) }),
  bid({ nft: COLL.meridian, collectionName: "Low Tide", schedule: { ...fixed(0.3), expiry: nowN - 20 * 86400 }, maxFills: "6", fills: 4, owner: VIEWER as `0x${string}`, balance: wei(0.6), status: "expired" }),
];

export const POS_ACTIVITY: ApiFill[] = [
  { id: "a1", order: addr(), kind: "sale", nft: COLL.meridian as `0x${string}`, collectionName: "Meridian", tokenId: "11", price: wei(1.0), royalty: wei(0.05), fee: wei(0.01), proceeds: wei(0.94), buyer: "0x5100000000000000000000000000000000020a9b", seller: VIEWER as `0x${string}`, timestamp: nowN - 19 * 86400, tx: tx() },
  { id: "a2", order: addr(), kind: "bid", nft: COLL.meridian as `0x${string}`, collectionName: "Low Tide", tokenId: "40", price: wei(0.3), royalty: wei(0.015), fee: wei(0.003), proceeds: wei(0.282), buyer: VIEWER as `0x${string}`, seller: "0xaa00000000000000000000000000000000071c20", timestamp: nowN - 20 * 86400, tx: tx() },
  { id: "a3", order: addr(), kind: "sale", nft: COLL.driftlines as `0x${string}`, collectionName: "Driftlines", tokenId: "305", price: wei(0.66), royalty: wei(0.033), fee: wei(0.0066), proceeds: wei(0.62), buyer: VIEWER as `0x${string}`, seller: "0x7700000000000000000000000000000000c2d100", timestamp: nowN - 22 * 86400, tx: tx() },
  { id: "a4", order: addr(), kind: "sale", nft: COLL.meridian as `0x${string}`, collectionName: "Pixel Folk", tokenId: "77", price: wei(0.17), royalty: wei(0), fee: wei(0.0017), proceeds: wei(0.16), buyer: "0xc400000000000000000000000000000000088120", seller: VIEWER as `0x${string}`, timestamp: nowN - 27 * 86400, tx: tx() },
];
