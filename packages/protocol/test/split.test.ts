import { describe, expect, it } from "vitest";
import { feeOf, cappedRoyalty, split, royaltyLimit, saleRoyaltyWithinLimit, royaltyBpsCeil } from "../src/split";

const ETH = 10n ** 18n;
describe("split", () => {
  it("fee rounds down", () => expect(feeOf(ETH, 100n)).toBe(ETH / 100n));
  it("caps royalty at price - fee", () => {
    const fee = feeOf(ETH, 100n); // 0.01
    expect(cappedRoyalty(ETH, fee, 2n * ETH)).toBe(ETH - fee);
    expect(cappedRoyalty(ETH, fee, ETH / 20n)).toBe(ETH / 20n);
  });
  it("proceeds = price - fee - royalty", () => {
    const s = split(ETH, 100n, ETH / 20n); // 5% royalty
    expect(s.fee).toBe(ETH / 100n);
    expect(s.royalty).toBe(ETH / 20n);
    expect(s.proceeds).toBe(ETH - ETH / 100n - ETH / 20n);
  });
  it("sale limit is checked against the CAPPED royalty", () => {
    // Asked royalty 100% but capped at price-fee; a generous limit admits the capped value.
    expect(saleRoyaltyWithinLimit(ETH, 100n, 10n * ETH, 10_000)).toBe(true);
    // A 4% limit rejects a real 5% royalty.
    expect(saleRoyaltyWithinLimit(ETH, 100n, ETH / 20n, 400)).toBe(false);
  });
  it("royaltyBpsCeil rounds up", () => {
    expect(royaltyBpsCeil(ETH / 20n, ETH)).toBe(500n);
    expect(royaltyBpsCeil(1n, 3n)).toBe(3334n); // 1 wei of a 3-wei price needs ceil(10000/3) bps
  });
  it("royaltyLimit floors", () => expect(royaltyLimit(ETH, 250)).toBe(ETH / 40n));
});
