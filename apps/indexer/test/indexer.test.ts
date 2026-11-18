// The indexer against a real chain (PLAN.md §10): a seeded market, fake orders and events that
// must be rejected, time states without events, silent top-ups, SQL price parity, and a reorg.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  encodeSaleConfig,
  fixedSchedule,
  keccak256Config,
  priceAt,
  toSchedule,
  tx,
  type ApiCollection,
  type ApiOrder,
  type ApiPositions,
  type Page,
  type SaleConfig,
  encodeCoveredConfig,
  encodeExerciseInput,
  marketAbi,
  rightAbi,
  rightsAbi,
  type ApiRight,
  encodeBidConfig,
} from "./imports";
import { ACCOUNTS, artifacts, createdOrder, freePort, mint, send, startChain, type Chain } from "@market/protocol/devchain";
import { seed } from "@market/protocol/devchain/seed";
import { parseEther, decodeEventLog, encodeFunctionData, type Address, type Hex } from "viem";
import { afterAll, beforeAll, expect, test } from "vitest";

const E = (s: string) => parseEther(s);
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

/** Wait until the indexer has seen block `n` (the poll writes the head). */
async function synced(n?: bigint) {
  // cacheTime 0: viem caches the head for the polling interval, so right after mining it can
  // return a block from before the transaction under test.
  const target = n ?? (await c.pub.getBlockNumber({ cacheTime: 0 }));
  for (let i = 0; i < 300; i++) {
    try {
      const st = await get<{ block: string }>("/api/status");
      if (BigInt(st.block) >= target) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`indexer did not reach block ${target}`);
}

/** Mine `n` empty blocks so the 5-block poll lane runs. */
async function pollCycle() {
  await c.test.mine({ blocks: 6 });
  await synced();
}

beforeAll(async () => {
  c = await startChain();
  s = await seed(c);
  const port = await freePort();
  api = `http://127.0.0.1:${port}`;
  dir = mkdtempSync(join(tmpdir(), "ponder-test-"));
  // Freeze imported code for this run instead of hot-reloading a live database.
  ponder = spawn("npx", ["ponder", "start", "--schema", "market_test", "--port", String(port)], {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, PONDER_CHAIN_ID: "31337", PONDER_RPC_URL: c.rpcUrl, PGLITE_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
    // Own process group, so teardown stops Ponder itself and not only the npx wrapper.
    detached: true,
  });
  const log = createWriteStream(join(tmpdir(), `market-indexer-rights-${process.pid}.log`));
  ponder.stdout?.pipe(log);
  ponder.stderr?.pipe(log);
  ponder.once("exit", () => log.end());
  await c.test.mine({ blocks: 1 });
  await synced();
  await pollCycle();
}, 300_000);

afterAll(async () => {
  // Stop Ponder and wait for it to exit before deleting its database directory: deleting while
  // it still writes failed with ENOTEMPTY in CI.
  if (ponder?.pid && ponder.exitCode === null) {
    const exited = new Promise((r) => ponder.once("exit", r));
    process.kill(-ponder.pid, "SIGTERM");
    await Promise.race([exited, new Promise((r) => setTimeout(r, 10_000))]);
  }
  c?.stop();
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const order = (a: Address) => get<ApiOrder>(`/api/orders/${a}`);

test("seeded orders have the right states", async () => {
  const o = s.orders;
  expect((await order(o.fixed)).status).toBe("live");
  expect((await order(o.awaitingNft)).status).toBe("awaiting_nft");
  const blocked = await order(o.royaltyBlocked);
  expect([blocked.status, blocked.quoteError]).toEqual(["blocked", "RoyaltyAboveLimit"]);
  expect((await order(o.underfunded)).status).toBe("underfunded");
  expect((await order(o.cheap)).status).toBe("sold");
  const cancelled = await order(o.myCancelled);
  expect([cancelled.status, cancelled.withdrawable]).toEqual(["cancelled", true]);
  const co = await order(o.collectionOffer);
  // 3.85 deposited, one fill at 0.55, a 0.1 top-up that emitted no event.
  expect([co.fills, co.balance]).toEqual([1, E("3.4").toString()]);
});

test("fake orders and events are not indexed", async () => {
  const col = s.collections;
  const attacker = ACCOUNTS[7];
  // 1. A genuine clone of Order deployed outside Market, filled through the real NFTSale: the
  //    handler emits a real Sold for an order Market never created.
  const id = await mint(c, col.driftlines, attacker);
  const config: SaleConfig = { nft: col.driftlines, tokenId: id, schedule: fixedSchedule(E("0.01")), proceedsTo: attacker, maxRoyaltyBps: 1000 };
  const bytes = encodeSaleConfig(config);
  const impl = c.deployment.orderImplementation;
  const { result: clone, request } = await c.pub.simulateContract({
    address: col.rogueCloneFactory,
    abi: artifacts.RogueCloneFactory.abi,
    functionName: "deploy",
    args: [impl, attacker, c.deployment.nftSale, keccak256Config(bytes), `0x${"11".repeat(32)}`],
    account: attacker,
  });
  await c.pub.waitForTransactionReceipt({ hash: await c.wallet(attacker).writeContract(request) });
  await send(c, attacker, tx.depositNft(col.driftlines, attacker, clone, id));
  await send(c, ACCOUNTS[8], tx.buy(clone, bytes, ACCOUNTS[8], E("0.01")));
  // 2. A contract emitting Sold's exact signature.
  await send(c, attacker, { address: col.fakeSoldEmitter, abi: artifacts.FakeSoldEmitter.abi, functionName: "emitSold", args: [s.orders.fixed, attacker, E("1000")] });
  // 3. A Created for a handler we do not trade.
  const unknown = createdOrder(
    (await send(c, attacker, { ...tx.createListing(c.deployment, config, tx.randomSalt()), args: [col.refusingReceiver, bytes, tx.randomSalt()] })).receipt,
  );
  // 4. Garbage config on the real NFTSale.
  const garbage = createdOrder(
    (await send(c, attacker, { ...tx.createListing(c.deployment, config, tx.randomSalt()), args: [c.deployment.nftSale, "0x1234", tx.randomSalt()] })).receipt,
  );
  await pollCycle();

  await expect(order(clone)).rejects.toThrow(/404/);
  await expect(order(unknown)).rejects.toThrow(/404/);
  expect((await order(garbage)).status).toBe("invalid");
  expect((await order(s.orders.fixed)).status).toBe("live"); // the fake Sold changed nothing
  const activity = await get<Page<{ order: Address }>>(`/api/accounts/${ACCOUNTS[8]}/activity`);
  expect(activity.items.map((f) => f.order)).not.toContain(clone);
  const [drift] = (await get<ApiCollection[]>("/api/collections")).filter((x) => x.address === col.driftlines);
  expect(BigInt(drift!.volume)).toBe(E("0.62") + E("0.55"));
});

test("SQL price matches priceAt at any time", async () => {
  const head = (await c.pub.getBlock()).timestamp;
  for (const at of [head, head + 3_600n, head + 86_400n * 2n + 17n, head + 86_400n * 9n]) {
    const page = await get<Page<ApiOrder>>(`/api/listings?at=${at}&limit=200`);
    for (const o of page.items) expect(o.priceNow).toBe(priceAt(toSchedule(o.schedule), at).toString());
  }
  const asc = await get<Page<ApiOrder>>(`/api/listings?at=${head}&sort=price_asc`);
  const prices = asc.items.map((o) => BigInt(o.priceNow));
  expect(prices).toEqual([...prices].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
});

test("time states change without events", async () => {
  const exp = await order(s.orders.expiring);
  expect(exp.status).toBe("live");
  const later = exp.schedule.expiry + 1;
  expect((await get<ApiOrder>(`/api/orders/${s.orders.expiring}?at=${later}`)).status).toBe("expired");
  // A risingOffer funded for its start price becomes underfunded as the price rises.
  const ro = await order(s.orders.risingOffer);
  expect((await get<ApiOrder>(`/api/orders/${s.orders.risingOffer}?at=${ro.schedule.endTime}`)).status).toBe("live");
});

test("past listings and offers: finished orders only, with what they traded for", async () => {
  const past = await get<Page<ApiOrder>>(`/api/listings?state=past&limit=200`);
  const byAddr = new Map(past.items.map((o) => [o.address, o]));
  expect(byAddr.get(s.orders.cheap)).toMatchObject({ status: "sold", filled: E("0.62").toString() });
  expect(byAddr.get(s.orders.cheap)!.closedAt).toBeGreaterThan(0);
  expect(byAddr.get(s.orders.myCancelled)).toMatchObject({ status: "cancelled", filled: "0" });
  for (const o of past.items) expect(["sold", "cancelled", "expired"]).toContain(o.status);
  expect(byAddr.has(s.orders.fixed)).toBe(false); // live
  expect(byAddr.has(s.orders.awaitingNft)).toBe(false); // open, not finished
  // An expiry in the past makes a listing past without any event.
  const exp = await order(s.orders.expiring);
  const later = await get<Page<ApiOrder>>(`/api/listings?state=past&limit=200&at=${exp.schedule.expiry + 1}`);
  expect(later.items.map((o) => o.address)).toContain(s.orders.expiring);
  const offersPast = await get<ApiOrder[]>(`/api/collections/${s.collections.driftlines}/offers?state=past&at=${exp.schedule.expiry + 86_400 * 30}`);
  expect(offersPast.map((o) => o.address)).toEqual(expect.arrayContaining([s.orders.tokenOffer, s.orders.risingOffer]));
  for (const o of offersPast) expect(["sold_out", "cancelled", "expired"]).toContain(o.status);
});

test("positions list what the owner can act on", async () => {
  const p = await get<ApiPositions>(`/api/accounts/${s.me}/positions`);
  expect(p.listings.map((o) => o.address)).toEqual(expect.arrayContaining([s.orders.myListing, s.orders.myFixed, s.orders.myCancelled]));
  expect(p.offers.map((o) => o.address)).toEqual(expect.arrayContaining([s.orders.myOffer, s.orders.myTokenOffer]));
});

test("a reorg removes a fill", async () => {
  const id = await mint(c, s.collections.meridian, ACCOUNTS[6]);
  const config: SaleConfig = { nft: s.collections.meridian, tokenId: id, schedule: fixedSchedule(E("0.3")), proceedsTo: ACCOUNTS[6], maxRoyaltyBps: 1000 };
  const o = createdOrder((await send(c, ACCOUNTS[6], tx.createListing(c.deployment, config, tx.randomSalt()))).receipt);
  await send(c, ACCOUNTS[6], tx.depositNft(config.nft, ACCOUNTS[6], o, id));
  await pollCycle();
  await send(c, ACCOUNTS[8], tx.buy(o, encodeSaleConfig(config), ACCOUNTS[8], E("0.3")));
  await synced();
  expect((await order(o)).status).toBe("sold");
  // Replace the last block (the buy) with an empty one, then extend the chain.
  await c.pub.request({ method: "anvil_reorg" as never, params: [1, []] as never });
  await c.test.mine({ blocks: 8 });
  for (let i = 0; i < 100 && (await order(o)).status === "sold"; i++) await new Promise((r) => setTimeout(r, 200));
  expect((await order(o)).status).toBe("live");
});

const rightView = (account: Address, at?: bigint) => get<ApiRight>(`/api/rights/${account}${at == null ? "" : `?at=${at}`}`);

async function createRight(issuer: Address, options: { activate?: boolean; malformed?: boolean; unknown?: boolean; deadline?: bigint } = {}) {
  const tokenId = await mint(c, s.collections.driftlines, issuer);
  const config = options.malformed ? "0x1234" as Hex : encodeCoveredConfig({ nft: s.collections.driftlines, tokenId, price: E("1"), proceedsTo: issuer, maxRoyaltyBps: 500 });
  const handler = options.unknown ? s.collections.refusingReceiver : c.deployment.coveredNFTPurchase!;
  const deadline = options.deadline ?? (await c.pub.getBlock()).timestamp + 86_400n;
  const { receipt } = await send(c, issuer, { address: c.deployment.market, abi: marketAbi, functionName: "createRight", args: [handler, config, deadline, issuer, tx.randomSalt()] });
  const created = receipt.logs.flatMap((log) => {
    try { const x = decodeEventLog({ abi: marketAbi, data: log.data, topics: log.topics }); return x.eventName === "RightCreated" ? [x.args] : []; } catch { return []; }
  })[0];
  if (!created || !("account" in created)) throw new Error("missing authenticated creation event");
  const account = created.account as Address;
  await send(c, issuer, tx.depositNft(s.collections.driftlines, issuer, account, tokenId));
  if (options.activate) await send(c, issuer, { address: account, abi: rightAbi, functionName: "activate", args: [config] });
  await pollCycle();
  return { account, tokenId, config, deadline, id: BigInt(account) };
}

test("rights are discovered before listing and follow direct canonical transfers", async () => {
  const issuer = ACCOUNTS[4], buyer = ACCOUNTS[5], recipient = ACCOUNTS[6];
  const r = await createRight(issuer);
  const pending = await rightView(r.account);
  expect(pending).toMatchObject({ state: 0, issuer, holder: null, supported: true, backed: true, tokenId: r.id.toString() });
  expect(r.id).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
  const discovery = await get<Page<ApiRight>>("/api/rights");
  expect(discovery.items.some((x) => x.account === r.account)).toBe(true);
  const status = await fetch(api + "/api/status");
  expect(status.headers.get("x-market-deployment")).toBe(c.deployment.deploymentId);
  expect((await status.json()).deploymentId).toBe(c.deployment.deploymentId);
  await send(c, issuer, { address: r.account, abi: rightAbi, functionName: "activate", args: [r.config] });
  await send(c, issuer, tx.depositNft(c.deployment.rights!, issuer, buyer, r.id));
  await synced();
  expect((await rightView(r.account)).holder).toBe(buyer);
  const positions = await get<ApiPositions>(`/api/accounts/${buyer}/positions`);
  expect(positions.rights?.map((x) => x.account)).toContain(r.account);

  await send(c, buyer, { address: r.account, abi: rightAbi, functionName: "exercise", args: [r.config, encodeExerciseInput(recipient)], value: E("1") });
  await pollCycle();
  expect(await c.pub.readContract({ address: s.collections.driftlines, abi: artifacts.TestNFT.abi, functionName: "ownerOf", args: [r.tokenId] })).toBe(recipient);
  const exercised = await rightView(r.account);
  expect(exercised).toMatchObject({ state: 2, holder: null, isLive: false });
  expect(exercised.credits).toEqual(expect.arrayContaining([
    { beneficiary: issuer, amount: E("0.95").toString() },
    { beneficiary: ACCOUNTS[9], amount: E("0.05").toString() },
  ]));
  expect(exercised.history?.map((x) => x.kind)).toContain("exercised");
  expect(exercised.history?.find((x) => x.kind === "exercise_delivery")).toMatchObject({ from: buyer, recipient });
  // The delivery recipient remains historical evidence after a later ordinary nft transfer.
  await send(c, recipient, tx.depositNft(s.collections.driftlines, recipient, issuer, r.tokenId));
  await pollCycle();
  expect((await rightView(r.account)).history?.find((x) => x.kind === "exercise_delivery")?.recipient).toBe(recipient);
  expect((await get<ApiPositions>(`/api/accounts/${ACCOUNTS[9]}/positions`)).rights?.map((x) => x.account)).toContain(r.account);
  await send(c, ACCOUNTS[8], { address: r.account, abi: rightAbi, functionName: "releaseCredit", args: [ACCOUNTS[9]] });
  await synced();
  expect((await rightView(r.account)).credits.find((x) => x.beneficiary === ACCOUNTS[9])?.amount).toBe("0");
  expect((await rightView(r.account)).history?.map((x) => x.kind)).toContain("credit_withdrawn");
});

test("invalid and unsupported configurations stay inspectable without invented exercise terms", async () => {
  const malformed = await createRight(ACCOUNTS[4], { malformed: true });
  const unknown = await createRight(ACCOUNTS[4], { unknown: true });
  expect(await rightView(malformed.account)).toMatchObject({ supported: false, state: 0, configError: expect.any(String) });
  expect(await rightView(unknown.account)).toMatchObject({ supported: false, state: 0, price: null, nft: null });
  await expect(rightView(s.collections.fakeSoldEmitter)).rejects.toThrow(/404/);
  await send(c, ACCOUNTS[4], { address: malformed.account, abi: rightAbi, functionName: "cancelSetup", args: [] });
  await send(c, ACCOUNTS[4], {
    address: malformed.account, abi: rightAbi, functionName: "recover",
    args: [s.collections.driftlines, 0n, encodeFunctionData({ abi: artifacts.TestNFT.abi, functionName: "transferFrom", args: [malformed.account, ACCOUNTS[4], malformed.tokenId] })],
  });
  await synced();
  expect((await rightView(malformed.account)).state).toBe(5);
});

test("listed rights expose premiums separately and expire without finalization", async () => {
  const issuer = ACCOUNTS[4], buyer = ACCOUNTS[5];
  const r = await createRight(issuer, { activate: true });
  const config = { nft: c.deployment.rights!, tokenId: r.id, schedule: fixedSchedule(E("0.2")), proceedsTo: issuer, maxRoyaltyBps: 0 };
  const listing = createdOrder((await send(c, issuer, tx.createListing(c.deployment, config, tx.randomSalt()))).receipt);
  await send(c, issuer, tx.depositNft(c.deployment.rights!, issuer, listing, r.id));
  await pollCycle();
  expect((await rightView(r.account)).listing?.address).toBe(listing);
  expect(await order(listing)).toMatchObject({ rightAccount: r.account, underlyingNft: s.collections.driftlines, underlyingTokenId: r.tokenId.toString() });
  // Even a perpetual listing can't advertise an expired exercise entitlement as live.
  expect((await get<ApiOrder>(`/api/orders/${listing}?at=${r.deadline}`)).status).toBe("blocked");
  await send(c, buyer, tx.buy(listing, encodeSaleConfig(config), buyer, E("0.2")));
  await synced();
  const bought = await rightView(r.account);
  expect(bought.holder).toBe(buyer);
  expect(bought.history?.find((x) => x.kind === "premium_sale")?.amount).toBe(E("0.2").toString());
  const expired = await rightView(r.account, r.deadline);
  expect(expired).toMatchObject({ state: 1, effectiveExpired: true, isLive: false });

  const bidConfig = encodeBidConfig({ nft: c.deployment.rights!, anyToken: true, tokenId: 0n, schedule: fixedSchedule(E("0.1")), recipient: buyer, maxFills: 1n });
  const bid = createdOrder((await send(c, buyer, { address: c.deployment.market, abi: marketAbi, functionName: "create", args: [c.deployment.nftBid, bidConfig, tx.randomSalt()], value: E("0.1") })).receipt);
  await pollCycle();
  expect((await order(bid)).status).toBe("invalid");
});

test("expiry while listed and pending cancellation retain issuer recovery records", async () => {
  const issuer = ACCOUNTS[4];
  const r = await createRight(issuer, { activate: true });
  const config: SaleConfig = {
    nft: c.deployment.rights!, tokenId: r.id, schedule: { ...fixedSchedule(E("0.2")), expiry: r.deadline - 3600n },
    proceedsTo: issuer, maxRoyaltyBps: 0,
  };
  const listing = createdOrder((await send(c, issuer, tx.createListing(c.deployment, config, tx.randomSalt()))).receipt);
  await send(c, issuer, tx.depositNft(c.deployment.rights!, issuer, listing, r.id));
  await pollCycle();
  expect((await rightView(r.account)).listing?.address).toBe(listing);
  await c.test.setNextBlockTimestamp({ timestamp: r.deadline });
  await pollCycle();
  expect(await rightView(r.account)).toMatchObject({ state: 1, holder: listing, effectiveExpired: true, isLive: false });
  expect((await order(listing)).status).not.toBe("live");
  await send(c, issuer, tx.close(listing));
  await synced();
  expect(await rightView(r.account)).toMatchObject({ escrowOrder: listing, listingSeller: issuer });
  expect((await rightView(r.account)).listing).toMatchObject({ address: listing, rightAccount: r.account, closed: true, rightTransferable: false, withdrawable: false });
  expect((await order(listing)).withdrawable).toBe(false);
  const decoy = createdOrder((await send(c, ACCOUNTS[8], tx.createListing(c.deployment, { ...config, proceedsTo: ACCOUNTS[8] }, tx.randomSalt()))).receipt);
  await synced();
  expect((await order(decoy)).escrowed).toBe(false);
  await send(c, ACCOUNTS[8], { address: r.account, abi: rightAbi, functionName: "finalizeExpiry", args: [] });
  await send(c, issuer, { address: r.account, abi: rightAbi, functionName: "recover", args: [s.collections.driftlines, 0n,
    encodeFunctionData({ abi: artifacts.TestNFT.abi, functionName: "transferFrom", args: [r.account, issuer, r.tokenId] })] });
  await pollCycle();
  expect(await rightView(r.account)).toMatchObject({ state: 3, holder: null, backingOwner: issuer, backed: false, escrowOrder: listing, listingSeller: issuer, listing: { address: listing, closed: true, rightTransferable: false } });
  expect((await rightView(r.account)).listing?.address).not.toBe(decoy);

  const pending = await createRight(issuer);
  await send(c, issuer, { address: pending.account, abi: rightAbi, functionName: "cancelSetup", args: [] });
  await send(c, issuer, { address: pending.account, abi: rightAbi, functionName: "recover", args: [s.collections.driftlines, 0n,
    encodeFunctionData({ abi: artifacts.TestNFT.abi, functionName: "transferFrom", args: [pending.account, issuer, pending.tokenId] })] });
  await pollCycle();
  expect(await rightView(pending.account)).toMatchObject({ state: 5, holder: null, backingOwner: issuer, backed: false });
});

test("live listing cancellation preserves the right and surrender gives no premium refund", async () => {
  const issuer = ACCOUNTS[4], buyer = ACCOUNTS[5];
  const r = await createRight(issuer, { activate: true });
  const config: SaleConfig = { nft: c.deployment.rights!, tokenId: r.id, schedule: fixedSchedule(E("0.2")), proceedsTo: issuer, maxRoyaltyBps: 0 };
  const listing = createdOrder((await send(c, issuer, tx.createListing(c.deployment, config, tx.randomSalt()))).receipt);
  await send(c, issuer, tx.depositNft(c.deployment.rights!, issuer, listing, r.id));
  await send(c, issuer, tx.close(listing));
  await send(c, issuer, tx.withdrawNft(listing, c.deployment.rights!, issuer, r.id));
  await pollCycle();
  expect(await rightView(r.account)).toMatchObject({ state: 1, holder: issuer, isLive: true, backed: true, deadline: r.deadline.toString() });
  // The right still has the same commitment after the independent listing is canceled.
  const sale = createdOrder((await send(c, issuer, tx.createListing(c.deployment, config, tx.randomSalt()))).receipt);
  await send(c, issuer, tx.depositNft(c.deployment.rights!, issuer, sale, r.id));
  await send(c, buyer, tx.buy(sale, encodeSaleConfig(config), buyer, E("0.2")));
  await send(c, buyer, { address: r.account, abi: rightAbi, functionName: "surrender", args: [] });
  await pollCycle();
  const surrendered = await rightView(r.account);
  expect(surrendered).toMatchObject({ state: 4, holder: null, residual: issuer, totalCredits: "0", balance: "0", backed: true });
  expect(surrendered.history?.some((x) => x.kind === "premium_sale" && x.amount === E("0.2").toString())).toBe(true);
  expect(surrendered.history?.some((x) => x.kind === "surrendered" && x.from === buyer)).toBe(true);
  await send(c, issuer, { address: r.account, abi: rightAbi, functionName: "recover", args: [s.collections.driftlines, 0n,
    encodeFunctionData({ abi: artifacts.TestNFT.abi, functionName: "transferFrom", args: [r.account, issuer, r.tokenId] })] });
  await pollCycle();
  expect((await rightView(r.account)).backingOwner).toBe(issuer);
});
