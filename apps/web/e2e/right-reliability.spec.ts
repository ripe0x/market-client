import { test, expect, type Page } from "@playwright/test";
import { createTestClient, decodeEventLog, http, parseEther, type Address } from "viem";
import { encodeCoveredConfig, encodeSaleConfig, marketAbi, orderAbi, randomSalt, rightsAbi, rightsTx, tx, configHash, type ContractCall } from "@market/protocol";
import { injectWallet, RPC } from "./wallet";
import { ACC, D, chain, collections, connect, mint, ownerOf, pub, waitFor, waitIndexer, wallet } from "./helpers";
const anvil = createTestClient({ chain, transport: http(RPC), mode: "anvil" });
const lower = (a: string) => a.toLowerCase();
async function send(from: Address, call: ContractCall) {
  const hash = await wallet(from).writeContract({ ...call, account: from, chain } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success"); return receipt;
}
async function issue(activate = true, residual: Address = ACC.me) {
  const { plain: nft } = await collections(), id = await mint(nft, ACC.me);
  const deadline = (await pub.getBlock()).timestamp + 86400n;
  const config = { nft, tokenId: id, price: parseEther("1"), proceedsTo: ACC.me, maxRoyaltyBps: 0 };
  const bytes = encodeCoveredConfig(config);
  const receipt = await send(ACC.me, rightsTx.createRight(D, config, deadline, residual, randomSalt()));
  const event = receipt.logs.map(log => { try { return decodeEventLog({ abi: marketAbi, ...log }); } catch { return null; } }).find(e => e?.eventName === "RightCreated");
  const account = (event!.args as { account: Address }).account;
  await send(ACC.me, tx.depositNft(nft, ACC.me, account, id));
  if (activate) await send(ACC.me, rightsTx.activateRight(account, bytes));
  return { account, nft, id, deadline, bytes, tokenId: BigInt(account) };
}
async function list(r: Awaited<ReturnType<typeof issue>>) {
  const now = (await pub.getBlock()).timestamp, expiry = now + 120n;
  const config = { nft: D.rights!, tokenId: r.tokenId, schedule: { startPrice: parseEther("0.2"), endPrice: parseEther("0.2"), startTime: now, endTime: now, expiry }, proceedsTo: ACC.me, maxRoyaltyBps: 0 };
  const bytes = encodeSaleConfig(config), salt = randomSalt();
  const order = await pub.readContract({ address: D.market, abi: marketAbi, functionName: "orderAddress", args: [ACC.me, D.nftSale, configHash(bytes), salt] });
  await send(ACC.me, tx.createListing(D, config, salt));
  await send(ACC.me, tx.depositNft(D.rights!, ACC.me, order, r.tokenId));
  await waitIndexer(); return { order, expiry };
}
async function open(page: Page, url: string, signer: Address = ACC.me, atomic = false) {
  await injectWallet(page, signer, RPC, { atomic }); await page.goto(url); await connect(page);
}
async function confirm(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: label, exact: true }).click();
}

test("expired premium listing stays visible, cannot be acquired, and Positions returns its live right", async ({ page, browser }, info) => {
  const r = await issue(), l = await list(r);
  await anvil.setNextBlockTimestamp({ timestamp: l.expiry }); await anvil.mine({ blocks: 1 }); await waitIndexer();
  await open(page, `/rights/${r.account}`, ACC.other);
  await expect(page.getByRole("heading", { name: "Acquire the right", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy the right", exact: true })).toBeDisabled();
  await expect(page.getByText("This listing has expired. The right has a separate exercise deadline.", { exact: true })).toBeVisible();
  expect(await pub.readContract({ address: r.account, abi: (await import("@market/protocol")).rightAbi, functionName: "state" })).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/listing-expired-${info.project.name}.png`, fullPage: true });
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  try {
    const seller = await context.newPage(); await open(seller, "/positions");
    const row = seller.locator('[role="row"]').filter({ hasText: `#${r.tokenId}` });
    await row.getByRole("button", { name: "Cancel and withdraw", exact: true }).click();
    await seller.getByRole("dialog").getByRole("button", { name: "Cancel and withdraw", exact: true }).click();
    await waitFor(() => ownerOf(D.rights!, r.tokenId), owner => lower(owner) === lower(ACC.me));
    expect(lower(await ownerOf(r.nft, r.id))).toBe(lower(r.account));
    expect(await pub.readContract({ address: l.order, abi: orderAbi, functionName: "closed" })).toBe(true);
  } finally { await context.close(); }
});

test("Positions closes an expired escrowed right without a withdrawal in an atomic-capable wallet", async ({ page }, info) => {
  const r = await issue(), l = await list(r);
  await anvil.setNextBlockTimestamp({ timestamp: r.deadline }); await anvil.mine({ blocks: 1 }); await waitIndexer();
  await open(page, "/positions", ACC.me, true);
  const row = page.locator('[role="row"]').filter({ hasText: `#${r.tokenId}` });
  await expect(row.getByRole("button", { name: "Close stale listing", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Close stale listing", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Close stale listing", exact: true }).click();
  await waitFor(() => pub.readContract({ address: l.order, abi: orderAbi, functionName: "closed" }), Boolean);
  expect(lower(await ownerOf(D.rights!, r.tokenId))).toBe(lower(l.order));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row.getByRole("button", { name: /withdraw/i })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Close stale listing", exact: true })).toHaveCount(0);
  await expect(row.getByRole("link", { name: "Inspect right", exact: true })).toBeVisible();
  await send(ACC.other, rightsTx.finalizeRight(r.account)); await waitIndexer();
  await expect(pub.readContract({ address: D.rights!, abi: rightsAbi, functionName: "ownerOf", args: [r.tokenId] })).rejects.toThrow();
  await page.reload();
  const rights = page.getByRole("heading", { name: "Your rights", exact: true }).locator("..");
  await expect(rights.locator(`a[href="/rights/${r.account}"]`)).toBeVisible();
  await expect(row.getByRole("button", { name: /withdraw/i })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Close stale listing", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/positions-expired-right-${info.project.name}.png`, fullPage: true });
});

async function discoveryOutage(page: Page) {
  const indexer = new URL(process.env.E2E_INDEXER_URL ?? "http://localhost:42169").origin;
  await page.route(url => url.origin === indexer, route => route.request().method() === "GET" ? route.abort("failed") : route.continue());
  await page.route(url => url.origin === new URL(RPC).origin, async route => {
    const body = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    if ((Array.isArray(body) ? body : [body]).some(c => c?.method === "eth_getLogs")) await route.abort("failed");
    else await route.continue();
  });
}
test("manual original config recovers burned collateral during discovery outage and rejects wrong bytes", async ({ page }, info) => {
  const r = await issue(); await send(ACC.me, rightsTx.surrenderRight(r.account));
  await discoveryOutage(page); await open(page, `/rights/${r.account}`);
  await expect(page.getByRole("heading", { name: "Advanced collateral recovery", exact: true })).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts);
  await page.getByRole("textbox", { name: "Original encoded configuration", exact: true }).fill("0x1234");
  await page.getByRole("button", { name: "Verify recovery configuration", exact: true }).click();
  await expect(page.getByText("The creation config does not match the committed terms.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts)).toBe(before);
  await page.getByRole("textbox", { name: "Original encoded configuration", exact: true }).fill(r.bytes);
  await page.getByRole("button", { name: "Verify recovery configuration", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Recover collateral", exact: true })).toBeVisible();
  await expect(page.getByText("Recovery destination", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/manual-right-recovery-${info.project.name}.png`, fullPage: true });
  await confirm(page, "Recover nft");
  await waitFor(() => ownerOf(r.nft, r.id), owner => lower(owner) === lower(ACC.me));
});

test("Positions preserves a confirmed staged close when the right expires before withdrawal retry", async ({ page }) => {
  const r = await issue(), l = await list(r);
  await injectWallet(page, ACC.me, RPC, { rejectAt: 2 }); await page.goto("/positions"); await connect(page);
  const row = page.locator('[role="row"]').filter({ hasText: `#${r.tokenId}` });
  await row.getByRole("button", { name: "Cancel and withdraw", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel and withdraw", exact: true }).click();
  await waitFor(() => pub.readContract({ address: l.order, abi: orderAbi, functionName: "closed" }), Boolean);
  await expect(dialog.getByText("Cancelled in wallet.", { exact: true })).toBeVisible();
  const prompts = await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts);
  await anvil.setNextBlockTimestamp({ timestamp: r.deadline }); await anvil.mine({ blocks: 1 });
  await dialog.getByRole("button", { name: "Cancel and withdraw", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts)).toBe(prompts);
  expect(lower(await ownerOf(D.rights!, r.tokenId))).toBe(lower(l.order));
  expect(await pub.readContract({ address: l.order, abi: orderAbi, functionName: "closed" })).toBe(true);
  await expect(row.getByRole("link", { name: "Inspect right", exact: true })).toBeVisible();
});
