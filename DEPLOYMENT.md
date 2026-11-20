# Release identities and Sepolia runbook

**Current public release:** `legacy-v1`, the verified order-only Sepolia contracts from 2026-11-16, Market block 12,150,229. Its addresses, hashes and relationships are frozen in `deployments/legacy-sepolia.json`. Its indexer uses schema `market_v1` and must remain accessible while a rights release is prepared.

**Rights candidate:** `rights-v1` pins protocol `484223e`. `deployments/rights-sepolia.json` contains deterministic CREATE2 address and hash predictions but has `status: "candidate"` and `startBlock: null`. No right-enabled contract is deployed on public Sepolia. `deployments/rights-local.json` is the actual isolated Anvil deployment record. Never copy its `deployed` status to the public manifest without public receipts and readbacks.

**Unified Actions candidate:** `actions-v1` pins protocol `152bf41` (unified Order/Action model). `deployments/actions-sepolia.json` is `status: "candidate"`, `startBlock: null`, with deterministic CREATE2 addresses that are **not** deployed on public Sepolia. `deployments/actions-local.json` is the local Anvil record. Regenerate both reproducibly from the pinned submodule with `pnpm build:contracts && pnpm --filter @market/protocol gen`. The local signed rehearsal is `pnpm --filter @market/protocol rehearse:actions` (evidence `packages/protocol/evidence/actions-local.json`). The indexer and web app for this release are not yet migrated; see STATUS.md.

## Reproduce the local lifecycle

From this repository root, with Node 22, pnpm 9 and Foundry installed:

```bash
git submodule update --init --recursive
pnpm install
pnpm build:contracts
pnpm --filter @market/protocol rehearse:rights
```

The rehearsal starts and stops its own Anvil at chain 31337. `packages/protocol/evidence/rights-local.json` records 47 signed transactions, including a deliberate reverted AtomicWallet issuance; it also records backing, token ownership, premium proceeds, payment credits and terminal recovery. The successful path issues a backed right, sells it for 0.2 ETH, resells for 0.3 ETH, then exercises for a separate 1 ETH. At the test's 1% trading fee and 5% committed royalty, the sellers receive 0.198 and 0.297 ETH, the trading recipient 0.005 ETH total, and exercise credits 0.95 ETH proceeds plus 0.05 ETH royalty. Other rights test listing cancellation, surrender, expiry, pending cancellation and atomic setup rollback. Gas costs come from the nonzero-priced local receipts, not a public gas quote.

For both reference operations in one Foundry simulation, including the durable artwork reservation after artwork transfer:

```bash
cd contracts/market
forge script script/RightsLifecycle.s.sol:RightsLifecycle --sig 'run()'
```

That Foundry script is a simulation, separate from the signed Anvil receipt file above.

To inspect the app against a persistent local chain, run `pnpm dev:chain`, the indexer with `apps/indexer/.env.example` and `PONDER_RELEASE_ID=rights-v1`, then the web app with `apps/web/.env.example`. The local indexer uses `market_rights_local`; `/api/status` should identify `31337:rights-v1:<market>`. The browser's rights pages require the real local deployment and use onchain readbacks for actions. A right-token premium sale transfers the entitlement only; backing stays in the Right account. A listing cancellation returns the token without ending the right.

For browser verification, use separate terminals for the chain, indexer and web app. Start with a fresh local chain and schema after any long block-mining test. With the chain from `pnpm dev:chain` still running, use the fixed indexer command below in its own terminal:

```bash
cd apps/indexer
PONDER_CHAIN_ID=31337 PONDER_RELEASE_ID=rights-v1 PONDER_RPC_URL=http://127.0.0.1:8645 \
  DATABASE_SCHEMA=market_rights_local pnpm exec ponder start --port 42169
```

Build the web app after setting `apps/web/.env.local` from its example, then run `pnpm --filter @market/web build` and `pnpm --filter @market/web start` in another terminal. With those services on their example ports, run `CANDIDATE_RUN=1 pnpm --filter @market/web e2e`. The candidate run recorded in [STATUS.md](STATUS.md) used explicit `E2E_RPC_URL`, `E2E_INDEXER_URL` and `E2E_BASE_URL` overrides and a fixed production build; `pnpm test` is the separate unit/integration runner.

## Prepare a separate Sepolia candidate

1. Freeze the source and client revision, check the submodule commit, and run `pnpm --filter @market/protocol gen`. This starts a private Anvil to derive `rights-local.json` and the **candidate** `rights-sepolia.json`; it does not write the legacy manifest. Inspect addresses, hashes, constructor relationships, the protocol commit and the diff. Any source or compiler change can move the predicted addresses. See the protocol [deployment reference](contracts/market/docs/DEPLOYMENT.md#rights-candidate-sepolia-preparation-and-release-gate) for the same signer and script path.
2. Rehearse `script/Deploy.s.sol:Deploy` on a disposable Sepolia fork and perform a Sepolia dry run with the existing `ripe0x` keystore and `https://sepolia.gateway.tenderly.co`, **without** `--broadcast`. Confirm the chain, signer, native value, decoded actions, gas funding and all predicted addresses. Compare `Market.implementation`, `Market.rightImplementation`, `Market.rights`, `Rights.market`, implementation bindings, `CoveredNFTPurchase.market`, `FeeConfig.market` and trading-handler dependencies to the manifest. Check runtime code hashes. Do not infer deployment from deterministic addresses.
3. **Stop for explicit owner authorization immediately before each public broadcast.** Provide the target, chain, signer, decoded calls, ETH value, gas limit and consequence. The current task grants no public transaction authority. After any authorized receipt, read actual code hashes and relationships, capture transaction hashes and the Market deployment block, and reconcile partial runs before resuming. Only then change the rights Sepolia manifest to `status: "deployed"` and set its actual `startBlock`.
4. Bring up a **separate** rights Ponder instance with `PONDER_CHAIN_ID=11155111`, `PONDER_RELEASE_ID=rights-v1`, `PONDER_RPC_URL=https://sepolia.gateway.tenderly.co`, a distinct `DATABASE_SCHEMA=market_rights_v1`, and its own `DATABASE_URL`. The indexer refuses a public candidate and refuses rights in the legacy schema. Wait for `/api/status` to show `ready: true`, the correct `deploymentId` and `releaseId`, chain 11155111 and a caught-up head. Compare indexed right account, ERC721 transfer, state and credit data with chain reads. Keep the legacy Fly indexer and `market_v1` schema running.
5. Build a **separate** web deployment with `NEXT_PUBLIC_CHAIN_ID=11155111`, `NEXT_PUBLIC_MARKET_RELEASE=rights-v1`, `NEXT_PUBLIC_RPC_URL=https://sepolia.gateway.tenderly.co` and `NEXT_PUBLIC_INDEXER_URL` pointing at the isolated rights indexer. `NEXT_PUBLIC_*` values are compiled into the build. The existing public deployment keeps `legacy-v1`; verify its URL and positions before any cutover. The app checks the configured runtime code hashes and disables writes on a missing or mismatched deployment. Match the indexer's `deploymentId` to the selected web manifest.
6. With explicit owner authority for each public action, run a signed user walkthrough: issue and activate backed NFT right, list, buy, resell, exercise at exact price, release credits; independently cancel a listing, expire a right and recover the permitted NFT. Check receipts and absolute balances, token owner, backing owner, deadline and residual destination at each step. Record browser and wallet type, RPC head and gas conditions. This remains a release gate, not a result of the local rehearsal.

The rights handler is permissionless and external targets remain part of its trust model. Canonical `Rights.tokenURI` gives account identity, handler/code commitment, config hash, activation terms, deadline and liveness without calling external metadata; the handler-specific economics still require the `RightCreated` config and account terms. The underlying NFT royalty applies at covered-right exercise according to activation terms, not to every premium resale. A right sold near expiry can become unexercisable at the exact deadline even before finalization, so listing windows must leave a deliberate exercise interval.

## Focused reliability follow-up, 2026-11-18

Regenerate after the final protocol source and production comments are committed: `pnpm build:contracts && pnpm gen`. Review the submodule pin and both rights manifests together. The manifest protocolCommit identifies the exact compiled source, independently of later documentation commits. Legacy Sepolia records stay unchanged. Candidate addresses have no public start block and remain undeployed.

Repeat the signed local walkthrough with `pnpm --filter @market/protocol rehearse:rights`. The added paths distinguish listing expiry with a live transferable token from right expiry in escrow, close the latter without withdrawal, finalize it and recover collateral using authenticated original config after burn. The browser outage tests separately make indexer/log discovery unavailable while forwarding ordinary contract reads to the real node; no successful RPC answer is fabricated.

Manual recovery: open the backing account detail page, expand advanced recovery, paste the original encoded covered purchase config from the creation record, and verify the decoded asset and destination. Incorrect bytes, an active account, missing collateral or the wrong residual wallet disable recovery. Payout controls remain independent. A canceled pending account can have a residual different from its issuer; recovery follows that immutable residual, even though it could never activate.
