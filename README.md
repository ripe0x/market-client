# Market client

Web app and indexer for trading ERC721s on the [Market protocol](https://github.com/ripe0x/market). Plan: [PLAN.md](PLAN.md) · decisions: [DECISIONS.md](DECISIONS.md) · status: [STATUS.md](STATUS.md) · design: `handoff/`.

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
cd apps/indexer && PONDER_CHAIN_ID=31337 npx ponder dev --port 42169
```

```bash
cd apps/web && cp .env.example .env.local && pnpm dev
```

The app runs on http://localhost:3100. The seeded wallet is Anvil account 1.

## Seed a deployment with listings

`contracts/test-collections/script/SeedListings.s.sol` deploys a test collection and creates four listings (fixed, falling, rising, expiring) and one collection offer through the real Market. About 3.0M gas plus 0.002 ETH held by the offer; everything stays yours to cancel from Positions.

```bash
cd contracts/test-collections && forge script script/SeedListings.s.sol --rpc-url https://sepolia.gateway.tenderly.co --sender <your address>
```

```bash
cd contracts/test-collections && forge script script/SeedListings.s.sol --rpc-url https://sepolia.gateway.tenderly.co --account ripe0x --sender <your address> --broadcast --slow
```
