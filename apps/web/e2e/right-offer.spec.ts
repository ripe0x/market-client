import { test, expect } from "@playwright/test";
import { decodeEventLog, getAbiItem, parseEther, type Address } from "viem";
import {
  decodeBidConfig, encodeCoveredConfig, marketAbi, nftBidAbi, orderFeeBps,
  quoteBid, randomSalt, readRight, rightsAbi, rightsTx, tx, verifyRightDeposit,
  type ApiOrder, type ContractCall,
} from "@market/protocol";
import { artifacts } from "@market/protocol/devchain";
import { injectWallet } from "./wallet";
import { ACC, D, collections, connect, mint, ownerOf, positionsOf, pub, waitFor, waitIndexer, wallet, chain } from "./helpers";

const lower = (address: string) => address.toLowerCase();
const indexer = process.env.E2E_INDEXER_URL ?? "http://localhost:42169";

async function send(from: Address, call: ContractCall) {
  const hash = await wallet(from).writeContract({ ...call, account: from, chain } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return receipt;
}

test("a token specific right offer preserves the exercise window and settles only its premium", async ({ page, browser }, info) => {
  const { driftlines: nft } = await collections();
  const id = await mint(nft, ACC.me);
  const deadline = (await pub.getBlock()).timestamp + 7n * 86400n;
  const config = { nft, tokenId: id, price: parseEther("1"), proceedsTo: ACC.me, maxRoyaltyBps: 500 };
  const bytes = encodeCoveredConfig(config);
  const created = await send(ACC.me, rightsTx.createRight(D, config, deadline, ACC.me, randomSalt()));
  const event = created.logs.map(log => {
    try { return decodeEventLog({ abi: marketAbi, ...log }); } catch { return null; }
  }).find(event => event?.eventName === "RightCreated");
  if (!event || event.eventName !== "RightCreated") throw new Error("Missing canonical right creation event");
  const account = event.args.account;
  const tokenId = BigInt(account);
  expect(tokenId).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
  await verifyRightDeposit(pub, D, account, ACC.me, config, deadline);
  await send(ACC.me, tx.depositNft(nft, ACC.me, account, id));
  await send(ACC.me, rightsTx.activateRight(account, bytes));
  await waitIndexer();

  await injectWallet(page, ACC.other);
  await page.goto(`/c/${D.rights}/${tokenId}/offer`);
  await connect(page);
  await expect(page.getByText(/This offer buys the right token\. Exercise costs a separate 1\.00 eth\./)).toBeVisible();
  await expect(page.getByRole("group", { name: "Expires" }).getByRole("button", { name: "7D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Increase", exact: true })).toHaveCount(0);
  await page.getByLabel("Offer amount in ETH").fill("0.15");
  await page.getByRole("button", { name: "Deposit 0.15 ETH and offer", exact: true }).click();
  const positions = await waitFor(() => positionsOf(ACC.other), value => value.offers.some(order => lower(order.nft) === lower(D.rights!) && order.tokenId === tokenId.toString()));
  const address = positions.offers.find(order => lower(order.nft) === lower(D.rights!) && order.tokenId === tokenId.toString())!.address;
  const response = await fetch(`${indexer}/api/orders/${address}`);
  expect(response.status).toBe(200);
  const offer = await response.json() as ApiOrder;
  const bid = decodeBidConfig(offer.config);
  expect(bid.anyToken).toBe(false); expect(bid.tokenId).toBe(tokenId); expect(bid.maxFills).toBe(1n);
  expect(lower(bid.nft)).toBe(lower(D.rights!)); expect(lower(bid.recipient)).toBe(lower(ACC.other));
  expect(bid.schedule.expiry).toBe(deadline - 3600n);
  expect(lower(offer.rightAccount!)).toBe(lower(account));
  expect(offer.underlyingTokenId).toBe(id.toString());
  expect(await pub.getBalance({ address })).toBe(parseEther("0.15"));

  const quote = await quoteBid(pub, D, address, bid, tokenId);
  expect(await orderFeeBps(pub, D, address)).toBe(100n);
  expect(quote.price).toBe(parseEther("0.15")); expect(quote.fee).toBe(parseEther("0.0015"));
  expect(quote.proceeds).toBe(parseEther("0.1485")); expect(quote.royalty).toBe(0n);
  const [royaltyTo] = await pub.readContract({ address: nft, abi: artifacts.TestNFT.abi, functionName: "royaltyInfo", args: [id, config.price] }) as [Address, bigint];
  expect(lower(quote.feeTo)).not.toBe(lower(ACC.me));
  expect(lower(quote.feeTo)).not.toBe(lower(royaltyTo));
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  const seller = await context.newPage();
  try {
    await injectWallet(seller, ACC.me);
    await seller.goto(`/c/${D.rights}/offers/${address}/sell`);
    await connect(seller);
    await seller.locator("button", { hasText: `#${tokenId}` }).first().click();
    await expect(seller.getByText("You receive", { exact: true })).toBeVisible();
    await expect(seller.getByText("0.1485", { exact: false }).first()).toBeVisible();
    expect(await seller.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await seller.screenshot({ path: `test-results/rights-specific-offer-${info.project.name}.png`, fullPage: true });
    const beforeSeller = await pub.getBalance({ address: ACC.me });
    const beforeFee = await pub.getBalance({ address: quote.feeTo });
    const beforeRoyalty = await pub.getBalance({ address: royaltyTo });
    const beforeBuyer = await pub.getBalance({ address: ACC.other });
    const fromBlock = (await pub.getBlockNumber({ cacheTime: 0 })) + 1n;
    await seller.getByRole("button", { name: `Approve #${tokenId}`, exact: true }).click();
    await waitFor(() => ownerOf(D.rights!, tokenId), owner => lower(owner) === lower(ACC.other));
    const bought = await pub.getLogs({ address: D.nftBid, event: getAbiItem({ abi: nftBidAbi, name: "Bought" }), args: { order: address }, fromBlock, toBlock: "latest" });
    const approvals = await pub.getLogs({ address: D.rights!, event: getAbiItem({ abi: rightsAbi, name: "Approval" }), args: { owner: ACC.me, tokenId }, fromBlock, toBlock: "latest" });
    expect(bought).toHaveLength(1); expect(bought[0]!.args.price).toBe(parseEther("0.15")); expect(bought[0]!.args.royalty).toBe(0n);
    const hashes = [...new Set([...bought, ...approvals].map(log => log.transactionHash))];
    expect(hashes).toHaveLength(2);
    const receipts = await Promise.all(hashes.map(hash => pub.getTransactionReceipt({ hash })));
    const gas = receipts.reduce((sum, receipt) => { expect(lower(receipt.from)).toBe(lower(ACC.me)); return sum + receipt.gasUsed * receipt.effectiveGasPrice; }, 0n);
    expect(await pub.getBalance({ address: ACC.me })).toBe(beforeSeller + parseEther("0.1485") - gas);
    expect(await pub.getBalance({ address: quote.feeTo })).toBe(beforeFee + parseEther("0.0015"));
    expect(await pub.getBalance({ address: royaltyTo })).toBe(beforeRoyalty);
    expect(await pub.getBalance({ address: ACC.other })).toBe(beforeBuyer);
    expect(await pub.getBalance({ address })).toBe(0n);
    expect(lower(await ownerOf(nft, id))).toBe(lower(account));
    const right = await readRight(pub, D, account, { config: bytes });
    expect(right.config).toBe(bytes); expect(right.deadline).toBe(deadline); expect(right.price).toBe(config.price);
    expect(right.royaltyAmount).toBe(parseEther("0.05")); expect(right.totalCredits).toBe(0n); expect(right.stateCode).toBe(1);
    expect(lower(right.holder!)).toBe(lower(ACC.other));
  } finally { await context.close(); }
});
