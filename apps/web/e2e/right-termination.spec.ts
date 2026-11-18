import { test, expect, type Page } from "@playwright/test";
import { createTestClient, decodeEventLog, getAbiItem, http, parseEther, type Address } from "viem";
import {
  encodeCoveredConfig, erc721Abi, marketAbi, orderAbi, randomSalt, readRight,
  rightAbi, rightsTx, tx, verifyRightDeposit, type ContractCall,
} from "@market/protocol";
import { injectWallet, RPC } from "./wallet";
import { ACC, D, chain, collections, connect, mint, ownerOf, pub, waitFor, waitIndexer, wallet } from "./helpers";

const lower = (address: string) => address.toLowerCase();
const anvil = createTestClient({ chain, transport: http(RPC), mode: "anvil" });

async function send(from: Address, call: ContractCall) {
  const hash = await wallet(from).writeContract({ ...call, account: from, chain } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
  return receipt;
}

async function issueBacked(duration = 7n * 86400n) {
  const { plain: nft } = await collections();
  const id = await mint(nft, ACC.me);
  const deadline = (await pub.getBlock()).timestamp + duration;
  const config = { nft, tokenId: id, price: parseEther("1"), proceedsTo: ACC.me, maxRoyaltyBps: 0 };
  const bytes = encodeCoveredConfig(config);
  const receipt = await send(ACC.me, rightsTx.createRight(D, config, deadline, ACC.me, randomSalt()));
  const event = receipt.logs.map(log => {
    try { return decodeEventLog({ abi: marketAbi, ...log }); } catch { return null; }
  }).find(event => event?.eventName === "RightCreated");
  if (!event || event.eventName !== "RightCreated") throw new Error("Missing canonical right creation event");
  const account = event.args.account;
  await verifyRightDeposit(pub, D, account, ACC.me, config, deadline);
  await send(ACC.me, tx.depositNft(nft, ACC.me, account, id));
  await send(ACC.me, rightsTx.activateRight(account, bytes));
  await waitIndexer();
  return { account, nft, id, deadline, bytes, tokenId: BigInt(account) };
}

async function openRight(page: Page, account: Address, signer: Address) {
  await injectWallet(page, signer);
  await page.goto(`/rights/${account}`);
  await connect(page);
  await expect(page.getByRole("heading", { name: "Committed terms", exact: true })).toBeVisible();
}

async function confirm(page: Page, opener: string, confirmation = opener) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: opener, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: confirmation, exact: true }).click();
}

async function list(page: Page) {
  await page.getByLabel("Premium in eth").fill("0.2");
  await confirm(page, "List the right", "Create premium listing");
  await expect(page.getByRole("button", { name: "Cancel listing and return token", exact: true })).toBeVisible({ timeout: 45_000 });
}

test("live listing cancellation preserves the right, and paid holder surrender gives no premium refund", async ({ page, browser }, info) => {
  const r = await issueBacked();
  await openRight(page, r.account, ACC.me);
  await list(page);
  const escrow = await ownerOf(D.rights!, r.tokenId);
  expect(lower(escrow)).not.toBe(lower(ACC.me));
  await confirm(page, "Cancel listing and return token");
  await waitFor(() => ownerOf(D.rights!, r.tokenId), owner => lower(owner) === lower(ACC.me));
  const returned = await readRight(pub, D, r.account, { config: r.bytes });
  expect(returned.stateCode).toBe(1); expect(returned.deadline).toBe(r.deadline); expect(returned.config).toBe(r.bytes);
  expect(lower(await ownerOf(r.nft, r.id))).toBe(lower(r.account));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exercise for 1.00 eth", exact: true })).toBeVisible();
  await list(page);

  const context = await browser.newContext({ viewport: page.viewportSize()! });
  const buyer = await context.newPage();
  try {
    await openRight(buyer, r.account, ACC.other);
    const beforePurchase = await pub.getBalance({ address: ACC.other });
    await confirm(buyer, "Buy the right", "Pay at most 0.20 eth premium");
    await waitFor(() => ownerOf(D.rights!, r.tokenId), owner => lower(owner) === lower(ACC.other));
    expect(beforePurchase - await pub.getBalance({ address: ACC.other })).toBeGreaterThanOrEqual(parseEther("0.2"));
    await expect(buyer.getByRole("dialog")).toHaveCount(0);
    await buyer.getByLabel("I give up this right. The issuer can recover the nft and my premium isn't refunded.").check();
    const beforeSurrender = await pub.getBalance({ address: ACC.other });
    const beforeBlock = await pub.getBlockNumber({ cacheTime: 0 });
    await confirm(buyer, "Surrender right");
    await waitFor(() => readRight(pub, D, r.account, { config: r.bytes }), view => view.stateCode === 4);
    const events = await pub.getLogs({ address: r.account, event: getAbiItem({ abi: rightAbi, name: "Surrendered" }), fromBlock: beforeBlock + 1n, toBlock: "latest" });
    expect(events).toHaveLength(1);
    const receipt = await pub.getTransactionReceipt({ hash: events[0]!.transactionHash });
    expect(beforeSurrender - await pub.getBalance({ address: ACC.other })).toBe(receipt.gasUsed * receipt.effectiveGasPrice);
    const surrendered = await readRight(pub, D, r.account, { config: r.bytes });
    expect(surrendered.holder).toBe(null); expect(surrendered.totalCredits).toBe(0n);
    expect(lower(surrendered.residual)).toBe(lower(ACC.me));
    expect(lower(await ownerOf(r.nft, r.id))).toBe(lower(r.account));
    await expect(buyer.getByRole("button", { name: "Recover nft", exact: true })).toHaveCount(0);
    await expect(buyer.getByRole("dialog")).toHaveCount(0);
    await buyer.screenshot({ path: `test-results/right-surrender-${info.project.name}.png`, fullPage: true });
    await expect(page.getByRole("button", { name: "Recover nft", exact: true })).toBeVisible();
    await confirm(page, "Recover nft");
    await waitFor(() => ownerOf(r.nft, r.id), owner => lower(owner) === lower(ACC.me));
  } finally { await context.close(); }
});

test("expiry in reseller escrow separates listing close, finalization and issuer recovery", async ({ page, browser }, info) => {
  const r = await issueBacked(10800n);
  await send(ACC.me, { address: D.rights!, abi: erc721Abi, functionName: "transferFrom", args: [ACC.me, ACC.other, r.tokenId] });
  await openRight(page, r.account, ACC.other);
  await list(page);
  const escrow = await ownerOf(D.rights!, r.tokenId);
  await anvil.setNextBlockTimestamp({ timestamp: r.deadline });
  await anvil.mine({ blocks: 1 });
  await waitIndexer();
  await expect(page.getByText("Expired, awaiting finalization", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy the right", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Exercise for 1.00 eth", exact: true })).toHaveCount(0);
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  const issuer = await context.newPage();
  try {
    await openRight(issuer, r.account, ACC.me);
    await expect(issuer.getByText("Expired, awaiting finalization", { exact: true })).toBeVisible();
    await expect(issuer.getByRole("button", { name: "Buy the right", exact: true })).toHaveCount(0);
    await expect(issuer.getByRole("button", { name: "Exercise for 1.00 eth", exact: true })).toHaveCount(0);
    await confirm(page, "Close stale listing");
    await waitFor(() => pub.readContract({ address: escrow, abi: orderAbi, functionName: "closed" }), closed => closed);
    expect((await readRight(pub, D, r.account, { config: r.bytes })).stateCode).toBe(1);
    expect(lower(await ownerOf(D.rights!, r.tokenId))).toBe(lower(escrow));
    expect(lower(await ownerOf(r.nft, r.id))).toBe(lower(r.account));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await confirm(page, "Finalize expiry");
    const expired = await waitFor(() => readRight(pub, D, r.account, { config: r.bytes }), view => view.stateCode === 3);
    expect(expired.holder).toBe(null); expect(expired.totalCredits).toBe(0n); expect(lower(expired.residual)).toBe(lower(ACC.me));
    await expect(page.getByRole("button", { name: "Recover nft", exact: true })).toHaveCount(0);
    await expect(pub.simulateContract({ ...rightsTx.recoverRightNft(r.account, r.nft, r.id, ACC.other), account: ACC.other })).rejects.toThrow();
  await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({ path: `test-results/right-expired-${info.project.name}.png`, fullPage: true });
    await expect(issuer.getByRole("button", { name: "Recover nft", exact: true })).toBeVisible();
    await confirm(issuer, "Recover nft");
    await waitFor(() => ownerOf(r.nft, r.id), owner => lower(owner) === lower(ACC.me));
  } finally { await context.close(); }
});

test("exercise confirmation rechecks a direct transfer made after the form opened", async ({ page }) => {
  const r = await issueBacked();
  await openRight(page, r.account, ACC.me);
  await page.getByRole("button", { name: "Exercise for 1.00 eth", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const prompts = await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts);
  await send(ACC.me, { address: D.rights!, abi: erc721Abi, functionName: "transferFrom", args: [ACC.me, ACC.other, r.tokenId] });
  await page.getByRole("dialog").getByRole("button", { name: "Exercise right", exact: true }).click();
  await expect(page.getByText("Only the current holder of a live backed right can exercise.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts)).toBe(prompts);
  const live = await readRight(pub, D, r.account, { config: r.bytes });
  expect(live.stateCode).toBe(1); expect(lower(live.holder!)).toBe(lower(ACC.other)); expect(live.totalCredits).toBe(0n);
  expect(await pub.getBalance({ address: r.account })).toBe(0n);
  expect(lower(await ownerOf(r.nft, r.id))).toBe(lower(r.account));
});
