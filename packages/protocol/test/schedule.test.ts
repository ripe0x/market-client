import { describe, expect, it } from "vitest";
import { priceAt, priceRange, progress, isRising, isFalling, fixedSchedule, type Schedule } from "../src/schedule";

const ETH = 10n ** 18n;
const falling: Schedule = { startPrice: 2n * ETH, endPrice: ETH, startTime: 1000n, endTime: 2000n };
const rising: Schedule = { startPrice: ETH, endPrice: 2n * ETH, startTime: 1000n, endTime: 2000n };

describe("priceAt mirrors ExchangeAction", () => {
  it("clamps before start and after end", () => {
    expect(priceAt(falling, 500n)).toBe(2n * ETH);
    expect(priceAt(falling, 3000n)).toBe(ETH);
  });
  it("falling rounds up toward startPrice (never below the line)", () => {
    // midpoint: 1.5 ETH exactly; at 1/3: start - floor(1*ETH/3) = 2 - 0.333.. rounded so result >= line
    expect(priceAt(falling, 1500n)).toBe(3n * ETH / 2n);
    const third = priceAt(falling, 1000n + 333n);
    expect(third).toBeGreaterThanOrEqual(2n * ETH - (ETH * 333n) / 1000n);
  });
  it("rising rounds down toward startPrice", () => {
    expect(priceAt(rising, 1500n)).toBe(3n * ETH / 2n);
  });
  it("priceRange returns monotone extremes", () => {
    const r = priceRange(falling, 1200n, 1800n);
    expect(r.min).toBe(priceAt(falling, 1800n));
    expect(r.max).toBe(priceAt(falling, 1200n));
  });
  it("progress goes 0..1", () => {
    expect(progress(falling, 1000n)).toBe(0);
    expect(progress(falling, 2000n)).toBe(1);
    expect(progress(falling, 1500n)).toBeCloseTo(0.5);
  });
  it("fixedSchedule has no movement and no start gate", () => {
    const f = fixedSchedule(ETH);
    expect(isRising(f)).toBe(false);
    expect(isFalling(f)).toBe(false);
    expect(priceAt(f, 0n)).toBe(ETH);
  });
});
