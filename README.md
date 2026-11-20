# Market client

Web app and indexer for ordinary NFT trading and transferable execution rights on the [Market protocol](https://github.com/ripe0x/market). Plan: [PLAN.md](PLAN.md) · decisions: [DECISIONS.md](DECISIONS.md) · status: [STATUS.md](STATUS.md) · [deployment runbook](DEPLOYMENT.md) · original design: `handoff/`.

The verified public Sepolia release is **legacy order-only**. A new **unified Order/Action** candidate (`actions-v1`) pins protocol `9f50355`; its Sepolia addresses are calculated (deterministic CREATE2), with no deployment block or public contracts. Public Sepolia still selects `legacy-v1` by default. Each release has separate manifests and indexer identities.

> **Unified actions candidate (branch `claude/unified-actions`).** The protocol package, indexer and web app all target the unified Order/Action model at protocol `9f50355`. It is an undeployed local candidate; see [STATUS.md](STATUS.md) for what was run and what remains unverified. Rights-specific sections below are historical. Signed local rehearsal: `pnpm --filter @market/protocol rehearse:actions`.

```
apps/web            Next.js app (Netlify)
apps/indexer        Ponder indexer + REST API (Fly.io)
packages/protocol   ABIs, addresses, pricing, codecs, call builders, local chain tools
contracts/market    ripe0x/market, pinned read-only submodule
contracts/test-collections   Solidity collections for local chains and tests
```

## Run locally

Requires Node 22, pnpm 9, Foundry.

```bash
git submodule update --init --recursive
```

```bash
pnpm install && pnpm build:contracts
```

```bash
pnpm dev:chain
```

```bash
cd apps/indexer && PONDER_CHAIN_ID=31337 PONDER_RELEASE_ID=actions-v1 npx ponder dev --port 42169
```

```bash
cd apps/web && cp .env.example .env.local && pnpm dev
```

The app runs on http://localhost:3100. The seeded wallet is Anvil account 1. Rights pages are at `/rights` and `/rights/issue`. Buying a right transfers its ERC721 entitlement while the NFT backing stays in its own Right account; the current holder pays the separate fixed exercise price to receive the NFT. Canceling a premium listing returns the right token without ending the underlying right. The right's finite deadline is exclusive, so use a listing deadline that leaves time to exercise.

To repeat the signed local rights lifecycle on a disposable Anvil, run `pnpm --filter @market/protocol rehearse:rights`. It writes `packages/protocol/evidence/rights-local.json` with transaction receipts and readbacks. This is local only; see [STATUS.md](STATUS.md) for its recorded result. For Sepolia preparation and release selection, use [DEPLOYMENT.md](DEPLOYMENT.md).

## Verify the local candidate

The test runners are separate: `CANDIDATE_RUN=1 pnpm test` runs protocol-package, indexer and web unit/integration tests; `pnpm --filter @market/web e2e` runs the browser suite against the three local services. For a stable browser rehearsal, run the indexer with `ponder start` and a fresh local schema, then build and serve the web app. Development hot reload can restart PGlite or reset an in-flight page.

`readRight(client, deployment, account, { config })` authenticates deployment identity, canonical mapping and the supplied creation bytes against the account's immutable hash. Obtain those bytes from the selected indexer's `/api/rights/:account`; the indexer recovered them from the selected Market's creation event. Without them, RPC fallback discovery scans at most eight 2,000-block ranges of that Market. Unknown handlers have no exercise form. After burn, the backing-account URL retains history, credits and recovery. Payment release to the recorded beneficiary and a beneficiary's own-credit withdrawal work without config discovery; the residual beneficiary's collateral recovery is a separate terminal authority.

The interface defaults to finite issuance. A supported premium listing needs more than two hours remaining and expires one hour before exercise does. An expired escrow token can't be returned by closing its sale: close, finalize expiry and issuer recovery are separate actions. Standard ERC721 approvals can transfer the entitlement and carry significant economic authority.

Covered right acquisition checks the listing and entitlement independently. A stale listing remains inspectable for cleanup. Positions closes listings without trying to return expired or burned right tokens; right finalization and issuer collateral recovery are separate actions. During a discovery outage, the backing-account detail view supports advanced recovery from the original encoded covered config, authenticated against its immutable hash. This also works after the token burns. See [DEPLOYMENT.md](DEPLOYMENT.md) for the local rehearsal and public release boundary.
