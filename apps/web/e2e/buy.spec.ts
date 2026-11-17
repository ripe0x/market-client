import { test, expect } from "@playwright/test";
import { injectWallet } from "./wallet";
import { ACC, collections, mint, listFixed, listSchedule, getToken, ownerOf, waitFor, connect, eth } from "./helpers";

const lower = (a: string) => a.toLowerCase();

test.describe("buy", () => {
  test("fixed price", async ({ page }) => {
    const c = await collections();
    const id = await mint(c.driftlines, ACC.other);
    await listFixed(ACC.other, c.driftlines, id, eth("1"));
    await waitFor(() => getToken(c.driftlines, id), (t) => t.listing?.status === "live");

    await injectWallet(page);
    await page.goto(`/c/${c.driftlines}/${id}`);
    await connect(page);
    await page.getByRole("button", { name: /^Buy for/ }).click();

    await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(ACC.me));
    expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(ACC.me));
  });

  test("falling price", async ({ page }) => {
    const c = await collections();
    const id = await mint(c.driftlines, ACC.other);
    await listSchedule(ACC.other, c.driftlines, id, eth("2"), eth("1"), 3600n);
    await waitFor(() => getToken(c.driftlines, id), (t) => t.listing?.status === "live");

    await injectWallet(page);
    await page.goto(`/c/${c.driftlines}/${id}`);
    await connect(page);
    await page.getByRole("button", { name: /^Buy for/ }).click();

    await waitFor(() => ownerOf(c.driftlines, id), (o) => lower(o) === lower(ACC.me));
    expect(lower(await ownerOf(c.driftlines, id))).toBe(lower(ACC.me));
  });
});
