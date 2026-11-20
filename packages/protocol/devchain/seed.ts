// A seeded local market for the unified Order/Action model: sales, bids and a covered purchase
// right in several states, made with real transactions from Anvil's unlocked accounts. Used by
// `pnpm dev:chain` and (once migrated) the indexer and e2e suites.
import { encodeAbiParameters, getAddress, parseEther, type Address, type Hex } from "viem";
import { fixedSchedule, type Schedule } from "../src/schedule";
import { predictOrderAddress } from "../src/orders";
import { artworkAbi } from "../src/abis";
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

  // --- Additive: a covered purchase right, its Actions-token resale (both exercised), and a
  //     reserved Artwork action. New mints/orders only; existing seeded orders are untouched. ---
  const accounts = await seedActionAccounts(c, col, buyer, t);

  return { orders, collections: col, me: ME, holdings: { dMe, mMe }, accounts };
}

/**
 * A Holder covered-purchase right (issued by SELLERS[0]), listed as an Actions token for a 0.2 ETH
 * premium, bought and exercised by `buyer` for its separate 0.5 ETH execution price; plus a
 * reserved Artwork palette change (issued and executed by SELLERS[1]) that credits its surplus.
 */
async function seedActionAccounts(c: Chain, col: NonNullable<Chain["collections"]>, buyer: Address, t: bigint) {
  const d = c.deployment;
  const far = t + 60n * 86_400n;
  const issuer = SELLERS[0];

  // Covered purchase right over a fresh meridian token (2.5% royalty).
  const nftId = await mint(c, col.meridian, issuer, 1n);
  const price = E("0.5");
  const coveredSpec = tx.coveredSpec(d, { issuer, nft: col.meridian, tokenId: nftId, price, proceedsTo: issuer, maxRoyaltyBps: 1000, deadline: far });
  const covered = createdOrder((await send(c, issuer, tx.create(d, coveredSpec, tx.randomSalt()))).receipt);
  await send(c, issuer, tx.depositNft(col.meridian, issuer, covered, nftId));
  await send(c, issuer, tx.activate(covered)); // mints the Actions token to the issuer

  // List the Actions token for a 0.2 ETH premium, separate from the 0.5 ETH execution price.
  const premium = E("0.2");
  const actionTokenId = BigInt(covered);
  const listSpec = tx.saleSpec(d, { issuer, nft: d.actions!, tokenId: actionTokenId, schedule: fixedSchedule(premium), proceedsTo: issuer, maxRoyaltyBps: 0 });
  const coveredListing = createdOrder((await send(c, issuer, tx.create(d, listSpec, tx.randomSalt()))).receipt);
  await send(c, issuer, tx.depositNft(d.actions!, issuer, coveredListing, actionTokenId));
  await send(c, issuer, tx.activate(coveredListing));

  // Buyer acquires the Actions token (premium) then exercises the covered right (execution price).
  await send(c, buyer, tx.buy(coveredListing, buyer, premium));
  await send(c, buyer, tx.exerciseCovered(covered, buyer, price));

  // Reserved Artwork action: mint, reserve for the predicted order, create, activate, execute.
  let reserved: Address | undefined;
  let artworkTokenId: bigint | undefined;
  if (c.artwork) {
    const exec = SELLERS[1];
    const artTokenId = 1n;
    await mintArtwork(c, c.artwork, exec, artTokenId);
    const kind = 0; // palette
    const allowed = 1n << 3n; // choice 3
    const operation = await c.pub.readContract({ address: c.artwork, abi: artworkAbi, functionName: "operation", args: [artTokenId, kind, allowed] }) as Hex;
    const salt: Hex = "0x0000000000000000000000000000000000000000000000000000000000000a11";
    const resSpec = tx.reservedSpec(d, { issuer: exec, target: c.artwork, operation, price: E("0.1"), targetValue: E("0.05"), proceedsTo: exec, deadline: far });
    const predicted = await predictOrderAddress(c.pub, d, exec, resSpec, salt) as Address;
    await send(c, exec, tx.artworkReserve(c.artwork, predicted, artTokenId, kind, allowed, far, E("0.05")));
    reserved = createdOrder((await send(c, exec, tx.create(d, resSpec, salt))).receipt);
    await send(c, exec, tx.activate(reserved));
    await send(c, exec, tx.executeReserved(reserved, encodeAbiParameters([{ type: "uint8" }], [3]), E("0.1")));
    artworkTokenId = artTokenId;
  }

  // A sale with maxRoyaltyBps=0 on a royalty collection (driftlines, 5%). It activates fine, but
  // every buy reverts RoyaltyAboveLimit, so the indexer poll must mark it blocked (quote() does
  // not apply maxRoyaltyBps).
  const blockedNftId = await mint(c, col.driftlines, SELLERS[1], 1n);
  const blockedSpec = tx.saleSpec(d, { issuer: SELLERS[1], nft: col.driftlines, tokenId: blockedNftId, schedule: fixedSchedule(E("1.3")), proceedsTo: SELLERS[1], maxRoyaltyBps: 0 });
  const royaltyBlocked = createdOrder((await send(c, SELLERS[1], tx.create(d, blockedSpec, tx.randomSalt()))).receipt);
  await send(c, SELLERS[1], tx.depositNft(col.driftlines, SELLERS[1], royaltyBlocked, blockedNftId));
  await send(c, SELLERS[1], tx.activate(royaltyBlocked));

  return { covered, coveredListing, coveredNftId: nftId, actionTokenId, premium, executionPrice: price, reserved, artwork: c.artwork, artworkTokenId, royaltyBlocked };
}

/** Mint an Artwork token to `to` by impersonating its fixed artist (local setup only). */
async function mintArtwork(c: Chain, artwork: Address, to: Address, tokenId: bigint) {
  const artist = getAddress("0xCB43078C32423F5348Cab5885911C3B5faE217F9");
  await c.test.setBalance({ address: artist, value: parseEther("1") });
  await c.test.impersonateAccount({ address: artist });
  const hash = await c.wallet(artist).writeContract({ address: artwork, abi: artworkAbi, functionName: "mint", args: [to, tokenId], account: artist, chain: c.chain });
  await c.pub.waitForTransactionReceipt({ hash });
  await c.test.stopImpersonatingAccount({ address: artist });
}
