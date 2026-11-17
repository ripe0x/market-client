import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import {
  ACC,
  collections,
  mint,
  listFixed,
  offerOnChain,
  positionsOf,
  balance,
  ownerOf,
  isApprovedForAll,
  setApprovalForAll,
  NFTBID,
  mineBlocks,
  waitFor,
  connect,
  selectTab,
  eth,
} from "./helpers";

const lower = (a: string) => a.toLowerCase();

test("cancel and withdraw a listing returns the NFT", async ({ page }) => {
  const c = await collections();
  const id = await mint(c.driftlines, ACC.me);
  const order = await listFixed(ACC.me, c.driftlines, id, eth("1"));
  await mineBlocks();
  await waitFor(() => positionsOf(ACC.me), (p) => p.listings.some((l) => lower(l.address) === lower(order)));

  await injectWallet(page);
  await page.goto("/positions");
  await connect(page);

  const row = page.locator('[role="row"]').filter({ hasText: `#${id}` }).first();
  await row.getByRole("button", { name: /Cancel and withdraw/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Cancel and withdraw/ }).click();

  await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(ACC.me));
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(ACC.me));
});

test("cancel and withdraw an offer refunds the ETH", async ({ page }) => {
  const c = await collections();
  const order = await offerOnChain(ACC.me, c.driftlines, true, 0n, eth("0.333"), 1n);
  await mineBlocks();
  await waitFor(() => positionsOf(ACC.me), (p) => p.offers.some((o) => lower(o.address) === lower(order)));

  await injectWallet(page);
  await page.goto("/positions");
  await connect(page);
  await selectTab(page, "Offers");

  await page.getByRole("button", { name: /Cancel and refund 0\.333/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /Cancel and refund 0\.333/ }).click();

  await waitFor(() => balance(order), (b) => b === 0n);
  expect(await balance(order)).toBe(0n);
});

test("add funds to an underfunded offer", async ({ page }) => {
  const c = await collections();
  // price 1 ETH, 2 fills, funded with only 0.37 → underfunded.
  const order = await offerOnChain(ACC.me, c.driftlines, true, 0n, eth("1"), 2n, eth("0.37"));
  await mineBlocks(6);
  await waitFor(() => positionsOf(ACC.me), (p) => p.offers.some((o) => lower(o.address) === lower(order) && o.status === "underfunded"));

  await injectWallet(page);
  await page.goto("/positions");
  await connect(page);
  await selectTab(page, "Offers");

  const row = page.locator('[role="row"]').filter({ hasText: "0.37" }).first();
  await row.getByRole("button", { name: "Add funds" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Add/ }).click();

  await waitFor(() => balance(order), (b) => b > eth("1.5"));
  expect(await balance(order)).toBeGreaterThan(eth("1.5"));
});

test("remove an approve-all approval to the offer contract", async ({ page }) => {
  const c = await collections();
  await setApprovalForAll(ACC.me, c.driftlines, NFTBID, true);
  expect(await isApprovedForAll(c.driftlines, ACC.me, NFTBID)).toBe(true);

  await injectWallet(page);
  await page.goto("/positions");
  await connect(page);

  const item = page.locator("span").filter({ hasText: /Approval for all Driftlines/ }).first();
  await item.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Remove approval/ }).click();

  await waitFor(() => isApprovedForAll(c.driftlines, ACC.me, NFTBID), (v) => v === false);
  expect(await isApprovedForAll(c.driftlines, ACC.me, NFTBID)).toBe(false);
});
