import { afterAll, beforeAll, expect, test } from "vitest";
import { nftSaleAbi } from "../src/abis";
import { priceAt, priceRange, type Schedule } from "../src/schedule";
import { startChain, type Chain } from "../devchain";

let c: Chain;
beforeAll(async () => {
  c = await startChain({ collections: false });
});
afterAll(() => c?.stop());

// Deterministic PRNG so failures reproduce.
let seed = 0x9e3779b9;
const rnd = (n: bigint): bigint => {
  let r = 0n;
  for (let i = 0; i < 4; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    r = (r << 32n) | BigInt(seed);
  }
  return n === 0n ? 0n : r % n;
};

function cases(n: number): [Schedule, bigint][] {
  const out: [Schedule, bigint][] = [];
  const E = 10n ** 18n;
  for (let i = 0; i < n; i++) {
    const scale = [1n, 1000n, E, 10n ** 30n][i % 4]!;
    const startTime = rnd(2_000_000_000n);
    const span = i % 7 === 0 ? 0n : rnd(10n ** 7n) + 1n;
    const s: Schedule = {
      startPrice: rnd(scale * 100n),
      endPrice: i % 5 === 0 ? 0n : rnd(scale * 100n),
      startTime,
      endTime: startTime + span,
      expiry: 0n,
    };
    // Boundary times plus random ones around the window.
    const pick = [s.startTime, s.endTime, s.startTime + 1n, s.endTime - 1n, s.startTime + rnd(span + 2n)][i % 5]!;
    out.push([s, pick < 0n ? 0n : pick]);
  }
  return out;
}

test("priceAt matches NFTSale.priceAt for 2,000 schedules", async () => {
  const all = cases(2000);
  const onchain = await c.pub.multicall({
    contracts: all.map(([s, t]) => ({
      address: c.deployment.nftSale,
      abi: nftSaleAbi,
      functionName: "priceAt",
      args: [s, t],
    })),
    allowFailure: false,
    batchSize: 0,
  });
  all.forEach(([s, t], i) => expect(priceAt(s, t), JSON.stringify({ i, s: String(s.startPrice), t: String(t) })).toBe(onchain[i]));
});

test("rounding direction: falling rounds up, rising rounds down", () => {
  const falling = { startPrice: 10n, endPrice: 0n, startTime: 0n, endTime: 3n, expiry: 0n };
  expect(priceAt(falling, 1n)).toBe(7n); // exact 6.67, up
  const rising = { startPrice: 0n, endPrice: 10n, startTime: 0n, endTime: 3n, expiry: 0n };
  expect(priceAt(rising, 1n)).toBe(3n); // exact 3.33, down
  const step = { startPrice: 5n, endPrice: 9n, startTime: 100n, endTime: 100n, expiry: 0n };
  expect(priceAt(step, 99n)).toBe(5n);
  expect(priceAt(step, 100n)).toBe(9n);
});

test("priceRange brackets the window", () => {
  const s = { startPrice: 100n, endPrice: 200n, startTime: 0n, endTime: 100n, expiry: 0n };
  expect(priceRange(s, 10n, 50n)).toEqual({ min: 110n, max: 150n });
  expect(priceRange(s, 90n, 500n)).toEqual({ min: 190n, max: 200n });
});
