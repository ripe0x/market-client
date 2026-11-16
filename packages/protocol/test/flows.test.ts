// Every write the app makes, end to end on a real chain with the real protocol, checked by
// absolute balances (PLAN.md §10). Gas is paid at a nonzero base fee and accounted for exactly.
import { decodeEventLog, parseEther, type Address } from "viem";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { nftBidAbi, nftSaleAbi, orderAbi } from "../src/abis";
import { decodeBidConfig, encodeBidConfig, encodeSaleConfig, type BidConfig, type SaleConfig } from "../src/config";
import { erc721Abi } from "../src/erc721";
import { acceptFloorPrice, buyMaxPrice, quoteBid, quoteSale, verifyDeployment, verifyOrder } from "../src/orders";
import { fixedSchedule } from "../src/schedule";
import { split } from "../src/split";
import * as tx from "../src/tx";
import { ACCOUNTS, mint, ROYALTY_TO, startChain, type Chain } from "../devchain";
import { balances, createdOrder, now, send, sendValue } from "../devchain/send";

const FEE_TO: Address = "0xD4ba7cA95f3983514DDa317C4428CDb8F59c7e72";
const [, SELLER, BUYER, BIDDER, HOLDER] = ACCOUNTS;
const E = (s: string) => parseEther(s);

let c: Chain;
let nft: Address;
beforeAll(async () => {
  c = await startChain();
  nft = c.collections!.driftlines;
  const block = await c.pub.getBlock();
  expect(block.baseFeePerGas).toBeGreaterThan(0n);
});
afterAll(() => c?.stop());

async function listing(seller: Address, cfg: Omit<SaleConfig, "nft" | "proceedsTo"> & { nft?: Address }) {
  const config: SaleConfig = { nft, proceedsTo: seller, ...cfg };
  const salt = tx.randomSalt();
  const created = await send(c, seller, tx.createListing(c.deployment, config, salt));
  const order = createdOrder(created.receipt);
  await verifyOrder(c.pub, c.deployment, { address: order, kind: "sale", config: encodeSaleConfig(config), owner: seller });
  const deposit = await send(c, seller, tx.depositNft(config.nft, seller, order, config.tokenId));
  return { order, config, gas: created.gas + deposit.gas };
}

test("deployed code matches the pinned build", async () => {
  expect(await verifyDeployment(c.pub, c.deployment)).toEqual([]);
});

describe("listing", () => {
  test("fixed sale at 1 ETH, 5% royalty, 1% fee: exact split, order ends empty", async () => {
    const id = await mint(c, nft, SELLER);
    const { order, config, gas: sellerGas } = await listing(SELLER, {
      tokenId: id,
      schedule: fixedSchedule(E("1")),
      maxRoyaltyBps: 500,
    });
    const q = await quoteSale(c.pub, c.deployment, order, config);
    expect(q).toMatchObject({ price: E("1"), royalty: E("0.05"), fee: E("0.01"), proceeds: E("0.94"), royaltyTo: ROYALTY_TO, feeTo: FEE_TO });

    const who = { seller: SELLER, buyer: BUYER, royalty: ROYALTY_TO, fee: FEE_TO, order };
    const before = await balances(c, who);
    const { gas } = await send(c, BUYER, tx.buy(order, encodeSaleConfig(config), BUYER, buyMaxPrice(config.schedule, await now(c))));
    const after = await balances(c, who);

    expect(after.buyer! - before.buyer!).toBe(-E("1") - gas);
    expect(after.seller! - before.seller!).toBe(E("0.94"));
    expect(after.royalty! - before.royalty!).toBe(E("0.05"));
    expect(after.fee! - before.fee!).toBe(E("0.01"));
    expect(after.order).toBe(0n);
    expect(await c.pub.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] })).toBe(BUYER);
    expect(await c.pub.readContract({ address: order, abi: orderAbi, functionName: "closed" })).toBe(true);
    expect(sellerGas).toBeGreaterThan(0n);
  });

  test("falling sale: buyer pays the price at inclusion and gets the rest back", async () => {
    const id = await mint(c, nft, SELLER);
    const t = await now(c);
    const schedule = { startPrice: E("2"), endPrice: E("1"), startTime: t, endTime: t + 1000n, expiry: 0n };
    const { order, config } = await listing(SELLER, { tokenId: id, schedule, maxRoyaltyBps: 500 });
    const maxPrice = buyMaxPrice(schedule, await now(c)); // current price: falling
    await c.test.increaseTime({ seconds: 100 });
    const before = await c.pub.getBalance({ address: BUYER });
    const { receipt, gas } = await send(c, BUYER, tx.buy(order, encodeSaleConfig(config), BUYER, maxPrice));
    const sold = receipt.logs
      .map((l) => { try { return decodeEventLog({ abi: nftSaleAbi, ...l }); } catch { return null; } })
      .find((e) => e?.eventName === "Sold");
    const price = (sold!.args as { price: bigint }).price;
    expect(price).toBeLessThan(maxPrice);
    expect(before - (await c.pub.getBalance({ address: BUYER }))).toBe(price + gas);
  });

  test("rising sale: headroom keeps a quote valid a few blocks later", async () => {
    const id = await mint(c, nft, SELLER);
    const t = await now(c);
    const schedule = { startPrice: E("1"), endPrice: E("2"), startTime: t, endTime: t + 600n, expiry: 0n };
    const { order, config } = await listing(SELLER, { tokenId: id, schedule, maxRoyaltyBps: 500 });
    const maxPrice = buyMaxPrice(schedule, await now(c));
    await c.test.increaseTime({ seconds: 60 });
    await send(c, BUYER, tx.buy(order, encodeSaleConfig(config), BUYER, maxPrice));
  });

  test("round trip: list, cancel, withdraw returns the NFT", async () => {
    const id = await mint(c, nft, SELLER);
    const { order, config } = await listing(SELLER, { tokenId: id, schedule: fixedSchedule(E("1")), maxRoyaltyBps: 500 });
    await send(c, SELLER, tx.close(order));
    await send(c, SELLER, tx.withdrawNft(order, config.nft, SELLER, id));
    expect(await c.pub.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] })).toBe(SELLER);
    expect(await c.pub.getBalance({ address: order })).toBe(0n);
  });
});

describe("offer", () => {
  test("collection offer 0.5 × 3, two sales, top-up, cancel: every wei accounted", async () => {
    const config: BidConfig = { nft, anyToken: true, tokenId: 0n, schedule: fixedSchedule(E("0.5")), recipient: BIDDER, maxFills: 3n };
    const startBidder = await c.pub.getBalance({ address: BIDDER });
    let bidderGas = 0n;
    const created = await send(c, BIDDER, tx.createOffer(c.deployment, config, tx.randomSalt(), E("1.5")));
    bidderGas += created.gas;
    const order = createdOrder(created.receipt);
    const configBytes = encodeBidConfig(config);
    expect(decodeBidConfig(configBytes)).toEqual(config);
    await verifyOrder(c.pub, c.deployment, { address: order, kind: "bid", config: configBytes, owner: BIDDER });

    const first = await mint(c, nft, HOLDER, 2n);
    for (const id of [first, first + 1n]) {
      const q = await quoteBid(c.pub, c.deployment, order, config, id);
      const expected = split(acceptFloorPrice(config.schedule, await now(c)), BigInt(1 * 100), E("0.5") / 20n);
      expect(q.proceeds).toBe(expected.proceeds);
      expect(q.proceeds).toBe(E("0.47"));
      const before = await c.pub.getBalance({ address: HOLDER });
      const a = await send(c, HOLDER, tx.approveForOffers(c.deployment, nft, id));
      const f = await send(c, HOLDER, tx.sellToOffer(order, configBytes, id, q.proceeds, HOLDER));
      expect((await c.pub.getBalance({ address: HOLDER })) - before).toBe(E("0.47") - a.gas - f.gas);
      expect(await c.pub.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] })).toBe(BIDDER);
    }
    expect(await c.pub.readContract({ address: c.deployment.nftBid, abi: nftBidAbi, functionName: "fills", args: [order] })).toBe(2n);
    expect(await c.pub.getBalance({ address: order })).toBe(E("0.5"));

    bidderGas += (await sendValue(c, BIDDER, order, E("0.1"))).gas;
    bidderGas += (await send(c, BIDDER, tx.close(order))).gas;
    const bal = await c.pub.getBalance({ address: order });
    expect(bal).toBe(E("0.6"));
    bidderGas += (await send(c, BIDDER, tx.withdrawEth(order, BIDDER, bal))).gas;

    // Deposited 1.5 + 0.1, spent 2 × 0.5, recovered 0.6.
    expect(startBidder - (await c.pub.getBalance({ address: BIDDER }))).toBe(E("1") + bidderGas);
    expect(await c.pub.getBalance({ address: order })).toBe(0n);
  });

  test("approval goes to NFTBid and a per-token approval clears on sale", async () => {
    const id = await mint(c, nft, HOLDER);
    const config: BidConfig = { nft, anyToken: false, tokenId: id, schedule: fixedSchedule(E("0.2")), recipient: BIDDER, maxFills: 1n };
    const order = createdOrder((await send(c, BIDDER, tx.createOffer(c.deployment, config, tx.randomSalt(), E("0.2")))).receipt);
    await send(c, HOLDER, tx.approveForOffers(c.deployment, nft, id));
    expect(await c.pub.readContract({ address: nft, abi: erc721Abi, functionName: "getApproved", args: [id] })).toBe(c.deployment.nftBid);
    const q = await quoteBid(c.pub, c.deployment, order, config, id);
    await send(c, HOLDER, tx.sellToOffer(order, encodeBidConfig(config), id, q.proceeds, HOLDER));
    expect(await c.pub.readContract({ address: nft, abi: erc721Abi, functionName: "getApproved", args: [id] })).toBe(
      "0x0000000000000000000000000000000000000000",
    );
    expect(await c.pub.readContract({ address: order, abi: orderAbi, functionName: "closed" })).toBe(true);
  });

  test("revoke paths", async () => {
    const id = await mint(c, nft, HOLDER);
    await send(c, HOLDER, tx.approveForOffers(c.deployment, nft, id));
    await send(c, HOLDER, tx.revokeTokenApproval(nft, id));
    expect(await c.pub.readContract({ address: nft, abi: erc721Abi, functionName: "getApproved", args: [id] })).toBe(
      "0x0000000000000000000000000000000000000000",
    );
    await send(c, HOLDER, { address: nft, abi: erc721Abi, functionName: "setApprovalForAll", args: [c.deployment.nftBid, true] });
    await send(c, HOLDER, tx.revokeAllApproval(c.deployment, nft));
    expect(await c.pub.readContract({ address: nft, abi: erc721Abi, functionName: "isApprovedForAll", args: [HOLDER, c.deployment.nftBid] })).toBe(false);
  });
});
