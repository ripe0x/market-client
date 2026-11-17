// A seeded local market: listings and offers in every state the UI must show, made with real
// transactions from Anvil's unlocked accounts. Used by `pnpm dev:chain`, indexer tests and e2e.
import { parseEther, type Address } from "viem";
import type { BidConfig, SaleConfig } from "../src/config";
import { fixedSchedule } from "../src/schedule";
import * as tx from "../src/tx";
import { ACCOUNTS, mint, type Chain } from "./index";
import { createdOrder, send, sendValue } from "./send";

const E = (s: string) => parseEther(s);
/** The account e2e tests and local development connect as. */
export const ME = ACCOUNTS[1];
export const SELLERS = [ACCOUNTS[2], ACCOUNTS[3]] as const;
export const BIDDERS = [ACCOUNTS[4], ACCOUNTS[5]] as const;

export async function seed(c: Chain) {
  const col = c.collections!;
  const t = (await c.pub.getBlock()).timestamp;
  const list = async (from: Address, nft: Address, tokenId: bigint, schedule: SaleConfig["schedule"], deposit = true, maxRoyaltyBps = 1000) => {
    const config: SaleConfig = { nft, tokenId, schedule, proceedsTo: from, maxRoyaltyBps };
    const order = createdOrder((await send(c, from, tx.createListing(c.deployment, config, tx.randomSalt()))).receipt);
    if (deposit) await send(c, from, tx.depositNft(nft, from, order, tokenId));
    return order;
  };
  const offer = async (from: Address, cfg: Partial<BidConfig> & { nft: Address }, value: bigint) => {
    const config: BidConfig = { anyToken: true, tokenId: 0n, schedule: fixedSchedule(E("0.5")), recipient: from, maxFills: 1n, ...cfg };
    return createdOrder((await send(c, from, tx.createOffer(c.deployment, config, tx.randomSalt(), value))).receipt);
  };

  // Holdings.
  const d0 = await mint(c, col.driftlines, SELLERS[0], 6n); // 1..6
  const d1 = await mint(c, col.driftlines, SELLERS[1], 4n); // 7..10
  const dMe = await mint(c, col.driftlines, ME, 3n); // 11..13
  const m0 = await mint(c, col.meridian, SELLERS[0], 4n);
  const mMe = await mint(c, col.meridian, ME, 3n);
  const tMe = await mint(c, col.tessellate, ME, 2n);
  const t1 = await mint(c, col.tessellate, SELLERS[1], 3n);

  const day = 86_400n;
  const orders = {
    fixed: await list(SELLERS[0], col.driftlines, d0, fixedSchedule(E("0.85"))),
    falling: await list(SELLERS[0], col.driftlines, d0 + 1n, { startPrice: E("2.4"), endPrice: E("0.8"), startTime: t, endTime: t + 3n * day, expiry: 0n }),
    rising: await list(SELLERS[1], col.driftlines, d1, { startPrice: E("1.52"), endPrice: E("2"), startTime: t, endTime: t + 5n * day, expiry: 0n }),
    cheap: await list(SELLERS[1], col.driftlines, d1 + 1n, fixedSchedule(E("0.62"))),
    meridian: await list(SELLERS[0], col.meridian, m0, fixedSchedule(E("0.78"))),
    tessellate: await list(SELLERS[1], col.tessellate, t1, { startPrice: E("0.44"), endPrice: E("0.6"), startTime: t, endTime: t + 2n * day, expiry: 0n }),
    awaitingNft: await list(SELLERS[0], col.driftlines, d0 + 2n, fixedSchedule(E("1.1")), false),
    expiring: await list(SELLERS[0], col.driftlines, d0 + 3n, fixedSchedule(E("3"), t + 2n * day)),
    royaltyBlocked: await list(SELLERS[1], col.driftlines, d1 + 2n, fixedSchedule(E("1.3")), true, 400),
    myListing: await list(ME, col.meridian, mMe, { startPrice: E("1.5"), endPrice: E("1"), startTime: t, endTime: t + 7n * day, expiry: 0n }),
    myFixed: await list(ME, col.tessellate, tMe, fixedSchedule(E("4.8"))),

    collectionOffer: await offer(BIDDERS[0], { nft: col.driftlines, schedule: fixedSchedule(E("0.55")), maxFills: 7n }, E("3.85")),
    risingOffer: await offer(BIDDERS[1], { nft: col.driftlines, schedule: { startPrice: E("0.53"), endPrice: E("0.6"), startTime: t, endTime: t + 4n * day, expiry: t + 5n * day } }, E("0.6")),
    bigOffer: await offer(BIDDERS[1], { nft: col.driftlines, schedule: fixedSchedule(E("0.4")), maxFills: 12n }, E("4.8")),
    tokenOffer: await offer(BIDDERS[0], { nft: col.driftlines, anyToken: false, tokenId: d0 + 1n, schedule: fixedSchedule(E("1.05"), t + 2n * day) }, E("1.05")),
    underfunded: await offer(BIDDERS[0], { nft: col.meridian, schedule: fixedSchedule(E("0.62")), maxFills: 3n }, E("0.3")),
    myOffer: await offer(ME, { nft: col.driftlines, schedule: fixedSchedule(E("0.58"), t + 7n * day), maxFills: 5n }, E("2.9")),
    myTokenOffer: await offer(ME, { nft: col.meridian, anyToken: false, tokenId: m0, schedule: fixedSchedule(E("0.7"), t + 3n * day) }, E("0.7")),
  };

  // History: a sale, a sale to an offer, and a cancelled listing still holding its NFT.
  await send(c, BIDDERS[1], tx.buy(orders.cheap, (await configOf(c, orders.cheap)).config, BIDDERS[1], E("0.62")));
  const sold = d0 + 4n;
  await send(c, SELLERS[0], tx.approveForOffers(c.deployment, col.driftlines, sold));
  await send(c, SELLERS[0], tx.sellToOffer(orders.collectionOffer, (await configOf(c, orders.collectionOffer)).config, sold, 0n, SELLERS[0]));
  const myCancelled = await list(ME, col.driftlines, dMe + 2n, fixedSchedule(E("2.1")));
  await send(c, ME, tx.close(myCancelled));
  await sendValue(c, BIDDERS[0], orders.collectionOffer, E("0.1")); // top-up, no event

  return { orders: { ...orders, myCancelled }, collections: col, me: ME, holdings: { dMe, mMe, tMe } };
}

/** Config bytes of an order, from its `Created` event. */
async function configOf(c: Chain, order: Address) {
  const { marketAbi } = await import("../src/abis");
  const logs = await c.pub.getContractEvents({ address: c.deployment.market, abi: marketAbi, eventName: "Created", args: { order }, fromBlock: 0n });
  return { config: logs[0]!.args.config! };
}
