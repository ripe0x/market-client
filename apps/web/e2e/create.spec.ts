import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import { ACC, collections, mint, positionsOf, ownerOf, waitFor, connect } from "./helpers";

const lower = (a: string) => a.toLowerCase();

test("create a listing in two steps, then it is live", async ({ page }, info) => {
  const c = await collections();
  const id = await mint(c.driftlines, ACC.me);

  await injectWallet(page);
  await page.goto("/sell");
  await connect(page);

  // Select the freshly minted token card and set a fixed price.
  await page.locator("button", { hasText: `#${id}` }).first().click();
  await page.getByLabel("Price in ETH").first().fill("1.5");
  const list = page.getByRole("button", { name: `List #${id}`, exact: true });
  await list.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await list.evaluate(el => {
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
  await page.screenshot({ path: `test-results/ordinary-listing-with-rights-${info.project.name}.png`, fullPage: true });
  await list.click();

  // The listing becomes live for this account and the token is escrowed in its order.
  const pos = await waitFor(
    () => positionsOf(ACC.me),
    (p) => p.listings.some((l) => l.tokenId === id.toString() && lower(l.nft) === lower(c.driftlines) && (l.status === "live" || l.status === "awaiting_nft")),
  );
  const listing = pos.listings.find((l) => l.tokenId === id.toString() && lower(l.nft) === lower(c.driftlines))!;
  await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(listing.address));
  expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(listing.address));
});
