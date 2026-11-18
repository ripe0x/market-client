# Indexer releases and rights

`PONDER_CHAIN_ID` and `PONDER_RELEASE_ID` select one protocol deployment manifest. The current
Sepolia default remains `legacy-v1`. Local development defaults to `rights-v1`. A public rights
candidate is rejected until its manifest records a verified deployment. It must use its own
`DATABASE_SCHEMA`; never point the rights release at the legacy database schema.

All API responses include `x-market-deployment`, exposed through CORS. `/api/status` also
returns `deploymentId` and `releaseId`. Clients must compare the identity with their selected
deployment before using indexed records. Chain ID alone doesn't distinguish two releases.

For a local rehearsal, supply the RPC URL printed by the local chain process:

```sh
PONDER_CHAIN_ID=31337 PONDER_RELEASE_ID=rights-v1 \
PONDER_RPC_URL=http://127.0.0.1:8645 \
PGLITE_DIR=/private/tmp/market-rights-local \
DATABASE_SCHEMA=market_rights_local \
pnpm --filter @market/indexer start --port 42069
```

`start` compiles the source once and runs production indexing without hot reloading. Prefer it
for a stable transaction rehearsal. `dev` is useful while editing, but dependency edits rebuild
the index and can interrupt requests. Tests use isolated temporary databases, random local ports
and `start`, so they don't touch an existing preview or public infrastructure.

## Indexed authority and accounting

Rights enter the index only through the selected Market's `RightCreated` event. Discovery checks
the factory association, account immutables, canonical token mapping and committed config hash.
Only the selected, code-committed `CoveredNFTPurchase` handler gets a supported terms view. Other
handlers and malformed configurations remain inspectable with an explanation. No handler call
or third party nft service is needed to discover a newly issued right.

Canonical `Rights.Transfer` events track minting, direct transfers, sale escrow and burning.
The account record survives burning. Issuer, current token holder, listing seller, residual
beneficiary and each payment beneficiary remain separate. Premium fills reference the trading
order; exercise value and fixed activation royalty terms are recorded independently. Credits are
summed per account and beneficiary, including when proceeds and royalty share a recipient.

Deposits and terminal recovery have no account event. Bounded Multicall3 polling reads actual
backing ownership and eth balances. The normal lane covers pending/active accounts and known
remaining assets; a slow lane revisits terminal accounts for later accidental deposits. Credits
come from account events, not balance inference. All state uses Ponder's reorg-aware tables.

## API

- `GET /api/rights` returns independently discovered accounts with decimal string IDs and wei.
- `GET /api/rights/:account` retains terms, history, payment credits and recovery context after burn.
- `GET /api/rights/:account/activity` paginates creation, transfers, premiums, exercise and credits.
- `GET /api/accounts/:wallet/positions` adds `rights` for issuance, holdings, listings, residual
  recovery and outstanding beneficiary credits.

Effective expiry is derived at the indexed chain timestamp, including before finalization. An
expired token in escrow isn't advertised as live or withdrawable. `escrowOrder` and `listingSeller`
identify the independent offer even after it closes; finalization burns the token and leaves the
issuer's underlying recovery and payment credits inspectable. Quotes and indexed eligibility
are advisory: supported write actions authenticate live chain state before signing.

Run the actual local Anvil/Ponder integration coverage with:

```sh
pnpm --filter @market/indexer exec vitest run test/indexer.test.ts
```
