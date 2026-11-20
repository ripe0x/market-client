// Atomic buy-and-exercise (AcquireAndExecute) driven through the UI. A covered right is issued and
// its Actions token listed for resale on chain (by another account); then the connected wallet, a
// non-holder buyer, opens the right and uses "Buy and exercise" to pay the premium and the exercise
// price in one transaction and receive the NFT at an explicit recipient. The resale listing is
// discovered ON CHAIN (Actions.ownerOf + readOrder), not via the indexer.
import { test, expect } from "@playwright/test";
import { readOrder, OrderState } from "@market/protocol";
import { injectWallet } from "./wallet";
import { ACC, D, pub, collections, mint, ownerOf, waitFor, connect, eth, issueCovered } from "./helpers";
import { listActionsForResale, actionsOwner } from "./actions";

const lower = (a?: string | null) => (a ?? "").toLowerCase();
const RECIPIENT = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"; // anvil account 3 — explicit, != payer

test("buy and exercise a listed right in one transaction, delivering to an explicit recipient", async ({ page }) => {
  const c = await collections();
  // Issuer/seller is account 2; the connected wallet (ME, account 1) is the buyer.
  const id = await mint(c.meridian, ACC.other);
  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(ACC.other));
  const account = await issueCovered(ACC.other, c.meridian, id, eth("0.5"));
  await waitFor(() => readOrder(pub, D, account).then((i) => i.state), (s) => s === OrderState.Live);

  // List its Actions token for resale (premium 0.2), held by a separate sale order.
  await listActionsForResale(ACC.other, account, eth("0.2"));

  await injectWallet(page); // connects as ME (account 1), the non-holder buyer
  await page.goto(`/rights/${account}`);
  await connect(page);

  // The acquire section shows premium, trading fee, execution price, royalty credit, recipients
  // and the max total separately.
  await expect(page.getByRole("heading", { name: "Buy and exercise" })).toBeVisible({ timeout: 20_000 });
  for (const key of ["Resale premium", "Trading fee", "Exercise price", "Exercise royalty credit", "Premium recipient"]) {
    await expect(page.getByText(key, { exact: true }).first()).toBeVisible();
  }

  await page.getByLabel("NFT recipient", { exact: true }).fill(RECIPIENT);
  await page.getByRole("button", { name: "Buy and exercise", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Buy and exercise for up to/ }).click();

  // The NFT is delivered to the explicit recipient; the covered order completes; the token burns.
  await waitFor(() => ownerOf(c.meridian, id), (o) => lower(o) === lower(RECIPIENT));
  expect(lower(await ownerOf(c.meridian, id))).toBe(lower(RECIPIENT));
  expect(await readOrder(pub, D, account).then((i) => i.state)).toBe(OrderState.Completed);
  expect(await actionsOwner(BigInt(account))).toBeNull(); // Actions token burned
});
