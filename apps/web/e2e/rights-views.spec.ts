import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import { connect } from "./helpers";

test("rights discovery, issuance and positions fit the viewport", async ({ page }, info) => {
  await injectWallet(page);
  await page.goto("/rights/issue");
  await connect(page);
  await expect(page.getByLabel("nft collection address")).toBeVisible();
  await page.screenshot({ path: `../../docs/screenshots/rights-issue-${info.project.name}.png`, fullPage: true });
  await page.goto("/rights");
  await expect(page.getByRole("heading", { name: "Issued rights", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `../../docs/screenshots/rights-discovery-${info.project.name}.png`, fullPage: true });
  await page.goto("/positions");
  const section = page.getByRole("heading", { name: "Your rights", exact: true }).locator("..");
  await expect(section).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await section.screenshot({ path: `../../docs/screenshots/rights-positions-${info.project.name}.png` });
});
