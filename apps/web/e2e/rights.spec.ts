import { test, expect, type Page } from "@playwright/test";
import { getAddress, parseEther, type Address } from "viem";
import { readRight, rightAbi, eth } from "@market/protocol";
import { injectWallet, injectAtomicWallet, RPC } from "./wallet";
import { artifacts } from "@market/protocol/devchain";
import { ACC, D, collections, mint, ownerOf, pub, wallet, waitFor, connect, waitIndexer } from "./helpers";

const B = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const lower = (s: string) => s.toLowerCase();

async function confirm(page: Page, opener: string, confirmation = opener) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: opener, exact: true }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: confirmation, exact: true }).click();
}
async function issue(page: Page, nft: Address, id: bigint, rejectAt?: number) {
  await injectWallet(page, ACC.me, RPC, { rejectAt });
  await page.goto("/rights/issue");
  await connect(page);
  await page.getByLabel("nft collection address").fill(nft);
  await page.getByLabel("nft token id").fill(id.toString());
  await page.getByLabel("Exercise price in eth").fill("1");
  await page.getByRole("button", { name: "Issue and activate right", exact: true }).click();
}
async function sell(page: Page, premium: string) {
  await page.getByLabel("Premium in eth").fill(premium);
  await expect(page.getByText(`1% · ${eth(parseEther(premium) / 100n)} eth`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${eth(parseEther(premium) * 99n / 100n)} eth`, { exact: true })).toBeVisible();
  await confirm(page, "List the right", "Create premium listing");
  await expect(page.getByRole("button", { name: "Cancel listing and return token", exact: true })).toBeVisible({ timeout: 60000 });
}
async function buy(page: Page, premium: string) {
  await confirm(page, "Buy the right", `Pay at most ${eth(parseEther(premium))} eth premium`);
  await expect(page.getByRole("button", { name: "Exercise for 1.00 eth", exact: true })).toBeVisible({ timeout: 60000 });
}

test("covered right is issued, sold, resold, exercised and paid through the client", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const c = await collections();
  const id = await mint(c.driftlines, ACC.me);
  await issue(page, c.driftlines, id);
  await expect(page).toHaveURL(/\/rights\/0x[0-9a-fA-F]{40}$/, { timeout: 90000 });
  const account = getAddress(page.url().split("/").at(-1)!);
  await expect(page.getByRole("button", { name: "Exercise for 1.00 eth", exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/rights-issued-${info.project.name}.png`, fullPage: true });
  await sell(page, "0.2");
  const ctxA = await browser.newContext({ viewport: page.viewportSize()! });
  const a = await ctxA.newPage();
  await injectWallet(a, ACC.other); await a.goto(`/rights/${account}`); await connect(a);
  await expect(a.getByText("Premium only. Buying this token doesn't deliver the underlying nft.")).toBeVisible();
  await a.screenshot({ path: `test-results/rights-premium-${info.project.name}.png`, fullPage: true });
  await buy(a, "0.2");
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(account));
  await sell(a, "0.3");
  const ctxB = await browser.newContext({ viewport: page.viewportSize()! });
  const b = await ctxB.newPage();
  await injectWallet(b, B); await b.goto(`/rights/${account}`); await connect(b); await buy(b, "0.3");
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(account));
  await confirm(b, "Exercise for 1.00 eth", "Exercise right");
  await waitFor(() => readRight(pub, D, account), r => r.state === "exercised");
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(B));
  const credits = (await readRight(pub, D, account)).credits;
  expect(credits.reduce((n, x) => n + x.amount, 0n)).toBe(10n ** 18n);
  const before = new Map(await Promise.all(credits.map(async x => [x.beneficiary, await pub.getBalance({ address: x.beneficiary })] as const)));
  for (const x of credits) {
    await confirm(b, "Release payment");
    await waitFor(() => pub.readContract({ address: account, abi: rightAbi, functionName: "creditOf", args: [x.beneficiary] }), n => n === 0n);
  }
  for (const x of credits) expect((await pub.getBalance({ address: x.beneficiary })) - before.get(x.beneficiary)!).toBe(x.amount);
  await expect(b.getByText("No unpaid credits.")).toBeVisible();
  await expect(b.getByRole("dialog")).toHaveCount(0);
  await b.screenshot({ path: `test-results/rights-paid-${info.project.name}.png`, fullPage: true });
  await ctxA.close(); await ctxB.close();
});

test("interrupted staged issuance reloads as a pending account and can cancel and recover", async ({ page }) => {
  const c = await collections(); const id = await mint(c.driftlines, ACC.me);
  await issue(page, c.driftlines, id, 3);
  await expect(page.getByText("Cancelled in wallet.")).toBeVisible({ timeout: 60000 });
  const href = await page.getByRole("link", { name: /^Pending account / }).getAttribute("href");
  const account = getAddress(href!.split("/").at(-1)!);
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(account));
  await page.reload();
  await expect(page.getByLabel("nft token id")).toHaveValue(id.toString());
  await page.goto(href!);
  await expect(page.getByRole("button", { name: "Activate right", exact: true })).toBeVisible();
  await confirm(page, "Cancel pending setup");
  await expect(page.getByRole("button", { name: "Recover nft", exact: true })).toBeVisible();
  await confirm(page, "Recover nft");
  await waitFor(() => ownerOf(c.driftlines, id), o => lower(o) === lower(ACC.me));
});

test("canonical rights collection offers are refused through manual routes", async ({ page }) => {
  await injectWallet(page); await page.goto(`/c/${D.rights}/offer`); await connect(page);
  await expect(page.getByText("Rights offers must name a specific token. Open a right to make an offer.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Deposit .* and offer/ })).toHaveCount(0);
});

test("a genuine account issues atomically and a rejected activation never falls back to staged sends", async ({ page }) => {
  const hash = await wallet(ACC.me).deployContract({ abi: artifacts.AtomicWallet.abi, bytecode: artifacts.AtomicWallet.bytecode, args: [ACC.me] });
  const account = (await pub.waitForTransactionReceipt({ hash })).contractAddress!;
  await pub.waitForTransactionReceipt({ hash: await wallet(ACC.me).sendTransaction({ to: account, value: parseEther("2") }) });
  const c = await collections(); const id = await mint(c.driftlines, account);
  await injectAtomicWallet(page, account, ACC.me); await page.goto("/rights/issue"); await connect(page);
  await page.getByLabel("nft collection address").fill(c.driftlines);
  await page.getByLabel("nft token id").fill(id.toString());
  await page.getByLabel("Exercise price in eth").fill("1");
  await page.getByLabel("Atomic wallet batch").check();
  await page.getByRole("button", { name: "Issue and activate right", exact: true }).click();
  await expect(page).toHaveURL(/\/rights\/0x[0-9a-fA-F]{40}$/, { timeout: 90000 });
  const backing = getAddress(page.url().split("/").at(-1)!);
  expect((await readRight(pub, D, backing)).issuer.toLowerCase()).toBe(account.toLowerCase());
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(backing));
  expect(await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts)).toBe(1);
  const nextId = await mint(c.driftlines, account);
  await page.goto("/rights/issue");
  await page.getByLabel("nft collection address").fill(c.driftlines);
  await page.getByLabel("nft token id").fill(nextId.toString());
  await page.getByLabel("Exercise price in eth").fill("1");
  await page.getByLabel("Maximum exercise royalty").selectOption("0");
  await page.getByLabel("Atomic wallet batch").check();
  const pending = await page.getByRole("link", { name: /^Pending account / }).getAttribute("href");
  await page.getByRole("button", { name: "Issue and activate right", exact: true }).click();
  await expect(page.getByText("The atomic batch could not be prepared. Nothing was sent. Choose separate transactions explicitly if you want a staged flow.")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts)).toBe(0);
  expect(lower(await ownerOf(c.driftlines, nextId))).toBe(lower(account));
  expect(await pub.getCode({ address: getAddress(pending!.split("/").at(-1)!) })).toBeUndefined();
});
