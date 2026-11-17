import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import { ACC, collections, mint, balance, ownerOf, isApprovedForAll, NFTBID, waitFor, getToken, connect, eth, offerOnChain } from "./helpers";

const lower = (a: string) => a.toLowerCase();
// Each run makes its own funded collection offer (account 2 bids), so runs never share state.
const OFFER_OWNER = ACC.other;

test("accept an offer: approve + sell; seller receives the proceeds, token delivered", async ({ page }) => {
  const c = await collections();
  const id = await mint(c.driftlines, ACC.me);
  // Make sure the minted token shows up as owned before loading the picker.
  await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(ACC.me));
  const COLLECTION_OFFER = await offerOnChain(OFFER_OWNER, c.driftlines, true, 0n, eth("0.5"));
  await waitFor(() => fetch(`http://localhost:42169/api/orders/${COLLECTION_OFFER}`).then((r) => r.status), (s) => s === 200);

  await injectWallet(page);
  await page.goto(`/c/${c.driftlines}/offers/${COLLECTION_OFFER}/sell`);
  await connect(page);

  await page.locator("button", { hasText: `#${id}` }).first().click();

  // Read the quoted proceeds from the breakdown.
  await expect(page.getByText("You receive")).toBeVisible();
  await waitFor(async () => (await page.locator("body").innerText()).match(/You receive\s*([\d.]+)/)?.[1] ?? "0", (v) => Number(v) > 0);
  const proceedsStr = (await page.locator("body").innerText()).match(/You receive\s*([\d.]+)/)![1]!;
  const proceeds = eth(proceedsStr);

  const before = await balance(ACC.me);
  await page.getByRole("button", { name: /^Approve #/ }).click();

  // The offer delivers the token to its recipient (account 4) and pays the seller.
  await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(OFFER_OWNER));
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(OFFER_OWNER));

  const delta = (await balance(ACC.me)) - before;
  // delta == proceeds − gas(approve + sell): positive, at most proceeds, within gas of it.
  expect(delta > 0n).toBeTruthy();
  expect(delta <= proceeds).toBeTruthy();
  expect(delta > proceeds - eth("0.02")).toBeTruthy();

  // The per-token approval clears itself on the sale.
  expect(await isApprovedForAll(c.driftlines, ACC.me, NFTBID)).toBe(false);
  void getToken;
});
