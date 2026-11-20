// Money split for a trade, mirroring ExchangeAction/CoveredNFTPurchase. `fee` is `price*bps/1e4`
// floored; `royalty` is the collection's ERC2981 answer capped at `price - fee` so a large
// royalty cannot block trading; `proceeds = price - fee - royalty`.

const bps = (x: bigint | number) => BigInt(x);

/** Fee: `price * bps / 10000`, rounded down. */
export const feeOf = (price: bigint, feeBps: bigint | number) => (price * bps(feeBps)) / 10_000n;

/** Royalty as actually paid: capped at what the fee leaves (ExchangeAction `_quote`). */
export const cappedRoyalty = (price: bigint, fee: bigint, royalty: bigint) =>
  royalty > price - fee ? price - fee : royalty;

/** Full split with the royalty capped exactly as the contract does. */
export function split(price: bigint, feeBps: bigint | number, royaltyAsked: bigint) {
  const fee = feeOf(price, feeBps);
  const royalty = cappedRoyalty(price, fee, royaltyAsked);
  return { price, fee, royalty, proceeds: price - fee - royalty };
}

/** A sale/covered limit: `price * maxRoyaltyBps / 10000`, rounded down. */
export const royaltyLimit = (price: bigint, maxRoyaltyBps: bigint | number) => (price * bps(maxRoyaltyBps)) / 10_000n;

/**
 * Whether a sale would pass its `maxRoyaltyBps` guard. ExchangeAction checks the limit against
 * the CAPPED royalty (`q.royalty`, already min'd to `price - fee`), not the raw ERC2981 amount,
 * so the capped value is what must be within the limit.
 */
export function saleRoyaltyWithinLimit(price: bigint, feeBps: bigint | number, royaltyAsked: bigint, maxRoyaltyBps: bigint | number) {
  const fee = feeOf(price, feeBps);
  return cappedRoyalty(price, fee, royaltyAsked) <= royaltyLimit(price, maxRoyaltyBps);
}

/** The smallest whole-bps limit that admits `royalty` at `price` (DECISIONS D3: round up). */
export function royaltyBpsCeil(royalty: bigint, price: bigint): bigint {
  if (price === 0n || royalty === 0n) return 0n;
  return (royalty * 10_000n + price - 1n) / price;
}
