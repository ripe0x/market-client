// Each contract error the UI maps (PLAN.md §7), provoked for real and decoded by decodeRevert.
import { parseEther, type Address } from "viem";
import { afterAll, beforeAll, expect, test } from "vitest";
import { encodeBidConfig, encodeSaleConfig, type BidConfig, type SaleConfig } from "../src/config";
import { decodeRevert, revertCopy } from "../src/errors";
import { collectionKind, quoteSale, refusesEth } from "../src/orders";
import { fixedSchedule } from "../src/schedule";
import * as tx from "../src/tx";
import { ACCOUNTS, artifacts, mint, startChain, type Chain } from "../devchain";
import { createdOrder, now, send } from "./helpers";

const [, SELLER, BUYER, BIDDER, HOLDER] = ACCOUNTS;
const E = (s: string) => parseEther(s);
let c: Chain;
beforeAll(async () => {
  c = await startChain();
});
afterAll(() => c?.stop());

async function listing(cfg: Partial<SaleConfig> & { tokenId: bigint }, deposit = true) {
  const config: SaleConfig = { nft: c.collections!.driftlines, schedule: fixedSchedule(E("1")), proceedsTo: SELLER, maxRoyaltyBps: 500, ...cfg };
  const order = createdOrder((await send(c, SELLER, tx.createListing(c.deployment, config, tx.randomSalt()))).receipt);
  if (deposit) await send(c, SELLER, tx.depositNft(config.nft, SELLER, order, config.tokenId));
  return { order, config, bytes: encodeSaleConfig(config) };
}

async function offer(cfg: Partial<BidConfig>, value: bigint) {
  const config: BidConfig = { nft: c.collections!.driftlines, anyToken: true, tokenId: 0n, schedule: fixedSchedule(E("0.5")), recipient: BIDDER, maxFills: 1n, ...cfg };
  const order = createdOrder((await send(c, BIDDER, tx.createOffer(c.deployment, config, tx.randomSalt(), value))).receipt);
  return { order, config, bytes: encodeBidConfig(config) };
}

const revert = async (from: Address, call: Parameters<typeof send>[2]) => {
  try {
    await c.pub.simulateContract({ ...call, account: from } as never);
  } catch (e) {
    return decodeRevert(e);
  }
  throw new Error("did not revert");
};

test("NotStarted, Expired", async () => {
  const t = await now(c);
  const a = await listing({ tokenId: await mint(c, c.collections!.driftlines, SELLER), schedule: { ...fixedSchedule(E("1")), startTime: t + 1000n, endTime: t + 1000n } });
  expect((await revert(BUYER, tx.buy(a.order, a.bytes, BUYER, E("1")))).name).toBe("NotStarted");
  const b = await listing({ tokenId: await mint(c, c.collections!.driftlines, SELLER), schedule: fixedSchedule(E("1"), t + 5n) });
  await c.test.increaseTime({ seconds: 10 });
  await c.test.mine({ blocks: 1 });
  const r = await revert(BUYER, tx.buy(b.order, b.bytes, BUYER, E("1")));
  expect(r.name).toBe("Expired");
  expect(revertCopy(r, { kind: "sale" })).toMatch(/^This listing expired /);
});

test("AboveMaxPrice, RoyaltyAboveLimit, OrderClosed", async () => {
  const a = await listing({ tokenId: await mint(c, c.collections!.driftlines, SELLER) });
  const r = await revert(BUYER, tx.buy(a.order, a.bytes, BUYER, E("0.9")));
  expect(r.name).toBe("AboveMaxPrice");
  expect(revertCopy(r, { kind: "sale" })).toBe("The price rose to 1.00 ETH before this confirmed. Nothing was bought.");

  const b = await listing({ tokenId: await mint(c, c.collections!.driftlines, SELLER), maxRoyaltyBps: 400 });
  expect((await revert(BUYER, tx.buy(b.order, b.bytes, BUYER, E("1")))).name).toBe("RoyaltyAboveLimit");
  await expect(quoteSale(c.pub, c.deployment, b.order, b.config)).rejects.toSatisfy((e) => decodeRevert(e).name === "RoyaltyAboveLimit");

  await send(c, SELLER, tx.close(a.order));
  expect((await revert(BUYER, tx.buy(a.order, a.bytes, BUYER, E("1")))).name).toBe("OrderClosed");
});

test("listing whose NFT never arrived cannot fill", async () => {
  const a = await listing({ tokenId: await mint(c, c.collections!.driftlines, SELLER) }, false);
  expect((await revert(BUYER, tx.buy(a.order, a.bytes, BUYER, E("1")))).name).toMatch(/^ERC721/);
});

test("BadRoyalty and a royalty receiver that refuses ETH", async () => {
  const zr = c.collections!.zeroReceiver;
  await send(c, ACCOUNTS[0], { address: zr, abi: artifacts.ZeroReceiverRoyaltyNFT.abi, functionName: "mint", args: [SELLER, 1n] });
  const a = await listing({ nft: zr, tokenId: 1n });
  expect((await revert(BUYER, tx.buy(a.order, a.bytes, BUYER, E("1")))).name).toBe("BadRoyalty");

  const b = await listing({ nft: c.collections!.refusingRoyalty, tokenId: await mint(c, c.collections!.refusingRoyalty, SELLER) });
  const r = await revert(BUYER, tx.buy(b.order, b.bytes, BUYER, E("1")));
  expect(r).toEqual({ name: "Error", args: ["refused"] });
  const q = await quoteSale(c.pub, c.deployment, b.order, b.config);
  expect(await refusesEth(c.pub, b.order, q.royaltyTo, q.royalty)).toBe(true);
  expect(await refusesEth(c.pub, b.order, q.feeTo, q.fee)).toBe(false);
});

test("InsufficientFunds, BelowMinProceeds, WrongToken", async () => {
  const id = await mint(c, c.collections!.driftlines, HOLDER);
  await send(c, HOLDER, tx.approveForOffers(c.deployment, c.collections!.driftlines, id));
  const under = await offer({}, E("0.4"));
  const r = await revert(HOLDER, tx.sellToOffer(under.order, under.bytes, id, 0n, HOLDER));
  expect(r.name).toBe("InsufficientFunds");
  expect(revertCopy(r, { kind: "bid" })).toBe("This offer holds 0.40 ETH, less than its 0.50 ETH price.");

  const ok = await offer({}, E("0.5"));
  expect((await revert(HOLDER, tx.sellToOffer(ok.order, ok.bytes, id, E("0.48"), HOLDER))).name).toBe("BelowMinProceeds");

  const single = await offer({ anyToken: false, tokenId: id + 1000n }, E("0.5"));
  expect((await revert(HOLDER, tx.sellToOffer(single.order, single.bytes, id, 0n, HOLDER))).name).toBe("WrongToken");
});

test("transfer-locked token fails in simulation; ERC1155 and ERC721 are told apart", async () => {
  const lk = c.collections!.lockable;
  const id = await mint(c, lk, HOLDER);
  await send(c, HOLDER, { address: lk, abi: artifacts.LockableNFT.abi, functionName: "setLocked", args: [id, true] });
  await send(c, HOLDER, tx.approveForOffers(c.deployment, lk, id));
  const o = await offer({ nft: lk }, E("0.5"));
  expect(await revert(HOLDER, tx.sellToOffer(o.order, o.bytes, id, 0n, HOLDER))).toEqual({ name: "Error", args: ["nested"] });
  expect(await collectionKind(c.pub, c.collections!.erc1155)).toBe("erc1155");
  expect(await collectionKind(c.pub, c.collections!.driftlines)).toBe("erc721");
  expect(await collectionKind(c.pub, BUYER)).toBe("unknown");
});

test("wallet rejection decodes to null copy", () => {
  expect(revertCopy({ name: "UserRejected" }, { kind: "sale" })).toBeNull();
});
