# Status

Updated 2026-11-16, branch `plan/v1`. Plan: [PLAN.md](PLAN.md). Decisions: [DECISIONS.md](DECISIONS.md).

## State

Milestones M0–M11 built and verified locally against the pinned protocol. **Sepolia (M12): live.** Market is deployed on Sepolia at block 12,150,229; all five runtime code hashes (Market, Order implementation, FeeConfig, NFTSale, NFTBid) match the pinned build, FeeConfig reads 1%, recipient `0xD4ba…7e72`, admin `0xCB43…17F9` (checked 2026-11-16 through Tenderly's public gateway).

| Where | What |
| --- | --- |
| https://ripe-market-v1.netlify.app | Netlify production, from `main` |
| https://deploy-sepolia--ripe-market-v1.netlify.app | Branch deploy of `deploy/sepolia` (PR #2): live Sepolia data |
| https://market-indexer-sepolia.fly.dev | Indexer (Fly.io `market-indexer-sepolia`, Postgres `market-indexer-sepolia-db`, schema `market_v1`), at the Sepolia head |

## Evidence

| Check | Command | Result |
| --- | --- | --- |
| Price parity | `cd packages/protocol && npx vitest run test/schedule.test.ts` | 3 passed: TS `priceAt` equals `NFTSale.priceAt` on 2,000 schedules incl. boundaries |
| Money flows | `npx vitest run test/flows.test.ts` | 8 passed: 1 ETH, 5% royalty, 1% fee → seller 0.94, royalty 0.05, fee 0.01, order empty; refunds; round trips; approvals |
| Errors | `npx vitest run test/errors.test.ts` | 7 passed: every mapped revert provoked and decoded |
| Indexer | `cd apps/indexer && npx vitest run test/indexer.test.ts` | 6 passed: fakes rejected (rogue clone Sold, spoofed event, unknown handler, garbage config), SQL price parity, time states, positions, reorg |
| SSRF guard | `cd apps/web && npx vitest run server/media.test.ts` | 1 passed |
| E2E | `cd apps/web && npx playwright test e2e/*.spec.ts` (with `pnpm dev:chain`, indexer, `next start`) | 22 passed: 11 flows × desktop 1440 and mobile 390, incl. one-prompt batch accept |
| Independent review | AI review of money, approval, indexer and server code | 2 confirmed bugs (SSRF in metadata fetch; accept broken on batching wallets) and 4 lesser findings, all fixed in `1680d83`; no economic loss or understated amount found |

## Not verified

1. No human audit of the client or the protocol. The protocol itself is unaudited (its STATUS.md).
2. No real wallet extension run (MetaMask/Coinbase). E2E uses a test wallet that forwards to Anvil's unlocked account; its batch mode runs calls one after another, so atomicity is not tested.
3. No mainnet-fork compatibility run through the client (real BAYC/Azuki/Opepen…). The protocol repo's own fork tests cover the contracts.
4. Tenderly's public gateway rate-limits the indexer (HTTP -32005 at 10 req/s); Ponder retries and stays at the head at 5 req/s. Heavier Sepolia traffic may need a lower rate or longer poll interval.
5. Alchemy NFT API path untested (no key); the chain fallback for metadata and holdings is what ran.
6. No Sentry or uptime monitoring configured (no accounts yet).
7. Pushes to GitHub do not trigger Netlify builds yet: Netlify's GitHub app likely lacks access to this repository. Builds so far were started through the Netlify API.
8. `pnpm audit`: 8 high and 13 moderate advisories in transitive dependencies (wallet and tooling packages), not triaged.

## Next action

Merge PR #2 so Netlify production (built from `main`) uses the Sepolia start block; start that build by hand until Netlify's GitHub app can see this repository.
