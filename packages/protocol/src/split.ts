/** Fee: `price * bps / 10000`, rounded down (`NFTTrade._split`). */
export const feeOf = (price: bigint, feeBps: bigint) => (price * feeBps) / 10_000n;

/** Royalty as paid: capped at what the fee leaves (D308). */
export const cappedRoyalty = (price: bigint, fee: bigint, royalty: bigint) =>
  royalty > price - fee ? price - fee : royalty;

/** Seller's share: `price - fee - royalty`, with the royalty capped as the contract does. */
export function split(price: bigint, feeBps: bigint, royaltyAsked: bigint) {
  const fee = feeOf(price, feeBps);
  const royalty = cappedRoyalty(price, fee, royaltyAsked);
  return { price, fee, royalty, proceeds: price - fee - royalty };
}

/** `NFTSale.quote`'s limit: `price * maxRoyaltyBps / 10000`, rounded down. */
export const royaltyLimit = (price: bigint, maxRoyaltyBps: bigint) => (price * maxRoyaltyBps) / 10_000n;

/** The smallest whole-bps limit that admits `royalty` at `price` (DECISIONS D3: round up). */
export function royaltyBpsCeil(royalty: bigint, price: bigint): bigint {
  if (price === 0n || royalty === 0n) return 0n;
  return (royalty * 10_000n + price - 1n) / price;
}
