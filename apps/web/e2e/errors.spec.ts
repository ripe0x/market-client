import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import { ACC, collections, mint, listFixed, getToken, waitFor, eth } from "./helpers";

test("a royalty-blocked listing shows its copy and no Buy", async ({ page }) => {
  const c = await collections();
  const id = await mint(c.driftlines, ACC.other);
  // Driftlines asks 5%; a 0% royalty limit makes every sale revert (RoyaltyAboveLimit). The client
  // determines this independently from the on-chain royalty (not the indexer's status), so the Buy
  // is withheld even though the order itself is live.
  await listFixed(ACC.other, c.driftlines, id, eth("1"), 0);
  await waitFor(() => getToken(c.driftlines, id), (t) => !!t.listing);

  await injectWallet(page);
  await page.goto(`/c/${c.driftlines}/${id}`);

  await expect(page.getByText("Sale stopped: the collection's royalty is above the seller's limit.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Buy for/ })).toHaveCount(0);
});
