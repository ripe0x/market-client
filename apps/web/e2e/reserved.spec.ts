// Reserved actions via the local Artwork example, driven through /reserved. Issue a reserved
// palette change (create → reserve on the deployed order → activate, fresh salt, staged), execute a
// chosen option for the exact price, and assert the on-chain palette changed. Then the same for the
// renderer on the same token (independent scope). No mocks: real Artwork, real orders.
import { test, expect } from "@playwright/test";
import { readOrder, OrderState } from "@market/protocol";
import { injectWallet } from "./wallet";
import { ACC, D, pub, waitFor, connect } from "./helpers";
import { mintArtwork, artColor, artRenderer } from "./actions";

const ART_ID = 100n;

async function issueAndExecute(page: import("@playwright/test").Page, kindLabel: "Palette" | "Renderer", choice: number) {
  await page.goto("/reserved");
  await connect(page);
  await page.getByLabel("Artwork token id").fill(ART_ID.toString());
  await page.getByLabel("Change kind").selectOption({ label: kindLabel });
  await page.getByLabel("Price in ETH").fill("0.1");
  await page.getByLabel("Forwarded to the artist").fill("0.05");
  await page.getByLabel("Deadline in hours").fill("24");

  const issue = page.getByRole("button", { name: "Reserve and activate" });
  await expect(issue).toBeEnabled({ timeout: 20_000 }); // plan resolved (reads operation + predicts address)
  await issue.click();

  // Staged create → reserve → activate (three prompts), then navigate to the new reserved order.
  await page.waitForURL(/\/reserved\/0x[0-9a-fA-F]{40}/, { timeout: 90_000 });
  const order = new URL(page.url()).pathname.split("/reserved/")[1] as `0x${string}`;
  await waitFor(() => readOrder(pub, D, order).then((i) => i.state), (s) => s === OrderState.Live);

  await page.getByLabel("Choice", { exact: true }).selectOption(String(choice));
  await page.getByRole("button", { name: "Execute", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Execute for [\d.]+ ETH$/ }).click();
  await waitFor(() => readOrder(pub, D, order).then((i) => i.state), (s) => s === OrderState.Completed);
  return order;
}

test("reserve and execute a palette change, then a renderer change", async ({ page }) => {
  await mintArtwork(ACC.me, ART_ID);
  await waitFor(() => artColor(ART_ID).catch(() => null), (v) => v !== null);

  await injectWallet(page); // ME owns the Artwork token

  await issueAndExecute(page, "Palette", 2);
  expect(await artColor(ART_ID)).toBe(2);

  await issueAndExecute(page, "Renderer", 1);
  expect(await artRenderer(ART_ID)).toBe(1);

  // Mobile/desktop: no horizontal overflow on the reserved screens.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
