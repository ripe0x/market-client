import { expect, test } from "vitest";
import { pricingShort, pricingText } from "./orderDisplay";

const order = (startPrice: string, endPrice: string, startTime: number, endTime: number) =>
  ({ schedule: { startPrice, endPrice, startTime, endTime } });
const E = (n: string) => (BigInt(Math.round(Number(n) * 100)) * 10n ** 16n).toString();

test("direction is stated for falling and rising prices, past tense once ended", () => {
  const falling = order(E("2.4"), E("0.8"), 1000, 2000);
  const rising = order(E("1.5"), E("2"), 1000, 2000);
  expect(pricingText(falling, 1500n)).toMatch(/^Falling to 0\.80 · /);
  expect(pricingText(rising, 1500n)).toMatch(/^Rising to 2\.00 · /);
  expect(pricingText(falling, 2500n)).toMatch(/^Fell to 0\.80 · /);
  expect(pricingText(rising, 2500n)).toMatch(/^Rose to 2\.00 · /);
  expect(pricingShort(falling, 1500n)).toMatch(/^↓ 0\.80 · /);
  expect(pricingShort(rising, 1500n)).toMatch(/^↑ 2\.00 · /);
  expect(pricingText(order(E("1"), E("1"), 0, 0), 1500n)).toBeNull();
});
