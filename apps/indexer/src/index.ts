import {
  decodeCoveredConfig, decodeExchangeConfig, decodeReservedConfig, decodeBidTerms, decodeSaleTerms,
  decodeRevert, erc721Abi, exchangeActionAbi, feeOf, INTERFACE, MULTICALL3, multicall3Abi,
  Side, verifyDeployment, saleInput, bidInput,
} from "@market/protocol";
import { decodeAbiParameters } from "viem";
import { and, eq, or, sql } from "ponder";
import { ponder, type Context } from "ponder:registry";
import { accountEvent, collection, credit, fill, meta, order, token } from "ponder:schema";
import { createPublicClient, getAddress, http, isAddressEqual, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { deployment as d } from "./deployment";

const ZERO = zeroAddress;
const orderOfTokenId = (id: bigint): Address => getAddress(`0x${id.toString(16).padStart(40, "0")}`);

ponder.on("Market:setup", async () => {
  const live = createPublicClient({ transport: http(process.env.PONDER_RPC_URL ?? d.rpcUrl) });
  const mismatch = await verifyDeployment(live as PublicClient, d);
  if (mismatch.length) throw new Error(`Deployment identity mismatch: ${mismatch.join(", ")}`);
});

// ---------------------------------------------------------------------------------------------
// Market.Created: the only way an order enters the index. Decodes the known action configs.

type Terms = {
  kind: "sale" | "bid" | "covered" | "reserved" | "unknown";
  nft: Address; tokenId: bigint; anyToken: boolean; isActionsCollection: boolean;
  schedule: { startPrice: bigint; endPrice: bigint; startTime: bigint; endTime: bigint };
  maxExecutions: bigint; maxRoyaltyBps: number; maxFeeBps: number; price: bigint; payee: Address;
};

function classify(action: Address, config: Hex): Terms {
  const base: Terms = { kind: "unknown", nft: ZERO, tokenId: 0n, anyToken: false, isActionsCollection: false, schedule: { startPrice: 0n, endPrice: 0n, startTime: 0n, endTime: 0n }, maxExecutions: 1n, maxRoyaltyBps: 0, maxFeeBps: 0, price: 0n, payee: ZERO };
  try {
    if (d.exchange && isAddressEqual(action, d.exchange)) {
      const c = decodeExchangeConfig(config);
      const isActions = !!d.actions && isAddressEqual(c.nft, d.actions);
      if (c.side === Side.Sale) {
        const t = decodeSaleTerms(c.terms);
        return { ...base, kind: "sale", nft: c.nft, tokenId: t.tokenId, isActionsCollection: isActions, schedule: c.schedule, maxRoyaltyBps: t.maxRoyaltyBps, maxFeeBps: c.maxFeeBps, payee: t.proceedsTo };
      }
      const t = decodeBidTerms(c.terms);
      return { ...base, kind: "bid", nft: c.nft, tokenId: t.tokenId, anyToken: t.anyToken, isActionsCollection: isActions, schedule: c.schedule, maxExecutions: t.maxExecutions, maxFeeBps: c.maxFeeBps, payee: t.recipient };
    }
    if (d.coveredNFTPurchase && isAddressEqual(action, d.coveredNFTPurchase)) {
      const c = decodeCoveredConfig(config);
      return { ...base, kind: "covered", nft: c.nft, tokenId: c.tokenId, price: c.price, maxRoyaltyBps: c.maxRoyaltyBps, payee: c.proceedsTo };
    }
    if (d.reservedAction && isAddressEqual(action, d.reservedAction)) {
      const c = decodeReservedConfig(config);
      return { ...base, kind: "reserved", nft: c.target, price: c.price, payee: c.proceedsTo };
    }
  } catch {
    return base;
  }
  return base;
}

ponder.on("Market:Created", async ({ event, context }) => {
  const { order: address, issuer, action, salt, spec } = event.args;
  const config = spec.config;
  const terms = classify(action, config);
  const block = event.block.number;
  const hasCollection = terms.kind === "sale" || terms.kind === "bid" || terms.kind === "covered";
  const coll = hasCollection ? await upsertCollection(context, terms.nft, block) : null;
  const balance = await context.client.getBalance({ address });
  const escrowed = (terms.kind === "sale" || terms.kind === "covered") ? await holds(context, terms.nft, terms.tokenId, address) : false;
  // An order whose config does not decode to a known action, or whose collection is not ERC721,
  // or whose payee is zero, is shown only to its issuer so they can recover.
  const valid =
    terms.kind === "reserved" ? true
    : terms.kind === "unknown" ? false
    : !!coll?.isERC721 && terms.payee !== ZERO
      && !(terms.kind === "bid" && terms.anyToken && terms.isActionsCollection);

  await context.db.insert(order).values({
    address, kind: terms.kind, issuer, action,
    actionCodehash: await codehash(context, action),
    admission: Number(spec.admission), salt, config, deadline: spec.deadline, residual: spec.residual,
    state: 0, valid,
    nft: terms.nft, tokenId: terms.tokenId, anyToken: terms.anyToken, isActionsCollection: terms.isActionsCollection,
    startPrice: terms.schedule.startPrice, endPrice: terms.schedule.endPrice, startTime: terms.schedule.startTime, endTime: terms.schedule.endTime,
    maxExecutions: terms.maxExecutions, maxRoyaltyBps: terms.maxRoyaltyBps, maxFeeBps: terms.maxFeeBps, price: terms.price, payee: terms.payee,
    createdAt: event.block.timestamp, createdBlock: block, createdTx: event.transaction.hash,
    feeBps: -1, activationTerms: "0x", holder: null, executions: 0,
    balance, balanceBlock: block, totalCredits: 0n, escrowed, escrowBlock: block,
  });
});

async function codehash(context: Context, action: Address): Promise<Hex> {
  const code = await context.client.getCode({ address: action }).catch(() => undefined);
  const { keccak256 } = await import("viem");
  return code ? keccak256(code) : ("0x" + "0".repeat(64)) as Hex;
}

async function upsertCollection(context: Context, address: Address, block: bigint) {
  const found = await context.db.find(collection, { address });
  if (found) return found;
  const read = async <T>(fn: () => Promise<T>, fallback: T) => { try { return await fn(); } catch { return fallback; } };
  const supports = (id: Hex) => read(() => context.client.readContract({ address, abi: erc721Abi, functionName: "supportsInterface", args: [id] }), false);
  const row = {
    address,
    name: await read(() => context.client.readContract({ address, abi: erc721Abi, functionName: "name" }), null),
    symbol: await read(() => context.client.readContract({ address, abi: erc721Abi, functionName: "symbol" }), null),
    isERC721: await supports(INTERFACE.erc721),
    isERC1155: await supports(INTERFACE.erc1155),
    supports2981: await supports(INTERFACE.erc2981),
    firstSeenBlock: block,
  };
  await context.db.insert(collection).values(row);
  return row;
}

async function holds(context: Context, nft: Address, tokenId: bigint, who: Address) {
  try {
    return isAddressEqual(await context.client.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [tokenId] }), who);
  } catch { return false; }
}

// ---------------------------------------------------------------------------------------------
// Order lifecycle (factory source: only Market-created orders).

ponder.on("Order:Activated", async ({ event, context }) => {
  const address = event.log.address;
  const row = await context.db.find(order, { address });
  if (!row) return;
  const terms = event.args.activationTerms as Hex;
  // ExchangeAction stores abi.encode(uint256 feeBps) as its activation terms.
  let feeBps = -1;
  if (row.kind === "sale" || row.kind === "bid") {
    try { feeBps = Number(decodeAbiParameters([{ type: "uint256" }], terms)[0]); } catch { feeBps = -1; }
  }
  await context.db.update(order, { address }).set({ state: 1, activationTerms: terms, feeBps });
});

ponder.on("Order:Executed", async ({ event, context }) => {
  const address = event.log.address;
  const row = await context.db.find(order, { address });
  if (!row) return;
  const set: Partial<typeof order.$inferInsert> = { balance: await context.client.getBalance({ address }), balanceBlock: event.block.number };
  if (event.args.complete) { set.state = 2; set.closedAt = event.block.timestamp; set.closedTx = event.transaction.hash; }
  await context.db.update(order, { address }).set(set);
});

const terminal = (state: number) => async ({ event, context }: { event: any; context: Context }) => {
  const address = event.log.address;
  const row = await context.db.find(order, { address });
  if (!row) return;
  await context.db.update(order, { address }).set({
    state, closedAt: event.block.timestamp, closedTx: event.transaction.hash,
    balance: await context.client.getBalance({ address }),
    holder: state === 4 || state === 5 ? null : row.holder,
  });
};
ponder.on("Order:Canceled", terminal(3));
ponder.on("Order:Expired", terminal(4));
ponder.on("Order:Surrendered", terminal(5));

ponder.on("Order:Released", async ({ event, context }) => {
  const address = event.log.address;
  const row = await context.db.find(order, { address });
  if (!row) return;
  const escrowed = (row.kind === "sale" || row.kind === "covered") ? await holds(context, row.nft, row.tokenId, address) : false;
  await context.db.update(order, { address }).set({ balance: await context.client.getBalance({ address }), escrowed, escrowBlock: event.block.number });
  await recordEvent(context, event, address, "released", { actor: event.args.actor, recipient: event.args.recipient });
});

ponder.on("Order:Credited", async ({ event, context }) => {
  const address = event.log.address;
  const row = await context.db.find(order, { address });
  if (!row) return;
  const { beneficiary, amount } = event.args;
  const existing = await context.db.find(credit, { account: address, beneficiary });
  if (existing) await context.db.update(credit, { account: address, beneficiary }).set({ amount: existing.amount + amount });
  else await context.db.insert(credit).values({ account: address, beneficiary, amount });
  await context.db.update(order, { address }).set({ totalCredits: row.totalCredits + amount });
  await recordEvent(context, event, address, "credited", { beneficiary, amount });
});

ponder.on("Order:CreditWithdrawn", async ({ event, context }) => {
  const address = event.log.address;
  const row = await context.db.find(order, { address });
  if (!row) return;
  const { beneficiary, recipient, amount } = event.args;
  const existing = await context.db.find(credit, { account: address, beneficiary });
  if (existing) await context.db.update(credit, { account: address, beneficiary }).set({ amount: 0n });
  await context.db.update(order, { address }).set({ totalCredits: row.totalCredits - amount < 0n ? 0n : row.totalCredits - amount, balance: await context.client.getBalance({ address }) });
  await recordEvent(context, event, address, "credit_withdrawn", { beneficiary, recipient, amount });
});

ponder.on("Order:SurplusWithdrawn", async ({ event, context }) => {
  const address = event.log.address;
  const row = await context.db.find(order, { address });
  if (!row) return;
  await context.db.update(order, { address }).set({ balance: await context.client.getBalance({ address }) });
  await recordEvent(context, event, address, "surplus_withdrawn", { recipient: event.args.recipient, amount: event.args.amount });
});

// ---------------------------------------------------------------------------------------------
// Actions ERC721: token id is the order address. Tracks the current holder of a Holder order.

ponder.on("Actions:Transfer", async ({ event, context }) => {
  const { from, to, tokenId } = event.args;
  const address = orderOfTokenId(tokenId);
  const row = await context.db.find(order, { address });
  if (!row) return;
  await context.db.update(order, { address }).set({ holder: isAddressEqual(to, ZERO) ? null : to });
  if (!isAddressEqual(from, ZERO)) {
    await recordEvent(context, event, address, "transfer", { from, to });
  }
});

// ---------------------------------------------------------------------------------------------
// Action settlement events (only from the configured implementations).

ponder.on("ExchangeAction:Exchanged", async ({ event, context }) => {
  const { order: address, tokenId, side, actor, nftRecipient, proceedsTo, price, fee, royalty } = event.args;
  const row = await context.db.find(order, { address });
  if (!row) return;
  const sale = Number(side) === Side.Sale;
  const buyer = sale ? actor : row.issuer;
  const seller = sale ? row.issuer : actor;
  await recordFill(context, event, row, { tokenId, price, royalty, fee, buyer, seller, recipient: nftRecipient });
  await context.db.update(order, { address }).set({ executions: row.executions + 1, balance: await context.client.getBalance({ address }), balanceBlock: event.block.number });
  void proceedsTo;
});

ponder.on("CoveredNFTPurchase:Purchased", async ({ event, context }) => {
  const { order: address, actor, recipient, price, royalty } = event.args;
  const row = await context.db.find(order, { address });
  if (!row) return;
  await recordFill(context, event, row, { tokenId: row.tokenId, price, royalty, fee: 0n, buyer: actor, seller: row.issuer, recipient });
  await context.db.update(order, { address }).set({ executions: row.executions + 1 });
});

ponder.on("ReservedAction:ActionPerformed", async ({ event, context }) => {
  const { order: address, actor, target, price } = event.args;
  const row = await context.db.find(order, { address });
  if (!row) return;
  await context.db.update(order, { address }).set({ executions: row.executions + 1 });
  await recordEvent(context, event, address, "action_performed", { actor, recipient: target, amount: price });
});

type FillArgs = { tokenId: bigint; price: bigint; royalty: bigint; fee: bigint; buyer: Address; seller: Address; recipient: Address };
async function recordFill(context: Context, event: { transaction: { hash: Hex }; block: { number: bigint; timestamp: bigint }; log: { logIndex: number } }, row: typeof order.$inferSelect, f: FillArgs) {
  await context.db.insert(fill).values({
    id: `${event.transaction.hash}-${row.address}-${event.log.logIndex}`,
    order: row.address, kind: row.kind, nft: row.nft, ...f,
    proceeds: f.price - f.fee - f.royalty,
    selfTrade: isAddressEqual(f.buyer, f.seller),
    timestamp: event.block.timestamp, block: event.block.number, tx: event.transaction.hash,
  });
  if (row.nft !== ZERO) {
    await context.db.insert(token).values({ nft: row.nft, tokenId: f.tokenId, lastSalePrice: f.price, lastSaleAt: event.block.timestamp })
      .onConflictDoUpdate({ lastSalePrice: f.price, lastSaleAt: event.block.timestamp });
  }
}

async function recordEvent(
  context: Context,
  event: { transaction: { hash: Hex }; block: { number: bigint; timestamp: bigint }; log: { logIndex: number } },
  account: Address, kind: string,
  extra: { actor?: Address; from?: Address; to?: Address; beneficiary?: Address; recipient?: Address; amount?: bigint },
) {
  await context.db.insert(accountEvent).values({
    id: `${event.transaction.hash}-${account}-${event.log.logIndex}`,
    account, kind, timestamp: event.block.timestamp, block: event.block.number, tx: event.transaction.hash,
    actor: extra.actor ?? null, from: extra.from ?? null, to: extra.to ?? null,
    beneficiary: extra.beneficiary ?? null, recipient: extra.recipient ?? null, amount: extra.amount ?? null,
  }).onConflictDoNothing();
}

// ---------------------------------------------------------------------------------------------
// Head polling: balance, escrow and quote errors for open orders (effective expiry is derived in
// the API from the exclusive deadline, so it needs no event or poll).

const DERIVED = new Set(["NotStarted", "InsufficientFunds", "UnexpectedValue"]);

ponder.on("poll:block", async ({ event, context }) => {
  const { number, timestamp } = event.block;
  await context.db.insert(meta).values({ id: 1, block: number, timestamp }).onConflictDoUpdate({ block: number, timestamp });
  if (number % 5n !== 0n) return;

  const rows = await context.db.sql.select().from(order).where(
    and(eq(order.valid, true), or(sql`${order.state} IN (0, 1)`, sql`${order.balance} > 0`, eq(order.escrowed, true))),
  );
  if (rows.length === 0) return;

  const calls = rows.flatMap((r) => {
    const out: unknown[] = [{ address: MULTICALL3, abi: multicall3Abi, functionName: "getEthBalance", args: [r.address] }];
    if (r.kind === "sale" || r.kind === "covered") out.push({ address: r.nft, abi: erc721Abi, functionName: "ownerOf", args: [r.tokenId] });
    if (r.state === 1 && (r.kind === "sale" || r.kind === "bid") && d.exchange) {
      const input = r.kind === "sale" ? saleInput(r.payee, 1n << 255n, 0n) : bidInput(r.tokenId, 0n, r.payee);
      out.push({ address: d.exchange, abi: exchangeActionAbi, functionName: "quote", args: [r.address, input] });
    }
    return out;
  });

  type Res = { status: "success"; result: unknown } | { status: "failure"; error: Error };
  const results = (await context.client.multicall({ contracts: calls as never, allowFailure: true, multicallAddress: MULTICALL3 })) as unknown as Res[];
  let i = 0;
  for (const r of rows) {
    const balRes = results[i++]!;
    const escRes = (r.kind === "sale" || r.kind === "covered") ? results[i++]! : null;
    const quoteRes = (r.state === 1 && (r.kind === "sale" || r.kind === "bid") && d.exchange) ? results[i++]! : null;
    const set: Partial<typeof order.$inferInsert> = {};
    if (balRes.status === "success") { set.balance = balRes.result as bigint; set.balanceBlock = number; }
    if (escRes) { set.escrowed = escRes.status === "success" && isAddressEqual(escRes.result as Address, r.address); set.escrowBlock = number; }
    if (quoteRes) {
      if (quoteRes.status === "failure") {
        const name = decodeRevert(quoteRes.error).name;
        set.quoteError = name && !DERIVED.has(name) ? name : null;
      } else if (r.kind === "sale") {
        // ExchangeAction.quote() is advisory and does NOT apply the sale's maxRoyaltyBps. Its
        // returned royalty is already min(ERC2981, price - fee); a buy reverts RoyaltyAboveLimit
        // when that exceeds mulDiv(price, maxRoyaltyBps, 10000), so flag the sale as blocked here.
        const q = quoteRes.result as { price: bigint; royalty: bigint };
        const limit = (q.price * BigInt(r.maxRoyaltyBps)) / 10_000n;
        set.quoteError = q.royalty > limit ? "RoyaltyAboveLimit" : null;
      } else {
        set.quoteError = null;
      }
      set.quoteBlock = number;
    }
    await context.db.update(order, { address: r.address }).set(set);
  }
});
