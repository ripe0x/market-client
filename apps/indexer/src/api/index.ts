// REST API for the web app (PLAN.md §4.8). Response shapes are `@market/protocol` api.ts types.
// Every status and price is computed at `at` (default: the chain head the poll last saw), so the
// order of a price sort matches the prices the client renders for that block.
import type {
  ApiCollection,
  ApiFill,
  ApiOrder,
  ApiPositions,
  ApiSearch,
  ApiStatus,
  ApiRight,
  ApiRightEvent,
  OrderStatus,
  Page,
} from "@market/protocol";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, desc, eq, ilike, inArray, or, sql } from "ponder";
import { db } from "ponder:api";
import { collection, fill, meta, order, token, right, rightCredit, rightEvent } from "ponder:schema";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { DENYLIST } from "../denylist";
import { deployment as d } from "../deployment";

const app = new Hono();
app.use("/api/*", cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? "*", allowMethods: ["GET"], exposeHeaders: ["x-market-deployment"] }));
app.use("/api/*", async (c, next) => {
  c.header("x-market-deployment", d.deploymentId);
  await next();
});

const o = order;
const num = (n: bigint) => sql.raw(`${n.toString()}::numeric`);

/** Exactly `NFTTrade.priceAt` in SQL; `div` truncates like Solidity for non-negative values. */
const priceNow = (at: bigint) => sql<string>`(CASE
  WHEN ${num(at)} >= ${o.endTime} THEN ${o.endPrice}
  WHEN ${num(at)} <= ${o.startTime} THEN ${o.startPrice}
  WHEN ${o.endPrice} < ${o.startPrice}
    THEN ${o.startPrice} - div((${o.startPrice} - ${o.endPrice}) * (${num(at)} - ${o.startTime}), ${o.endTime} - ${o.startTime})
  ELSE ${o.startPrice} + div((${o.endPrice} - ${o.startPrice}) * (${num(at)} - ${o.startTime}), ${o.endTime} - ${o.startTime})
END)`;

/** PLAN.md §4.5. Order of the cases matters: terminal states first, then time, then polled. */
const status = (at: bigint) => sql<OrderStatus>`(CASE
  WHEN NOT ${o.valid} THEN 'invalid'
  WHEN ${o.closed} AND ${o.closedByFill} AND ${o.kind} = 'sale' THEN 'sold'
  WHEN ${o.closed} AND ${o.closedByFill} THEN 'sold_out'
  WHEN ${o.closed} THEN 'cancelled'
  WHEN ${o.kind} = 'sale' AND NOT ${o.escrowed} THEN 'awaiting_nft'
  WHEN ${num(at)} < ${o.startTime} THEN 'not_started'
  WHEN ${o.expiry} <> 0 AND ${num(at)} >= ${o.expiry} THEN 'expired'
  WHEN ${o.nft} = ${(d.rights ?? "0x0000000000000000000000000000000000000000").toLowerCase()} AND EXISTS (
    SELECT 1 FROM ${right} WHERE ${right.tokenId} = ${o.tokenId}
      AND (${right.state} <> 1 OR (${right.deadline} <> 0 AND ${num(at)} >= ${right.deadline}))
  ) THEN 'blocked'
  WHEN ${o.quoteError} IS NOT NULL THEN 'blocked'
  WHEN ${o.kind} = 'bid' AND ${o.balance} < ${priceNow(at)} THEN 'underfunded'
  ELSE 'live'
END)`;

const isLive = (at: bigint) => sql`${status(at)} = 'live'`;
/** Finished orders: sold or filled out, cancelled, or expired unfilled. Invalid configs never show. */
const isPast = (at: bigint, kind: "sale" | "bid") =>
  kind === "sale"
    ? sql`${status(at)} IN ('sold', 'cancelled', 'expired')`
    : sql`${status(at)} IN ('sold_out', 'cancelled', 'expired')`;
/** Most recently finished first: when it closed, else when it expired. */
const finishedDesc = sql`coalesce(${o.closedAt}, nullif(${o.expiry}, 0), ${o.createdAt}) DESC`;
const notDenied = () =>
  DENYLIST.length ? sql`lower(${o.nft}) NOT IN (${sql.join(DENYLIST.map((a) => sql`${a.toLowerCase()}`), sql`, `)})` : sql`TRUE`;

const columns = (at: bigint) => ({
  row: o,
  status: status(at),
  priceNow: priceNow(at),
  collectionName: collection.name,
  lastSalePrice: token.lastSalePrice,
  filled: sql<string>`(SELECT coalesce(sum(${fill.price}), 0) FROM ${fill} WHERE ${fill.order} = ${o.address})`,
  rightAccount: sql<string | null>`(SELECT ${right.address} FROM ${right} WHERE ${o.nft} = ${(d.rights ?? "0x0000000000000000000000000000000000000000").toLowerCase()} AND ${right.tokenId} = ${o.tokenId} AND NOT ${o.anyToken})`,
  underlyingNft: sql<string | null>`(SELECT ${right.nft} FROM ${right} WHERE ${o.nft} = ${(d.rights ?? "0x0000000000000000000000000000000000000000").toLowerCase()} AND ${right.tokenId} = ${o.tokenId} AND NOT ${o.anyToken})`,
  underlyingTokenId: sql<string | null>`(SELECT ${right.assetId}::text FROM ${right} WHERE ${o.nft} = ${(d.rights ?? "0x0000000000000000000000000000000000000000").toLowerCase()} AND ${right.tokenId} = ${o.tokenId} AND NOT ${o.anyToken})`,
  rightTransferable: sql<boolean | null>`(SELECT ${right.state} = 1 AND (${right.deadline} = 0 OR ${num(at)} < ${right.deadline}) FROM ${right} WHERE ${o.nft} = ${(d.rights ?? "0x0000000000000000000000000000000000000000").toLowerCase()} AND ${right.tokenId} = ${o.tokenId} AND NOT ${o.anyToken})`,
});

function baseQuery(at: bigint) {
  return db
    .select(columns(at))
    .from(o)
    .leftJoin(collection, eq(collection.address, o.nft))
    .leftJoin(token, and(eq(token.nft, o.nft), eq(token.tokenId, o.tokenId)));
}

type Row = {
  row: typeof order.$inferSelect;
  status: OrderStatus;
  priceNow: string;
  collectionName: string | null;
  lastSalePrice: bigint | null;
  filled: string;
  rightAccount: string | null;
  underlyingNft: string | null;
  underlyingTokenId: string | null;
  rightTransferable: boolean | null;
};

function toApi(r: Row): ApiOrder {
  const x = r.row;
  return {
    address: getAddress(x.address),
    kind: x.kind as "sale" | "bid",
    owner: getAddress(x.owner),
    config: x.config,
    nft: getAddress(x.nft),
    collectionName: r.collectionName,
    tokenId: x.tokenId.toString(),
    ...(r.rightAccount ? { rightAccount: getAddress(r.rightAccount), underlyingNft: r.underlyingNft ? getAddress(r.underlyingNft) : null, underlyingTokenId: r.underlyingTokenId } : {}),
    anyToken: x.anyToken,
    schedule: {
      startPrice: x.startPrice.toString(),
      endPrice: x.endPrice.toString(),
      startTime: Number(x.startTime),
      endTime: Number(x.endTime),
      expiry: Number(x.expiry),
    },
    maxFills: x.maxFills.toString(),
    fills: x.fills,
    maxRoyaltyBps: x.maxRoyaltyBps,
    payee: getAddress(x.payee),
    createdAt: Number(x.createdAt),
    createdTx: x.createdTx,
    feeBps: x.feeBps,
    closed: x.closed,
    closedByFill: x.closedByFill,
    balance: x.balance.toString(),
    escrowed: x.escrowed,
    quoteError: x.quoteError ?? null,
    status: r.status,
    priceNow: String(r.priceNow),
    withdrawable: x.closed && ((x.escrowed && r.rightTransferable !== false) || x.balance > 0n),
    closedAt: x.closedAt == null ? null : Number(x.closedAt),
    filled: String(r.filled),
    lastSalePrice: r.lastSalePrice?.toString() ?? null,
  };
}

async function head(): Promise<{ block: bigint; timestamp: bigint } | null> {
  const [m] = await db.select().from(meta).where(eq(meta.id, 1));
  return m ?? null;
}

/** `?at=` (unix seconds) or the head the poll last saw, else wall clock. */
async function atOf(q: string | undefined): Promise<bigint> {
  if (q && /^\d{1,12}$/.test(q)) return BigInt(q);
  return (await head())?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
}

const addr = (s: string | undefined): Address | null => (s && isAddress(s) ? getAddress(s) : null);
const limitOf = (s: string | undefined) => Math.min(Math.max(Number(s) || 50, 1), 200);
const offsetOf = (s: string | undefined) => Math.max(Number(s) || 0, 0);

function page<T>(items: T[], offset: number, limit: number, total: number): Page<T> {
  return { items, next: offset + items.length < total ? String(offset + items.length) : null, total };
}

const sortOf = (s: string | undefined, at: bigint) =>
  s === "price_asc" ? sql`${priceNow(at)} ASC, ${o.createdAt} DESC`
  : s === "price_desc" ? sql`${priceNow(at)} DESC, ${o.createdAt} DESC`
  : s === "expiring" ? sql`CASE WHEN ${o.expiry} = 0 THEN 1 ELSE 0 END, ${o.expiry} ASC`
  : s === "highest" ? sql`${priceNow(at)} DESC, ${o.createdAt} DESC`
  : sql`${o.createdAt} DESC`;

// ---------------------------------------------------------------------------------------------

app.get("/api/status", async (c) => {
  const h = await head();
  const body: ApiStatus = {
    deploymentId: d.deploymentId,
    releaseId: d.releaseId,
    chainId: Number(process.env.PONDER_CHAIN_ID ?? 31337),
    block: (h?.block ?? 0n).toString(),
    timestamp: Number(h?.timestamp ?? 0n),
    ready: !!h,
  };
  return c.json(body, 200, { "cache-control": "no-store" });
});

/** Live listings, all collections or one. */
app.get("/api/listings", async (c) => {
  const at = await atOf(c.req.query("at"));
  const nft = addr(c.req.query("collection"));
  const limit = limitOf(c.req.query("limit"));
  const offset = offsetOf(c.req.query("cursor"));
  const past = c.req.query("state") === "past";
  const where = and(eq(o.kind, "sale"), past ? isPast(at, "sale") : isLive(at), notDenied(), nft ? eq(o.nft, nft) : undefined);
  const [rows, [{ n }]] = await Promise.all([
    baseQuery(at).where(where).orderBy(past ? finishedDesc : sortOf(c.req.query("sort"), at)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(o).where(where),
  ]);
  return c.json(page((rows as Row[]).map(toApi), offset, limit, n));
});

/** Live and underfunded offers of a collection (any token, or one token with `token=`). */
app.get("/api/collections/:nft/offers", async (c) => {
  const nft = addr(c.req.param("nft"));
  if (!nft) return c.json({ error: "bad address" }, 400);
  const at = await atOf(c.req.query("at"));
  const tokenId = c.req.query("token");
  const forToken = tokenId && /^\d+$/.test(tokenId) ? or(eq(o.anyToken, true), eq(o.tokenId, BigInt(tokenId))) : undefined;
  const past = c.req.query("state") === "past";
  const rows = await baseQuery(at)
    .where(and(eq(o.kind, "bid"), eq(o.nft, nft), past ? isPast(at, "bid") : sql`${status(at)} IN ('live', 'underfunded')`, forToken))
    .orderBy(past ? finishedDesc : sortOf(c.req.query("sort") ?? "highest", at))
    .limit(limitOf(c.req.query("limit")));
  return c.json((rows as Row[]).map(toApi));
});

const periodSeconds = (p: string | undefined) => (p === "24h" ? 86_400n : p === "30d" ? 30n * 86_400n : 7n * 86_400n);

async function collectionStats(at: bigint, period: bigint, only?: Address): Promise<ApiCollection[]> {
  const since = at - period;
  const rows = await db.execute(sql`
    SELECT ${collection.address} AS address, ${collection.name} AS name, ${collection.symbol} AS symbol,
      ${collection.isERC721} AS "isERC721", ${collection.supports2981} AS "supports2981",
      (SELECT min(p) FROM (SELECT ${priceNow(at)} AS p FROM ${o} WHERE ${o.nft} = ${collection.address} AND ${o.kind} = 'sale' AND ${isLive(at)}) s) AS floor,
      (SELECT max(p) FROM (SELECT ${priceNow(at)} AS p FROM ${o} WHERE ${o.nft} = ${collection.address} AND ${o.kind} = 'bid' AND ${o.anyToken} AND ${isLive(at)}) s) AS "topOffer",
      (SELECT count(*)::int FROM ${o} WHERE ${o.nft} = ${collection.address} AND ${o.kind} = 'sale' AND ${isLive(at)}) AS listed,
      (SELECT count(*)::int FROM ${o} WHERE ${o.nft} = ${collection.address} AND ${o.kind} = 'bid' AND ${status(at)} IN ('live', 'underfunded')) AS offers,
      (SELECT coalesce(sum(${fill.price}), 0) FROM ${fill} WHERE ${fill.nft} = ${collection.address} AND NOT ${fill.selfTrade} AND ${fill.timestamp} >= ${num(since)}) AS volume,
      (SELECT count(*)::int FROM ${fill} WHERE ${fill.nft} = ${collection.address} AND NOT ${fill.selfTrade} AND ${fill.timestamp} >= ${num(since)}) AS sales
    FROM ${collection}
    WHERE ${collection.isERC721} ${only ? sql`AND ${collection.address} = ${only.toLowerCase()}` : sql``}
      ${DENYLIST.length ? sql`AND lower(${collection.address}) NOT IN (${sql.join(DENYLIST.map((a) => sql`${a.toLowerCase()}`), sql`, `)})` : sql``}
    ORDER BY volume DESC, listed DESC
    LIMIT 200`);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    address: getAddress(r.address as string),
    name: (r.name as string) ?? null,
    symbol: (r.symbol as string) ?? null,
    isERC721: !!r.isERC721,
    supports2981: !!r.supports2981,
    floor: r.floor == null ? null : String(r.floor),
    topOffer: r.topOffer == null ? null : String(r.topOffer),
    listed: Number(r.listed),
    offers: Number(r.offers),
    volume: String(r.volume),
    sales: Number(r.sales),
  }));
}

app.get("/api/collections", async (c) => {
  const at = await atOf(c.req.query("at"));
  return c.json(await collectionStats(at, periodSeconds(c.req.query("period"))));
});

app.get("/api/collections/:nft", async (c) => {
  const nft = addr(c.req.param("nft"));
  if (!nft) return c.json({ error: "bad address" }, 400);
  const at = await atOf(c.req.query("at"));
  const [one] = await collectionStats(at, periodSeconds(c.req.query("period")), nft);
  return one ? c.json(one) : c.json({ error: "not found" }, 404);
});

/** A token: its live or most recent listing, offers that can buy it, its Market sales. */
app.get("/api/tokens/:nft/:id", async (c) => {
  const nft = addr(c.req.param("nft"));
  const id = c.req.param("id");
  if (!nft || !/^\d+$/.test(id)) return c.json({ error: "bad token" }, 400);
  const at = await atOf(c.req.query("at"));
  const tokenId = BigInt(id);
  const [listings, offers, fills] = await Promise.all([
    baseQuery(at)
      .where(and(eq(o.kind, "sale"), eq(o.nft, nft), eq(o.tokenId, tokenId), eq(o.valid, true)))
      .orderBy(sql`CASE WHEN ${status(at)} = 'live' THEN 0 WHEN NOT ${o.closed} THEN 1 ELSE 2 END, ${o.createdAt} DESC`)
      .limit(1),
    baseQuery(at)
      .where(and(eq(o.kind, "bid"), eq(o.nft, nft), or(eq(o.anyToken, true), eq(o.tokenId, tokenId)), sql`${status(at)} IN ('live', 'underfunded')`))
      .orderBy(sql`${priceNow(at)} DESC`),
    db.select().from(fill).where(and(eq(fill.nft, nft), eq(fill.tokenId, tokenId))).orderBy(desc(fill.timestamp)).limit(20),
  ]);
  const [coll] = await db.select().from(collection).where(eq(collection.address, nft));
  return c.json({
    nft,
    tokenId: id,
    collectionName: coll?.name ?? null,
    listing: listings[0] ? toApi(listings[0] as Row) : null,
    offers: (offers as Row[]).map(toApi),
    fills: fills.map((f) => toFill(f, coll?.name ?? null)),
  });
});

app.get("/api/orders/:address", async (c) => {
  const a = addr(c.req.param("address"));
  if (!a) return c.json({ error: "bad address" }, 400);
  const at = await atOf(c.req.query("at"));
  const [r] = await baseQuery(at).where(eq(o.address, a));
  return r ? c.json(toApi(r as Row)) : c.json({ error: "not found" }, 404);
});

/** An account's orders that still matter: open, or closed with something to withdraw. */
app.get("/api/accounts/:address/positions", async (c) => {
  const a = addr(c.req.param("address"));
  if (!a) return c.json({ error: "bad address" }, 400);
  const at = await atOf(c.req.query("at"));
  const rows = (await baseQuery(at)
    .where(and(eq(o.owner, a), or(eq(o.closed, false), eq(o.escrowed, true), sql`${o.balance} > 0`)))
    .orderBy(desc(o.createdAt))
    .limit(500)) as Row[];
  const body: ApiPositions = {
    listings: rows.filter((r) => r.row.kind === "sale").map(toApi),
    offers: rows.filter((r) => r.row.kind === "bid").map(toApi),
    rights: await rightsFor(at, a),
  };
  return c.json(body);
});

function toFill(f: typeof fill.$inferSelect, collectionName: string | null): ApiFill {
  return {
    id: f.id,
    order: getAddress(f.order),
    kind: f.kind as "sale" | "bid",
    nft: getAddress(f.nft),
    collectionName,
    tokenId: f.tokenId.toString(),
    price: f.price.toString(),
    royalty: f.royalty.toString(),
    fee: f.fee.toString(),
    proceeds: f.proceeds.toString(),
    buyer: getAddress(f.buyer),
    seller: getAddress(f.seller),
    timestamp: Number(f.timestamp),
    tx: f.tx as Hex,
  };
}

app.get("/api/accounts/:address/activity", async (c) => {
  const a = addr(c.req.param("address"));
  if (!a) return c.json({ error: "bad address" }, 400);
  const limit = limitOf(c.req.query("limit"));
  const offset = offsetOf(c.req.query("cursor"));
  const where = or(eq(fill.buyer, a), eq(fill.seller, a));
  const [rows, [{ n }]] = await Promise.all([
    db.select({ f: fill, name: collection.name }).from(fill).leftJoin(collection, eq(collection.address, fill.nft)).where(where).orderBy(desc(fill.timestamp)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(fill).where(where),
  ]);
  return c.json(page(rows.map((r) => toFill(r.f, r.name)), offset, limit, n));
});

/** Collections by name, symbol or address; tokens by "name #id" or "#id" within matches. */
app.get("/api/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 64);
  const empty: ApiSearch = { collections: [], tokens: [] };
  if (!q) return c.json(empty);
  const m = q.match(/^(.*?)\s*#\s*(\d+)$/);
  const name = (m ? m[1] : q)!.trim();
  const like = `%${name.replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
  const byName = name
    ? isAddress(name)
      ? eq(collection.address, getAddress(name))
      : or(ilike(collection.name, like), ilike(collection.symbol, like))
    : undefined;
  const colls = (await db.select().from(collection).where(and(eq(collection.isERC721, true), byName)).limit(8)).filter(
    (x) => !DENYLIST.some((d) => d.toLowerCase() === x.address.toLowerCase()),
  );
  const body: ApiSearch = {
    collections: colls.map((x) => ({ address: getAddress(x.address), name: x.name, symbol: x.symbol })),
    tokens: m && colls.length
      ? (
          await db
            .selectDistinct({ nft: o.nft, tokenId: o.tokenId })
            .from(o)
            .where(and(inArray(o.nft, colls.map((x) => x.address)), eq(o.tokenId, BigInt(m[2]!)), eq(o.anyToken, false)))
            .limit(8)
        ).map((t) => ({ nft: getAddress(t.nft), collectionName: colls.find((x) => x.address === t.nft)?.name ?? null, tokenId: t.tokenId.toString() }))
      : [],
  };
  return c.json(body);
});

function toRightEvent(e: typeof rightEvent.$inferSelect): ApiRightEvent {
  return {
    id: e.id, kind: e.kind, timestamp: Number(e.timestamp), block: e.block.toString(), tx: e.tx,
    ...(e.from ? { from: getAddress(e.from) } : {}), ...(e.to ? { to: getAddress(e.to) } : {}),
    ...(e.beneficiary ? { beneficiary: getAddress(e.beneficiary) } : {}),
    ...(e.recipient ? { recipient: getAddress(e.recipient) } : {}),
    ...(e.amount != null ? { amount: e.amount.toString() } : {}), ...(e.order ? { order: getAddress(e.order) } : {}),
  };
}

async function toRight(r: typeof right.$inferSelect, at: bigint): Promise<ApiRight> {
  const [credits, history, orders] = await Promise.all([
    db.select().from(rightCredit).where(eq(rightCredit.account, r.address)),
    db.select().from(rightEvent).where(eq(rightEvent.account, r.address)).orderBy(desc(rightEvent.block), desc(rightEvent.id)).limit(50),
    d.rights ? baseQuery(at).where(and(eq(o.nft, d.rights), eq(o.tokenId, r.tokenId), eq(o.valid, true))).orderBy(desc(o.createdAt)).limit(50) : [],
  ]);
  const effectiveExpired = r.deadline !== 0n && at >= r.deadline && (r.state === 0 || r.state === 1);
  const totalCredits = credits.reduce((sum, x) => sum + x.amount, 0n);
  const escrow = (orders as Row[]).find((x) => x.row.kind === "sale" && r.holder?.toLowerCase() === x.row.address.toLowerCase());
  const listing = escrow && !escrow.row.closed ? escrow : null;
  const offers = (orders as Row[]).filter((x) => x.row.kind === "bid" && !x.row.anyToken && (x.status === "live" || x.status === "underfunded")).map(toApi);
  return {
    deploymentId: d.deploymentId, account: getAddress(r.address), tokenId: r.tokenId.toString(), issuer: getAddress(r.issuer),
    holder: r.holder ? getAddress(r.holder) : null, residual: getAddress(r.residual), handler: getAddress(r.handler),
    config: r.config, configError: r.configError, supported: r.supported, state: r.state,
    stateName: (["pending", "active", "exercised", "expired", "surrendered", "canceled"] as const)[r.state] ?? "pending",
    deadline: r.deadline.toString(), effectiveExpired, isLive: r.state === 1 && !effectiveExpired,
    nft: r.nft ? getAddress(r.nft) : null, assetId: r.assetId?.toString() ?? null, price: r.price?.toString() ?? null,
    proceedsTo: r.proceedsTo ? getAddress(r.proceedsTo) : null, royaltyTo: r.royaltyTo ? getAddress(r.royaltyTo) : null,
    royalty: (r.royalty ?? 0n).toString(), royaltyAmount: (r.royalty ?? 0n).toString(), activationTerms: r.activationTerms,
    backed: !!r.backingOwner && r.backingOwner.toLowerCase() === r.address.toLowerCase(),
    backingOwner: r.backingOwner ? getAddress(r.backingOwner) : null,
    balance: r.balance.toString(), totalCredits: totalCredits.toString(),
    credits: credits.map((x) => ({ beneficiary: getAddress(x.beneficiary), amount: x.amount.toString() })),
    ...(listing ? { listing: toApi(listing) } : {}),
    ...(escrow ? { escrowOrder: getAddress(escrow.row.address), listingSeller: getAddress(escrow.row.owner) } : {}),
    offers, history: history.map(toRightEvent),
  };
}

function rightWhere(wallet?: Address) {
  return wallet ? or(
    eq(right.issuer, wallet), eq(right.holder, wallet), eq(right.residual, wallet),
    sql`EXISTS (SELECT 1 FROM ${rightCredit} WHERE ${rightCredit.account} = ${right.address} AND ${rightCredit.beneficiary} = ${wallet.toLowerCase()} AND ${rightCredit.amount} > 0)`,
    sql`EXISTS (SELECT 1 FROM ${o} WHERE ${o.nft} = ${(d.rights ?? "0x0000000000000000000000000000000000000000").toLowerCase()} AND ${o.tokenId} = ${right.tokenId} AND ${o.owner} = ${wallet.toLowerCase()} AND NOT ${o.closed})`,
  ) : undefined;
}

async function rightsFor(at: bigint, wallet?: Address, limit = 200, offset = 0): Promise<ApiRight[]> {
  const rows = await db.select().from(right).where(rightWhere(wallet)).orderBy(desc(right.createdAt), desc(right.address)).limit(limit).offset(offset);
  return Promise.all(rows.map((r) => toRight(r, at)));
}

app.get("/api/rights", async (c) => {
  const at = await atOf(c.req.query("at"));
  const limit = limitOf(c.req.query("limit"));
  const offset = offsetOf(c.req.query("cursor"));
  const wallet = addr(c.req.query("wallet")) ?? undefined;
  const [items, [{ n }]] = await Promise.all([
    rightsFor(at, wallet, limit, offset),
    db.select({ n: sql<number>`count(*)::int` }).from(right).where(rightWhere(wallet)),
  ]);
  return c.json(page(items, offset, limit, n));
});

app.get("/api/rights/:account/activity", async (c) => {
  const account = addr(c.req.param("account"));
  if (!account) return c.json({ error: "bad address" }, 400);
  const limit = limitOf(c.req.query("limit"));
  const offset = offsetOf(c.req.query("cursor"));
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(rightEvent).where(eq(rightEvent.account, account)).orderBy(desc(rightEvent.block), desc(rightEvent.id)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(rightEvent).where(eq(rightEvent.account, account)),
  ]);
  return c.json(page(rows.map(toRightEvent), offset, limit, n));
});

app.get("/api/rights/:account", async (c) => {
  const account = addr(c.req.param("account"));
  if (!account) return c.json({ error: "bad address" }, 400);
  const [row] = await db.select().from(right).where(eq(right.address, account));
  return row ? c.json(await toRight(row, await atOf(c.req.query("at")))) : c.json({ error: "not found" }, 404);
});

export default app;
