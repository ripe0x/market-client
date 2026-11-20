// REST API for the web app. Response shapes are `@market/protocol` api.ts types. Every status and
// price is computed at `at` (default: the chain head the poll last saw). Effective liveness uses
// the order's EXCLUSIVE deadline at query time: now >= deadline is expired even if no
// finalizeExpiry event has been indexed. All addresses served here are UNAUTHENTICATED HINTS; a
// client must verify an order via readOrder (Market.isOrder + actionCodehash vs deployed code)
// before trusting it.
import type {
  ApiAccount, ApiAccountEvent, ApiCollection, ApiFill, ApiOrder, ApiPositions, ApiSearch, ApiStatus, OrderStatus, Page,
} from "@market/protocol";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, desc, eq, ilike, inArray, or, sql } from "ponder";
import { db } from "ponder:api";
import { accountEvent, collection, credit, fill, meta, order, token } from "ponder:schema";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { DENYLIST } from "../denylist";
import { deployment as d } from "../deployment";

const app = new Hono();
app.use("/api/*", cors({ origin: process.env.WEB_ORIGIN?.split(",") ?? "*", allowMethods: ["GET"], exposeHeaders: ["x-market-deployment"] }));
app.use("/api/*", async (c, next) => { c.header("x-market-deployment", d.deploymentId); await next(); });

const o = order;
const num = (n: bigint) => sql.raw(`${n.toString()}::numeric`);

/** ExchangeAction.priceAt in SQL; `div` truncates like Solidity for non-negative values. Zero for
 * non-exchange orders (startPrice=endPrice=0). */
const priceNow = (at: bigint) => sql<string>`(CASE
  WHEN ${o.startPrice} = 0 AND ${o.endPrice} = 0 THEN ${o.price}
  WHEN ${num(at)} >= ${o.endTime} THEN ${o.endPrice}
  WHEN ${num(at)} <= ${o.startTime} THEN ${o.startPrice}
  WHEN ${o.endPrice} < ${o.startPrice}
    THEN ${o.startPrice} - div((${o.startPrice} - ${o.endPrice}) * (${num(at)} - ${o.startTime}), ${o.endTime} - ${o.startTime})
  ELSE ${o.startPrice} + div((${o.endPrice} - ${o.startPrice}) * (${num(at)} - ${o.startTime}), ${o.endTime} - ${o.startTime})
END)`;

/** Order of cases matters: terminal states first, then effective deadline, then polled signals. */
const status = (at: bigint) => sql<OrderStatus>`(CASE
  WHEN NOT ${o.valid} THEN 'invalid'
  WHEN ${o.state} = 2 AND ${o.kind} = 'sale' THEN 'sold'
  WHEN ${o.state} = 2 AND ${o.kind} = 'bid' THEN 'sold_out'
  WHEN ${o.state} = 2 AND ${o.kind} = 'covered' THEN 'exercised'
  WHEN ${o.state} = 2 THEN 'sold'
  WHEN ${o.state} = 3 THEN 'cancelled'
  WHEN ${o.state} = 5 THEN 'surrendered'
  WHEN ${o.state} = 4 THEN 'expired'
  WHEN (${o.kind} = 'sale' OR ${o.kind} = 'covered') AND NOT ${o.escrowed} THEN 'awaiting_nft'
  WHEN ${o.deadline} <> 0 AND ${num(at)} >= ${o.deadline} THEN 'expired'
  WHEN (${o.kind} = 'sale' OR ${o.kind} = 'bid') AND ${num(at)} < ${o.startTime} THEN 'not_started'
  WHEN ${o.quoteError} IS NOT NULL THEN 'blocked'
  WHEN ${o.kind} = 'bid' AND ${o.balance} < ${priceNow(at)} THEN 'underfunded'
  ELSE 'live'
END)`;

const isLive = (at: bigint) => sql`${status(at)} = 'live'`;
const isPast = (at: bigint) => sql`${status(at)} IN ('sold', 'sold_out', 'exercised', 'surrendered', 'cancelled', 'expired')`;
const finishedDesc = sql`coalesce(${o.closedAt}, nullif(${o.deadline}, 0), ${o.createdAt}) DESC`;
const notDenied = () => DENYLIST.length ? sql`lower(${o.nft}) NOT IN (${sql.join(DENYLIST.map((a) => sql`${a.toLowerCase()}`), sql`, `)})` : sql`TRUE`;

const columns = (at: bigint) => ({
  row: o,
  status: status(at),
  priceNow: priceNow(at),
  collectionName: collection.name,
  lastSalePrice: token.lastSalePrice,
});
function baseQuery(at: bigint) {
  return db.select(columns(at)).from(o)
    .leftJoin(collection, eq(collection.address, o.nft))
    .leftJoin(token, and(eq(token.nft, o.nft), eq(token.tokenId, o.tokenId)));
}
type Row = { row: typeof order.$inferSelect; status: OrderStatus; priceNow: string; collectionName: string | null; lastSalePrice: bigint | null };

function toApi(r: Row): ApiOrder {
  const x = r.row;
  const exchange = x.kind === "sale" || x.kind === "bid";
  const hasCollection = exchange || x.kind === "covered";
  return {
    address: getAddress(x.address),
    kind: x.kind as ApiOrder["kind"],
    issuer: getAddress(x.issuer),
    action: getAddress(x.action),
    actionCodehash: x.actionCodehash,
    admission: x.admission === 1 ? "holder" : "public",
    holder: x.holder ? getAddress(x.holder) : null,
    residual: getAddress(x.residual),
    config: x.config,
    deadline: x.deadline.toString(),
    state: x.state,
    status: r.status,
    ...(hasCollection ? {
      nft: getAddress(x.nft),
      collectionName: r.collectionName,
      tokenId: x.tokenId.toString(),
      anyToken: x.anyToken,
      isActionsCollection: x.isActionsCollection,
      maxRoyaltyBps: x.maxRoyaltyBps,
      payee: getAddress(x.payee),
    } : {}),
    ...(exchange ? {
      schedule: { startPrice: x.startPrice.toString(), endPrice: x.endPrice.toString(), startTime: Number(x.startTime), endTime: Number(x.endTime) },
      maxExecutions: x.maxExecutions.toString(),
      maxFeeBps: x.maxFeeBps,
      feeBps: x.feeBps < 0 ? undefined : x.feeBps,
      priceNow: String(r.priceNow),
    } : {}),
    ...(x.kind === "covered" ? { price: x.price.toString(), priceNow: x.price.toString() } : {}),
    executions: x.executions,
    createdAt: Number(x.createdAt),
    createdTx: x.createdTx,
    balance: x.balance.toString(),
    totalCredits: x.totalCredits.toString(),
    escrowed: x.escrowed,
    quoteError: x.quoteError ?? null,
    withdrawable: x.state >= 2 && (x.escrowed || x.balance > 0n),
    closedAt: x.closedAt == null ? null : Number(x.closedAt),
  };
}

function toFill(f: typeof fill.$inferSelect, collectionName: string | null): ApiFill {
  return {
    id: f.id, order: getAddress(f.order), kind: f.kind as ApiFill["kind"], nft: getAddress(f.nft), collectionName,
    tokenId: f.tokenId.toString(), price: f.price.toString(), royalty: f.royalty.toString(), fee: f.fee.toString(),
    proceeds: f.proceeds.toString(), buyer: getAddress(f.buyer), seller: getAddress(f.seller),
    timestamp: Number(f.timestamp), tx: f.tx as Hex,
  };
}
function toAccountEvent(e: typeof accountEvent.$inferSelect): ApiAccountEvent {
  return {
    id: e.id, kind: e.kind, timestamp: Number(e.timestamp), block: e.block.toString(), tx: e.tx,
    ...(e.actor ? { actor: getAddress(e.actor) } : {}),
    ...(e.recipient ? { recipient: getAddress(e.recipient) } : {}),
    ...(e.beneficiary ? { beneficiary: getAddress(e.beneficiary) } : {}),
    ...(e.amount != null ? { amount: e.amount.toString() } : {}),
  };
}

async function head(): Promise<{ block: bigint; timestamp: bigint } | null> {
  const [m] = await db.select().from(meta).where(eq(meta.id, 1));
  return m ?? null;
}
async function atOf(q: string | undefined): Promise<bigint> {
  if (q && /^\d{1,12}$/.test(q)) return BigInt(q);
  return (await head())?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
}
const addr = (s: string | undefined): Address | null => (s && isAddress(s) ? getAddress(s) : null);
const limitOf = (s: string | undefined) => Math.min(Math.max(Number(s) || 50, 1), 200);
const offsetOf = (s: string | undefined) => Math.max(Number(s) || 0, 0);
function pageOf<T>(items: T[], offset: number, limit: number, total: number): Page<T> {
  return { items, next: offset + items.length < total ? String(offset + items.length) : null, total };
}
const sortOf = (s: string | undefined, at: bigint) =>
  s === "price_asc" ? sql`${priceNow(at)} ASC, ${o.createdAt} DESC`
  : s === "price_desc" || s === "highest" ? sql`${priceNow(at)} DESC, ${o.createdAt} DESC`
  : s === "expiring" ? sql`CASE WHEN ${o.deadline} = 0 THEN 1 ELSE 0 END, ${o.deadline} ASC`
  : sql`${o.createdAt} DESC`;

// ---------------------------------------------------------------------------------------------

app.get("/api/status", async (c) => {
  const h = await head();
  const body: ApiStatus = {
    deploymentId: d.deploymentId, releaseId: d.releaseId, chainId: Number(process.env.PONDER_CHAIN_ID ?? 31337),
    block: (h?.block ?? 0n).toString(), timestamp: Number(h?.timestamp ?? 0n), ready: !!h,
  };
  return c.json(body, 200, { "cache-control": "no-store" });
});

app.get("/api/listings", async (c) => {
  const at = await atOf(c.req.query("at"));
  const nft = addr(c.req.query("collection"));
  const limit = limitOf(c.req.query("limit"));
  const offset = offsetOf(c.req.query("cursor"));
  const past = c.req.query("state") === "past";
  const where = and(eq(o.kind, "sale"), past ? isPast(at) : isLive(at), notDenied(), nft ? eq(o.nft, nft) : undefined);
  const [rows, [{ n }]] = await Promise.all([
    baseQuery(at).where(where).orderBy(past ? finishedDesc : sortOf(c.req.query("sort"), at)).limit(limit).offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(o).where(where),
  ]);
  return c.json(pageOf((rows as Row[]).map(toApi), offset, limit, n));
});

app.get("/api/collections/:nft/offers", async (c) => {
  const nft = addr(c.req.param("nft"));
  if (!nft) return c.json({ error: "bad address" }, 400);
  const at = await atOf(c.req.query("at"));
  const tokenId = c.req.query("token");
  const forToken = tokenId && /^\d+$/.test(tokenId) ? or(eq(o.anyToken, true), eq(o.tokenId, BigInt(tokenId))) : undefined;
  const past = c.req.query("state") === "past";
  const rows = await baseQuery(at)
    .where(and(eq(o.kind, "bid"), eq(o.nft, nft), past ? isPast(at) : sql`${status(at)} IN ('live', 'underfunded')`, forToken))
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
    address: getAddress(r.address as string), name: (r.name as string) ?? null, symbol: (r.symbol as string) ?? null,
    isERC721: !!r.isERC721, supports2981: !!r.supports2981,
    floor: r.floor == null ? null : String(r.floor), topOffer: r.topOffer == null ? null : String(r.topOffer),
    listed: Number(r.listed), offers: Number(r.offers), volume: String(r.volume), sales: Number(r.sales),
  }));
}

app.get("/api/collections", async (c) => c.json(await collectionStats(await atOf(c.req.query("at")), periodSeconds(c.req.query("period")))));
app.get("/api/collections/:nft", async (c) => {
  const nft = addr(c.req.param("nft"));
  if (!nft) return c.json({ error: "bad address" }, 400);
  const [one] = await collectionStats(await atOf(c.req.query("at")), periodSeconds(c.req.query("period")), nft);
  return one ? c.json(one) : c.json({ error: "not found" }, 404);
});

app.get("/api/tokens/:nft/:id", async (c) => {
  const nft = addr(c.req.param("nft"));
  const id = c.req.param("id");
  if (!nft || !/^\d+$/.test(id)) return c.json({ error: "bad token" }, 400);
  const at = await atOf(c.req.query("at"));
  const tokenId = BigInt(id);
  const [listings, offers, fills] = await Promise.all([
    baseQuery(at).where(and(eq(o.kind, "sale"), eq(o.nft, nft), eq(o.tokenId, tokenId), eq(o.valid, true)))
      .orderBy(sql`CASE WHEN ${status(at)} = 'live' THEN 0 WHEN ${o.state} < 2 THEN 1 ELSE 2 END, ${o.createdAt} DESC`).limit(1),
    baseQuery(at).where(and(eq(o.kind, "bid"), eq(o.nft, nft), or(eq(o.anyToken, true), eq(o.tokenId, tokenId)), sql`${status(at)} IN ('live', 'underfunded')`))
      .orderBy(sql`${priceNow(at)} DESC`),
    db.select().from(fill).where(and(eq(fill.nft, nft), eq(fill.tokenId, tokenId))).orderBy(desc(fill.timestamp)).limit(20),
  ]);
  const [coll] = await db.select().from(collection).where(eq(collection.address, nft));
  return c.json({
    nft, tokenId: id, collectionName: coll?.name ?? null,
    listing: listings[0] ? toApi(listings[0] as Row) : null,
    offers: (offers as Row[]).map(toApi),
    fills: fills.map((f) => toFill(f, coll?.name ?? null)),
  });
});

app.get("/api/orders/:address", async (c) => {
  const a = addr(c.req.param("address"));
  if (!a) return c.json({ error: "bad address" }, 400);
  const [r] = await baseQuery(await atOf(c.req.query("at"))).where(eq(o.address, a));
  return r ? c.json(toApi(r as Row)) : c.json({ error: "not found" }, 404);
});

/** Full backing-account detail: the order plus its credits and history. Served even after the
 * Actions token burns (credits and recovery survive). */
app.get("/api/accounts/:address", async (c) => {
  const a = addr(c.req.param("address"));
  if (!a) return c.json({ error: "bad address" }, 400);
  const at = await atOf(c.req.query("at"));
  const [r] = await baseQuery(at).where(eq(o.address, a));
  if (!r) return c.json({ error: "not found" }, 404);
  const [credits, history] = await Promise.all([
    db.select().from(credit).where(and(eq(credit.account, a), sql`${credit.amount} > 0`)),
    db.select().from(accountEvent).where(eq(accountEvent.account, a)).orderBy(desc(accountEvent.block), desc(accountEvent.id)).limit(100),
  ]);
  const body: ApiAccount = {
    ...toApi(r as Row),
    credits: credits.map((x) => ({ beneficiary: getAddress(x.beneficiary), amount: x.amount.toString() })),
    history: history.map(toAccountEvent),
  };
  return c.json(body);
});

app.get("/api/accounts/:address/positions", async (c) => {
  const a = addr(c.req.param("address"));
  if (!a) return c.json({ error: "bad address" }, 400);
  const at = await atOf(c.req.query("at"));
  const rows = (await baseQuery(at)
    .where(and(
      or(eq(o.issuer, a), eq(o.holder, a)),
      or(sql`${o.state} IN (0, 1)`, eq(o.escrowed, true), sql`${o.balance} > 0`, sql`${o.totalCredits} > 0`),
    ))
    .orderBy(desc(o.createdAt)).limit(500)) as Row[];
  const body: ApiPositions = {
    listings: rows.filter((r) => r.row.kind === "sale").map(toApi),
    offers: rows.filter((r) => r.row.kind === "bid").map(toApi),
    rights: rows.filter((r) => r.row.kind === "covered" || r.row.kind === "reserved").map(toApi),
  };
  return c.json(body);
});

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
  return c.json(pageOf(rows.map((r) => toFill(r.f, r.name)), offset, limit, n));
});

app.get("/api/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 64);
  const empty: ApiSearch = { collections: [], tokens: [] };
  if (!q) return c.json(empty);
  const m = q.match(/^(.*?)\s*#\s*(\d+)$/);
  const name = (m ? m[1] : q)!.trim();
  const like = `%${name.replace(/[%_\\]/g, (x) => `\\${x}`)}%`;
  const byName = name ? (isAddress(name) ? eq(collection.address, getAddress(name)) : or(ilike(collection.name, like), ilike(collection.symbol, like))) : undefined;
  const colls = (await db.select().from(collection).where(and(eq(collection.isERC721, true), byName)).limit(8)).filter((x) => !DENYLIST.some((dd) => dd.toLowerCase() === x.address.toLowerCase()));
  const body: ApiSearch = {
    collections: colls.map((x) => ({ address: getAddress(x.address), name: x.name, symbol: x.symbol })),
    tokens: m && colls.length
      ? (await db.selectDistinct({ nft: o.nft, tokenId: o.tokenId }).from(o).where(and(inArray(o.nft, colls.map((x) => x.address)), eq(o.tokenId, BigInt(m[2]!)), eq(o.anyToken, false))).limit(8))
          .map((t) => ({ nft: getAddress(t.nft), collectionName: colls.find((x) => x.address === t.nft)?.name ?? null, tokenId: t.tokenId.toString() }))
      : [],
  };
  return c.json(body);
});

export default app;
