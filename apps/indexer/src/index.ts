import {
  decodeBidConfig,
  decodeRevert,
  decodeSaleConfig,
  erc721Abi,
  feeConfigAbi,
  feeOf,
  INTERFACE,
  MULTICALL3,
  multicall3Abi,
  nftBidAbi,
  nftSaleAbi,
  verifyDeployment,
} from "@market/protocol";
import { and, eq, or, sql } from "ponder";
import { ponder, type Context } from "ponder:registry";
import { collection, fill, meta, order, token } from "ponder:schema";
import { createPublicClient, getAddress, http, isAddressEqual, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { deployment as d } from "./deployment";
import { pollRights, recordRightEvent } from "./rights";

ponder.on("Market:setup", async () => {
  // Setup's historical client is pinned to startBlock, before later deployment transactions.
  const live = createPublicClient({ transport: http(process.env.PONDER_RPC_URL ?? d.rpcUrl) });
  const mismatch = await verifyDeployment(live as PublicClient, d);
  if (mismatch.length) throw new Error(`Deployment identity mismatch: ${mismatch.join(", ")}`);
});


// ---------------------------------------------------------------------------------------------
// Market.Created: the only way an order enters the index (trust rules 1, 2, 5; PLAN.md §4.2).

ponder.on("Market:Created", async ({ event, context }) => {
  const { order: address, owner, handler, salt, config } = event.args;
  const kind = isAddressEqual(handler, d.nftSale) ? "sale" : isAddressEqual(handler, d.nftBid) ? "bid" : null;
  if (!kind) return; // Rule 2: other handlers are not traded here.

  const terms = decode(kind, config);
  const block = event.block.number;
  const nft = terms ? terms.nft : zeroAddress;
  const coll = terms ? await upsertCollection(context, nft, block) : null;
  const feeBps = await context.client.readContract({ address: d.feeConfig, abi: feeConfigAbi, functionName: "feeBpsOf", args: [address] });
  const balance = await context.client.getBalance({ address });
  const escrowed = kind === "sale" && terms ? await holds(context, nft, terms.tokenId, address) : false;

  await context.db.insert(order).values({
    address,
    kind,
    owner,
    salt,
    config,
    // Market.create does not validate config; an order that can never fill stays visible to
    // its owner only, so they can close and recover.
    valid: !!terms && !!coll?.isERC721 && terms.payee !== zeroAddress
      && !(kind === "bid" && terms.anyToken && d.rights && isAddressEqual(terms.nft, d.rights)),
    nft,
    tokenId: terms?.tokenId ?? 0n,
    anyToken: terms?.anyToken ?? false,
    startPrice: terms?.schedule.startPrice ?? 0n,
    endPrice: terms?.schedule.endPrice ?? 0n,
    startTime: terms?.schedule.startTime ?? 0n,
    endTime: terms?.schedule.endTime ?? 0n,
    expiry: terms?.schedule.expiry ?? 0n,
    maxFills: terms?.maxFills ?? 1n,
    maxRoyaltyBps: terms?.maxRoyaltyBps ?? 0,
    payee: terms?.payee ?? zeroAddress,
    createdAt: event.block.timestamp,
    createdBlock: block,
    createdTx: event.transaction.hash,
    feeBps: Number(feeBps),
    closed: false,
    closedByFill: false,
    fills: 0,
    balance,
    balanceBlock: block,
    escrowed,
    escrowBlock: block,
  });
});

type Terms = {
  nft: Address;
  tokenId: bigint;
  anyToken: boolean;
  schedule: { startPrice: bigint; endPrice: bigint; startTime: bigint; endTime: bigint; expiry: bigint };
  payee: Address;
  maxFills: bigint;
  maxRoyaltyBps: number;
};

function decode(kind: "sale" | "bid", config: Hex): Terms | null {
  try {
    if (kind === "sale") {
      const c = decodeSaleConfig(config);
      return { nft: c.nft, tokenId: c.tokenId, anyToken: false, schedule: c.schedule, payee: c.proceedsTo, maxFills: 1n, maxRoyaltyBps: c.maxRoyaltyBps };
    }
    const c = decodeBidConfig(config);
    return { nft: c.nft, tokenId: c.tokenId, anyToken: c.anyToken, schedule: c.schedule, payee: c.recipient, maxFills: c.maxFills, maxRoyaltyBps: 0 };
  } catch {
    return null;
  }
}

async function upsertCollection(context: Context, address: Address, block: bigint) {
  const found = await context.db.find(collection, { address });
  if (found) return found;
  const read = async <T>(fn: () => Promise<T>, fallback: T) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };
  const supports = (id: Hex) =>
    read(() => context.client.readContract({ address, abi: erc721Abi, functionName: "supportsInterface", args: [id] }), false);
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
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Order lifecycle events, only from Market-created orders (factory source).

ponder.on("Order:Closed", async ({ event, context }) => {
  const row = await context.db.find(order, { address: event.log.address });
  if (!row) return; // An order on a handler we do not trade.
  // Read what the order holds now, so a cancelled order still holding its NFT or ETH shows as
  // withdrawable even if it was deposited during backfill, when nothing is polled.
  await context.db.update(order, { address: row.address }).set({
    closed: true,
    closedAt: event.block.timestamp,
    closedTx: event.transaction.hash,
    escrowed: row.kind === "sale" && row.valid ? await holds(context, row.nft, row.tokenId, row.address) : false,
    escrowBlock: event.block.number,
    balance: await context.client.getBalance({ address: row.address }),
    balanceBlock: event.block.number,
  });
});

ponder.on("Order:Filled", async ({ event, context }) => {
  const id = `${event.transaction.hash}-${getAddress(event.log.address)}`;
  const f = await context.db.find(fill, { id });
  if (f) await context.db.update(fill, { id }).set({ value: event.args.value });
});

// ---------------------------------------------------------------------------------------------
// Handler events: only from the configured handlers (Ponder listens nowhere else) and only for
// orders known from Created. A genuine fill of a clone Market never created is dropped
// (SECURITY.md residual risk 16).

ponder.on("NFTSale:Sold", async ({ event, context }) => {
  const row = await context.db.find(order, { address: event.args.order });
  if (!row || row.kind !== "sale") return;
  const { price, royalty, buyer, recipient } = event.args;
  const fee = feeOf(price, BigInt(row.feeBps));
  await recordFill(context, event, row, {
    tokenId: row.tokenId,
    price,
    royalty,
    fee,
    buyer,
    seller: row.owner,
    recipient,
  });
  await context.db.update(order, { address: row.address }).set({
    fills: row.fills + 1,
    closed: true,
    closedByFill: true,
    escrowed: false,
    escrowBlock: event.block.number,
    balance: await context.client.getBalance({ address: row.address }),
    balanceBlock: event.block.number,
  });
});

ponder.on("NFTBid:Bought", async ({ event, context }) => {
  const row = await context.db.find(order, { address: event.args.order });
  if (!row || row.kind !== "bid") return;
  const { price, royalty, seller, tokenId } = event.args;
  const fee = feeOf(price, BigInt(row.feeBps));
  await recordFill(context, event, row, { tokenId, price, royalty, fee, buyer: row.owner, seller, recipient: row.payee });
  const fills = row.fills + 1;
  const limit = row.maxFills === 0n ? 1n : row.maxFills;
  await context.db.update(order, { address: row.address }).set({
    fills,
    // The last fill closes the order inside the same transaction (Closed is emitted first).
    closedByFill: BigInt(fills) >= limit,
    balance: await context.client.getBalance({ address: row.address }),
    balanceBlock: event.block.number,
  });
});

type FillArgs = { tokenId: bigint; price: bigint; royalty: bigint; fee: bigint; buyer: Address; seller: Address; recipient: Address };

async function recordFill(
  context: Context,
  event: { transaction: { hash: Hex }; block: { number: bigint; timestamp: bigint }; log: { logIndex: number } },
  row: typeof order.$inferSelect,
  f: FillArgs,
) {
  await context.db.insert(fill).values({
    id: `${event.transaction.hash}-${row.address}`,
    order: row.address,
    kind: row.kind,
    nft: row.nft,
    ...f,
    proceeds: f.price - f.fee - f.royalty,
    selfTrade: isAddressEqual(f.buyer, f.seller),
    timestamp: event.block.timestamp,
    block: event.block.number,
    tx: event.transaction.hash,
  });
  await context.db
    .insert(token)
    .values({ nft: row.nft, tokenId: f.tokenId, lastSalePrice: f.price, lastSaleAt: event.block.timestamp })
    .onConflictDoUpdate({ lastSalePrice: f.price, lastSaleAt: event.block.timestamp });
  if (d.rights && isAddressEqual(row.nft, d.rights) && f.tokenId <= (1n << 160n) - 1n) {
    const account = getAddress(`0x${f.tokenId.toString(16).padStart(40, "0")}`);
    await recordRightEvent(context, event, account, row.kind === "sale" ? "premium_sale" : "premium_bid", {
      from: f.seller, to: f.buyer, amount: f.price, order: row.address,
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Polling at the head (PLAN.md §4.6). Fast lane every block: listings awaiting their NFT from
// the last 7 days. Normal lane every 5 blocks: every open order, and closed orders still holding
// assets. Older listings awaiting their NFT: every 300 blocks.

const WEEK = 7n * 86_400n;
/** Errors SQL derives from time and balance; not stored as a quote error. */
const DERIVED = new Set(["NotStarted", "Expired", "InsufficientFunds"]);

ponder.on("poll:block", async ({ event, context }) => {
  const { number, timestamp } = event.block;
  await context.db.insert(meta).values({ id: 1, block: number, timestamp }).onConflictDoUpdate({ block: number, timestamp });

  const normal = number % 5n === 0n;
  const slow = number % 300n === 0n;
  await pollRights(context, number, timestamp, normal);
  const rows = await context.db.sql
    .select()
    .from(order)
    .where(
      and(
        eq(order.valid, true),
        or(
          eq(order.closed, false),
          and(eq(order.closed, true), or(eq(order.escrowed, true), sql`${order.balance} > 0`)),
        ),
      ),
    );

  const due = rows.filter((r) => {
    if (normal) return true;
    const awaiting = r.kind === "sale" && !r.closed && !r.escrowed;
    return awaiting && (r.createdAt > timestamp - WEEK || slow);
  });
  if (due.length === 0) return;

  const calls = due.flatMap((r) => {
    const sale = r.kind === "sale";
    const schedule = { startPrice: r.startPrice, endPrice: r.endPrice, startTime: r.startTime, endTime: r.endTime, expiry: r.expiry };
    const state = sale
      ? { address: r.nft, abi: erc721Abi, functionName: "ownerOf", args: [r.tokenId] }
      : { address: MULTICALL3, abi: multicall3Abi, functionName: "getEthBalance", args: [r.address] };
    const quote = r.closed
      ? null
      : sale
        ? {
            address: d.nftSale,
            abi: nftSaleAbi,
            functionName: "quote",
            args: [r.address, { nft: r.nft, tokenId: r.tokenId, schedule, proceedsTo: r.payee, maxRoyaltyBps: r.maxRoyaltyBps }],
          }
        : {
            address: d.nftBid,
            abi: nftBidAbi,
            functionName: "quote",
            args: [r.address, { nft: r.nft, anyToken: r.anyToken, tokenId: r.tokenId, schedule, recipient: r.payee, maxFills: r.maxFills }, r.tokenId],
          };
    return quote && normal ? [state, quote] : [state];
  });

  type Result = { status: "success"; result: unknown } | { status: "failure"; error: Error };
  const results = (await context.client.multicall({
    contracts: calls as never,
    allowFailure: true,
    multicallAddress: MULTICALL3,
  })) as unknown as Result[];
  let i = 0;
  for (const r of due) {
    const state = results[i++]!;
    const quoted = !r.closed && normal ? results[i++]! : null;
    const set: Partial<typeof order.$inferInsert> = {};
    if (r.kind === "sale") {
      set.escrowed = state.status === "success" && isAddressEqual(state.result as Address, r.address);
      set.escrowBlock = number;
    } else if (state.status === "success") {
      set.balance = state.result as bigint;
      set.balanceBlock = number;
    }
    if (quoted) {
      const name = quoted.status === "failure" ? decodeRevert(quoted.error).name : null;
      set.quoteError = name && !DERIVED.has(name) ? name : null;
      set.quoteBlock = number;
    }
    await context.db.update(order, { address: r.address }).set(set);
  }
});
