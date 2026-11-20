import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import { ACC, collections, positionsOf, balance, waitFor, connect, eth } from "./helpers";

const lower = (a?: string) => (a ?? "").toLowerCase();

test("make a collection offer; deposit equals amount × quantity", async ({ page }) => {
  const c = await collections();
  // Offers already owned by ME before this run, so we can detect the new one.
  const before = new Set((await positionsOf(ACC.me)).offers.map((o) => lower(o.address)));

  await injectWallet(page);
  await page.goto(`/c/${c.driftlines}/offer`);
  await connect(page);

  await page.getByLabel("Offer amount in ETH").fill("0.37");
  await page.getByRole("button", { name: "Increase" }).click(); // quantity 1 → 2
  await page.getByRole("button", { name: /^Deposit .* and offer/ }).click();

  const want = eth("0.74"); // 0.37 × 2
  const pos = await waitFor(
    () => positionsOf(ACC.me),
    (p) => p.offers.some((o) => !before.has(lower(o.address)) && lower(o.nft) === lower(c.driftlines) && BigInt(o.balance) === want),
  );
  const created = pos.offers.find((o) => !before.has(lower(o.address)) && lower(o.nft) === lower(c.driftlines) && BigInt(o.balance) === want)!;
  // Verify the deposit on chain, not just via the indexer.
  expect(await balance(created.address)).toBe(want);
});
