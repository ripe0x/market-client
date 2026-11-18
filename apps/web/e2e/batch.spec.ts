import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import { ACC, collections, mint, balance, ownerOf, waitFor, connect, eth, offerOnChain } from "./helpers";

const lower = (a: string) => a.toLowerCase();
// Each run makes its own funded collection offer (account 2 bids), so runs never share state.
const OFFER_OWNER = ACC.other;

// Review finding C1: with an EIP-5792 wallet, approve + sell must go out as one batch in one
// prompt; the sell step must not be simulated before its approval exists.
test("accept an offer with a batching wallet: one prompt, token delivered, proceeds paid", async ({ page }) => {
  const c = await collections();
  const id = await mint(c.driftlines, ACC.me);
  await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(ACC.me));
  const COLLECTION_OFFER = await offerOnChain(OFFER_OWNER, c.driftlines, true, 0n, eth("0.5"));
  await waitFor(() => fetch(`${process.env.E2E_INDEXER_URL ?? "http://localhost:42169"}/api/orders/${COLLECTION_OFFER}`).then((r) => r.status), (s) => s === 200);

  await injectWallet(page, undefined, undefined, { atomic: true });
  await page.goto(`/c/${c.driftlines}/offers/${COLLECTION_OFFER}/sell`);
  await connect(page);
  await page.locator("button", { hasText: `#${id}` }).first().click();
  await waitFor(async () => (await page.locator("body").innerText()).match(/You receive\s*([\d.]+)/)?.[1] ?? "0", (v) => Number(v) > 0);
  const proceeds = eth((await page.locator("body").innerText()).match(/You receive\s*([\d.]+)/)![1]!);

  const before = await balance(ACC.me);
  await page.getByRole("button", { name: /^Approve #/ }).click();
  await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(OFFER_OWNER));

  const delta = (await balance(ACC.me)) - before;
  expect(delta > 0n && delta <= proceeds && delta > proceeds - eth("0.02")).toBeTruthy();
  expect(await page.evaluate(() => (window as unknown as { __walletPrompts: number }).__walletPrompts)).toBe(1);
});
