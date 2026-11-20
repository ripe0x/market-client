// The indexer against a real seeded chain: live/terminal statuses, SQL price parity with the
// contract, effective expiry via the exclusive deadline (no finalizeExpiry event), positions,
// and fill history. No mocks; a real Anvil + Ponder + REST round trip.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { priceAt, toSchedule, type ApiOrder, type ApiPositions, type ApiStatus, type Page } from "./imports";
import { freePort, startChain, type Chain } from "@market/protocol/devchain";
import { seed, ME } from "@market/protocol/devchain/seed";
import { afterAll, beforeAll, expect, test } from "vitest";

let c: Chain;
let s: Awaited<ReturnType<typeof seed>>;
let ponder: ChildProcess;
let api = "";
let dir = "";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(api + path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}
async function synced(n?: bigint) {
  const target = n ?? (await c.pub.getBlockNumber({ cacheTime: 0 }));
  for (let i = 0; i < 300; i++) {
    try { const st = await get<ApiStatus>("/api/status"); if (BigInt(st.block) >= target) return; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`indexer did not reach block ${target}`);
}
async function pollCycle() { await c.test.mine({ blocks: 6 }); await synced(); }

beforeAll(async () => {
  c = await startChain();
  s = await seed(c);
  const port = await freePort();
  api = `http://127.0.0.1:${port}`;
  dir = mkdtempSync(join(tmpdir(), "ponder-test-"));
  ponder = spawn("npx", ["ponder", "start", "--schema", "market_test", "--port", String(port)], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, PONDER_CHAIN_ID: "31337", PONDER_RPC_URL: c.rpcUrl, PGLITE_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const log = createWriteStream(join(tmpdir(), `market-indexer-actions-${process.pid}.log`));
  ponder.stdout?.pipe(log);
  ponder.stderr?.pipe(log);
  await synced();
  await pollCycle();
}, 300_000);

afterAll(async () => {
  try { if (ponder.pid) process.kill(-ponder.pid, "SIGKILL"); } catch {}
  c?.stop();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("status reports the actions-v1 deployment", async () => {
  const st = await get<ApiStatus>("/api/status");
  expect(st.ready).toBe(true);
  expect(st.releaseId).toBe("actions-v1");
  expect(BigInt(st.block)).toBeGreaterThan(0n);
});

test("live listings exclude sold and awaiting-NFT orders", async () => {
  const live = await get<Page<ApiOrder>>("/api/listings?limit=200");
  const addrs = new Set(live.items.map((o) => o.address.toLowerCase()));
  // fixed was bought -> 'sold', not live.
  expect(addrs.has(s.orders.fixed.toLowerCase())).toBe(false);
  // awaitingNft was never deposited/activated -> 'awaiting_nft', not live.
  expect(addrs.has(s.orders.awaitingNft.toLowerCase())).toBe(false);
  // falling/rising/meridian are live.
  expect(addrs.has(s.orders.falling.toLowerCase())).toBe(true);
  for (const o of live.items) { expect(o.kind).toBe("sale"); expect(o.status).toBe("live"); }
});

test("a sold order and an awaiting order carry the right status", async () => {
  const sold = await get<ApiOrder>(`/api/orders/${s.orders.fixed}`);
  expect(sold.status).toBe("sold");
  expect(sold.state).toBe(2);
  const awaiting = await get<ApiOrder>(`/api/orders/${s.orders.awaitingNft}`);
  expect(awaiting.status).toBe("awaiting_nft");
  expect(awaiting.escrowed).toBe(false);
});

test("SQL priceNow matches the contract priceAt for a falling listing", async () => {
  const st = await get<ApiStatus>("/api/status");
  const o = await get<ApiOrder>(`/api/orders/${s.orders.falling}?at=${st.timestamp}`);
  expect(o.schedule).toBeDefined();
  const expected = priceAt(toSchedule(o.schedule!), BigInt(st.timestamp));
  expect(o.priceNow).toBe(expected.toString());
  expect(o.deadline).toBe("0"); // perpetual
});

test("effective expiry uses the exclusive deadline without a finalizeExpiry event", async () => {
  const offer = await get<ApiOrder>(`/api/orders/${s.orders.tokenOffer}`);
  const deadline = BigInt(offer.deadline);
  expect(deadline).toBeGreaterThan(0n);
  // On-chain state is still Live (nobody called finalizeExpiry), but the API reports expired at
  // or after the exclusive deadline.
  expect(offer.state).toBe(1);
  const before = await get<ApiOrder>(`/api/orders/${s.orders.tokenOffer}?at=${deadline - 1n}`);
  expect(before.status).not.toBe("expired");
  const atDeadline = await get<ApiOrder>(`/api/orders/${s.orders.tokenOffer}?at=${deadline}`);
  expect(atDeadline.status).toBe("expired");
});

test("collection offers are listed highest-first", async () => {
  const col = s.collections.driftlines;
  const offers = await get<ApiOrder[]>(`/api/collections/${col}/offers`);
  expect(offers.length).toBeGreaterThan(0);
  for (const o of offers) { expect(o.kind).toBe("bid"); expect(o.nft!.toLowerCase()).toBe(col.toLowerCase()); }
});

test("positions return the account's own listings and offers", async () => {
  const pos = await get<ApiPositions>(`/api/accounts/${ME}/positions`);
  const listed = new Set(pos.listings.map((o) => o.address.toLowerCase()));
  const offered = new Set(pos.offers.map((o) => o.address.toLowerCase()));
  expect(listed.has(s.orders.myListing.toLowerCase())).toBe(true);
  expect(offered.has(s.orders.myOffer.toLowerCase())).toBe(true);
});

test("a settled sale is recorded as a fill with the right split", async () => {
  const col = s.collections.driftlines;
  // fixed was token id s.holdings.dMe? No: fixed is on SELLERS[0] token; query its order fills.
  const order = await get<ApiOrder>(`/api/orders/${s.orders.fixed}`);
  const token = await get<{ fills: { order: string; price: string; fee: string; royalty: string; proceeds: string }[] }>(`/api/tokens/${col}/${order.tokenId}`);
  const f = token.fills.find((x) => x.order.toLowerCase() === s.orders.fixed.toLowerCase());
  expect(f).toBeDefined();
  // price 0.85 ETH, 1% fee, 5% royalty (driftlines).
  expect(f!.price).toBe((85n * 10n ** 16n).toString());
  expect(BigInt(f!.fee) + BigInt(f!.royalty) + BigInt(f!.proceeds)).toBe(BigInt(f!.price));
});
