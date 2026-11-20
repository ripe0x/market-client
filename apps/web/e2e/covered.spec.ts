// Covered purchase rights (unified Order/Action model) driven through the UI: issue, exercise,
// surrender, finalize expiry and payment-credit release. A covered right IS an order (kind
// "covered", admission "holder"); its backing account == the order address == the Actions-token id.
// Issuance is the shared escrow flow (create → deposit → activate). Lifecycle actions live on
// /rights/<account>. Setup for the terminal-action tests seeds the right on chain with the real tx
// builders, then every asserted action runs through the app.
//
// LOST COVERAGE (scenarios from the six deleted separate-Rights specs not reproduced here, and why):
// - Secondary market for a right (list the Actions token for a premium, offers on a right, atomic
//   buy-and-exercise): no UI path. acquireAndExecute is a TODO in RightDetailView (needs an indexer
//   lookup for the resale listing), so there is nothing to drive. The Actions-token resale itself is
//   exercised by the ordinary sale/buy specs. [rights "sold, resold", right-offer.*]
// - Canonical rights-collection offers refused via manual routes: gone by design — there is no
//   separate canonical Rights ERC721 in the unified model, so the scenario cannot exist. [rights]
// - Atomic-wallet issuance and "a rejected activation never falls back to staged sends", plus
//   interrupted/resumable staged issuance (reload resumes pending, cancel+recover): these exercise
//   the generic tx-flow engine and the shared escrow flow, not covered-specific logic. Dropped to
//   avoid duplicating Flow/escrow mechanics. [rights, right-reliability]
// - "manual original config recovers burned collateral … and rejects wrong bytes": RightDetailView's
//   recover uses the default release input ("0x"); there is no UI surface for supplying original
//   config bytes, so the discovery-outage manual-recovery path is not UI-testable. [right-reliability]
// - Payment-credit withdraw to an alternate recipient, and "manual release never redirects your
//   default withdrawal when the indexer is unavailable": only release-to-beneficiary is asserted;
//   withdrawCredit shares the same flow builder. [z-right-payments]
// - "exercise confirmation rechecks a direct transfer made after the form opened": the pre-sign
//   re-authentication exists in flows (readOrder) but injecting a competing transfer mid-UI is too
//   heavy for e2e. [right-termination]
// - Zero-exercise-price issue+exercise, and rights-view viewport fit: minor; the exercise test uses
//   a nonzero price, and create/manage specs already assert no horizontal overflow at mobile width.
import { test, expect } from "@playwright/test";
import { readOrder, OrderState } from "@market/protocol";
import { injectWallet } from "./wallet";
import { ACC, D, pub, collections, mint, ownerOf, waitFor, connect, eth, issueCovered, warpPast, blockTime } from "./helpers";

const lower = (a?: string) => (a ?? "").toLowerCase();
const info = (account: `0x${string}`) => readOrder(pub, D, account);

test("issue a covered right, exercise it to a chosen recipient, and release the proceeds", async ({ page }) => {
  const c = await collections();
  const id = await mint(c.meridian, ACC.me);
  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(ACC.me));

  await injectWallet(page);
  await page.goto("/rights/issue");
  await connect(page);

  // Issue through the form: create (Pending) → deposit the NFT → activate. Default deadline (now +
  // 7d) and default max royalty (10%) exceed Meridian's 2.5%, so exercise is never blocked.
  await page.getByLabel("nft collection address").fill(c.meridian);
  await page.getByLabel("nft token id").fill(id.toString());
  await page.getByLabel("Exercise price in eth").fill("0.5");
  await page.getByRole("button", { name: "Issue and activate right" }).click();

  // On activation the view navigates to the right's own page.
  await page.waitForURL(/\/rights\/0x[0-9a-fA-F]{40}/, { timeout: 60_000 });
  const account = new URL(page.url()).pathname.split("/rights/")[1] as `0x${string}`;
  await waitFor(() => info(account).then((i) => i.state), (s) => s === OrderState.Live);

  // Exercise: pay the fixed price, deliver the NFT to account 2 (an explicit recipient, not holder).
  await page.getByLabel("NFT recipient", { exact: true }).fill(ACC.other);
  await page.getByRole("button", { name: /^Exercise for [\d.]+ ETH$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Exercise for [\d.]+ ETH$/ }).click();

  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(ACC.other));
  expect(lower(await ownerOf(c.meridian, id))).toBe(lower(ACC.other));

  // Exercise proceeds are held as a reserved credit for the issuer (the proceeds recipient).
  const credited = await waitFor(() => info(account).then((i) => i.totalCredits), (v) => v > 0n);
  expect(credited).toBeGreaterThan(0n);

  // Release the credit to its beneficiary; the reserved credit clears on chain.
  await page.getByLabel("Beneficiary", { exact: true }).fill(ACC.me);
  await page.getByRole("button", { name: "Release to beneficiary" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Release payment" }).click();

  await waitFor(() => info(account).then((i) => i.totalCredits), (v) => v === 0n);
  expect(await info(account).then((i) => i.totalCredits)).toBe(0n);
});

test("surrender a held right, then the issuer recovers the NFT", async ({ page }) => {
  const c = await collections();
  const id = await mint(c.meridian, ACC.me);
  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(ACC.me));
  const account = await issueCovered(ACC.me, c.meridian, id, eth("0.5"));
  await waitFor(() => info(account).then((i) => i.state), (s) => s === OrderState.Live);

  await injectWallet(page);
  await page.goto(`/rights/${account}`);
  await connect(page);

  await page.getByLabel(/I give up this right/).check();
  await page.getByRole("button", { name: "Surrender the right" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Surrender the right" }).click();
  await waitFor(() => info(account).then((i) => i.state), (s) => s === OrderState.Surrendered);

  // The residual beneficiary (issuer) recovers the escrowed NFT.
  await page.getByRole("button", { name: "Recover the NFT" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Recover the NFT" }).click();
  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(ACC.me));
  expect(lower(await ownerOf(c.meridian, id))).toBe(lower(ACC.me));
});

test("finalize an expired right, then the issuer recovers the NFT", async ({ page }) => {
  const c = await collections();
  const id = await mint(c.meridian, ACC.me);
  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(ACC.me));
  const t = await blockTime();
  const account = await issueCovered(ACC.me, c.meridian, id, eth("0.5"), { deadline: t + 300n });
  await warpPast(t + 300n); // real chain clock past the deadline (serial e2e owns the clock)

  await injectWallet(page);
  await page.goto(`/rights/${account}`);
  await connect(page);

  // Anyone may finalize a passed deadline; it moves the live right to Expired.
  await page.getByRole("button", { name: "Finalize expiry" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Finalize expiry" }).click();
  await waitFor(() => info(account).then((i) => i.state), (s) => s === OrderState.Expired);

  await page.getByRole("button", { name: "Recover the NFT" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Recover the NFT" }).click();
  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(ACC.me));
  expect(lower(await ownerOf(c.meridian, id))).toBe(lower(ACC.me));
});
