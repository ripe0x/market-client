// A seeded local market for the unified Order/Action model: sales, bids and a covered purchase
// right in several states, made with real transactions from Anvil's unlocked accounts. Used by
// `pnpm dev:chain` and (once migrated) the indexer and e2e suites.
import { parseEther, type Address } from "viem";
import { fixedSchedule, type Schedule } from "../src/schedule";
import * as tx from "../src/tx";
import { ACCOUNTS, mint, type Chain } from "./index";
import { createdOrder, send } from "./send";

const E = (s: string) => parseEther(s);
/** The account e2e tests and local development connect as. */
export const ME = ACCOUNTS[1];
export const SELLERS = [ACCOUNTS[2], ACCOUNTS[3]] as const;
export const BIDDERS = [ACCOUNTS[4], ACCOUNTS[5]] as const;

export async function seed(c: Chain) {
  const d = c.deployment;
  const col = c.collections!;
  const t = (await c.pub.getBlock()).timestamp;
  const day = 86_400n;

  const listSale = async (from: Address, nft: Address, tokenId: bigint, schedule: Schedule, deposit = true, maxRoyaltyBps = 1000, deadline = 0n) => {
    const spec = tx.saleSpec(d, { issuer: from, nft, tokenId, schedule, proceedsTo: from, maxRoyaltyBps, deadline });
    const order = createdOrder((await send(c, from, tx.create(d, spec, tx.randomSalt()))).receipt);
    // A sale cannot activate until its NFT is escrowed (validate reverts NotEscrowed), so an
    // un-deposited listing stays Pending.
    if (deposit) {
      await send(c, from, tx.depositNft(nft, from, order, tokenId));
      await send(c, from, tx.activate(order));
    }
    return order;
  };
  const makeBid = async (from: Address, nft: Address, schedule: Schedule, value: bigint, opts: { anyToken?: boolean; tokenId?: bigint; maxExecutions?: bigint; deadline?: bigint } = {}) => {
    const spec = tx.bidSpec(d, { issuer: from, nft, schedule, recipient: from, anyToken: opts.anyToken ?? true, tokenId: opts.tokenId, maxExecutions: opts.maxExecutions ?? 1n, deadline: opts.deadline ?? 0n });
    const order = createdOrder((await send(c, from, tx.create(d, spec, tx.randomSalt(), value))).receipt);
    await send(c, from, tx.activate(order));
    return order;
  };

  const d0 = await mint(c, col.driftlines, SELLERS[0], 6n);
  const d1 = await mint(c, col.driftlines, SELLERS[1], 4n);
  const dMe = await mint(c, col.driftlines, ME, 3n);
  const m0 = await mint(c, col.meridian, SELLERS[0], 4n);
  const mMe = await mint(c, col.meridian, ME, 3n);

  const orders = {
    fixed: await listSale(SELLERS[0], col.driftlines, d0, fixedSchedule(E("0.85"))),
    falling: await listSale(SELLERS[0], col.driftlines, d0 + 1n, { startPrice: E("2.4"), endPrice: E("0.8"), startTime: t, endTime: t + 3n * day }),
    rising: await listSale(SELLERS[1], col.driftlines, d1, { startPrice: E("1.52"), endPrice: E("2"), startTime: t, endTime: t + 5n * day }),
    meridian: await listSale(SELLERS[0], col.meridian, m0, fixedSchedule(E("0.78"))),
    awaitingNft: await listSale(SELLERS[0], col.driftlines, d0 + 2n, fixedSchedule(E("1.1")), false),
    myListing: await listSale(ME, col.meridian, mMe, { startPrice: E("1.5"), endPrice: E("1"), startTime: t, endTime: t + 7n * day }),

    collectionOffer: await makeBid(BIDDERS[0], col.driftlines, fixedSchedule(E("0.55")), E("3.85"), { maxExecutions: 7n }),
    tokenOffer: await makeBid(BIDDERS[0], col.driftlines, fixedSchedule(E("1.05")), E("1.05"), { anyToken: false, tokenId: d0 + 1n, deadline: t + 2n * day }),
    myOffer: await makeBid(ME, col.driftlines, fixedSchedule(E("0.58")), E("2.9"), { maxExecutions: 5n, deadline: t + 7n * day }),
  };

  // History: one sale filled by a buyer.
  const buyer = BIDDERS[1];
  await send(c, buyer, tx.buy(orders.fixed, buyer, E("0.85")));

  return { orders, collections: col, me: ME, holdings: { dMe, mMe } };
}
