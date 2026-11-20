# Status

## Unified Actions candidate (actions-v1) — protocol-package foundation, 2026-11-19

Branch `claude/unified-actions`. Protocol submodule re-pinned to the unified Order/Action model at `152bf41532a6f7f57539aa2819511ae7103521e7` (ripe0x/market `claude/unified-actions`). This is an **undeployed local candidate**. The legacy `legacy-v1` and historical `rights-v1` manifests are untouched; the new release has its own id `actions-v1` and manifests `deployments/actions-local.json` (local, deployed) and `deployments/actions-sepolia.json` (Sepolia, candidate, `startBlock: null`, deterministic CREATE2 addresses, not deployed). Public Sepolia still defaults to `legacy-v1`. ABI, codehash and manifest generation are reproducible from the pinned submodule: `pnpm build:contracts && pnpm --filter @market/protocol gen`.

**Done and verified (protocol package `packages/protocol`):**
- `scripts/gen-abis.ts` regenerated for the new contract set (Market, Order, Actions, ExchangeAction, CoveredNFTPurchase, ReservedAction, FeeConfig, AcquireAndExecute, FillVerifier, Artwork target, ERC721 errors).
- Codecs (`src/config.ts`): `OrderSpec`, ExchangeAction `Config`/`SaleTerms`/`BidTerms`, covered and reserved configs, sale/bid/covered/reserved execution inputs. `Schedule` and `Quote` are ABI-derived (drift-proof); the action configs travel as `bytes`, so their struct shapes are hand-written and checked on chain by the rehearsal.
- Pricing/split (`src/split.ts`): royalty capped at `price - fee`; sale `maxRoyaltyBps` checked against the **capped** royalty (ExchangeAction `_quote`, confirmed by the lead).
- Reads (`src/orders.ts`): `readOrder` authenticates provenance against `Market.isOrder`, reads `config()` on chain, and requires `actionCodehash` to equal the hash of the action's deployed code; `verifyDeployment` checks the new wiring; `quoteExchange`, `predictOrderAddress`, `isExpiredAt(deadline, now)` for the deadline boundary.
- Call builders + presets (`src/tx.ts`): create/createAndActivate/activate/execute(sale,bid)/exercise covered/execute reserved/cancel/surrender/finalizeExpiry/release/withdrawSurplus/releaseCredit/withdrawCredit/bid funding/action transfer/acquireAndExecute/artwork reserve, with trust-boundary validation (contradictory token selection, invalid window, empty operation, `minActionTimeLeft` 0 for ordinary bids). Incoming bid approval targets **ExchangeAction**, never the order.
- Error decoding/copy (`src/errors.ts`) for the new custom errors; sale/bid/covered/reserved contexts.
- `src/api.ts` redefines the indexer↔client contract for the unified model (sets the shape the indexer rewrite targets).

**Verification run (local, this candidate):**
- `pnpm --filter @market/protocol typecheck`: pass. Unit suite (`test/codecs|split|schedule|errors`): **32/32**. (No chain, no mocks — pure codec/pricing/error logic.)
- Signed local Anvil rehearsal `pnpm --filter @market/protocol rehearse:actions` at pin `152bf41`: **36 signed transactions across 5 flows and 2 genuine on-chain reverts**, all absolute-amount assertions held. Evidence: `packages/protocol/evidence/actions-local.json`. Measured results: sale fee 0.01 / royalty 0.05 / proceeds 0.94 with 0.2 refunded; bid fee 0.005 / royalty 0.0125 / proceeds 0.4825; covered+acquire premium (fee 0.002, proceeds 0.198) and execution credited (royalty 0.0125, proceeds 0.4875, withdrawn); artwork reserved surplus credit 0.05; recovery 0.5 ETH via cancel+withdrawSurplus and NFT via surrender+release. Reverts: `ERC721InsufficientApproval` (approval must target ExchangeAction) and `AboveMaxPrice`, both actual reverted transactions. Example prices and 1%/5%/2.5% rates are local test conditions, not launch settings.

**NOT done in this slice (explicit lost/untested coverage):**
- **Indexer (`apps/indexer`) is not migrated.** It still indexes the old `fill`/handler/Rights model and will not compile or run against the new package. No new-model event handlers, schema, or REST API yet.
- **Web app (`apps/web`) is not migrated.** All UI (creation, activation, sale, bid, resale, execution, surrender, expiry, credit/collateral recovery, artwork example, atomic covered purchase), the Playwright e2e suite, and the production build still target the old model and will fail to typecheck/build against the new package.
- Because of the above, **workspace-wide `pnpm -r typecheck` and the web/indexer builds currently fail.** This commit is a clearly-labelled checkpoint of a verified package foundation, not a release-ready state.
- No real wallet-extension verification was done (not possible here); only simulated local signing with disposable keys.
- `devchain/seed.ts` was rewritten for the new model (compiles, used by `pnpm dev:chain`) but its downstream consumers (indexer, e2e) are not migrated, so it is not exercised end to end.

Nothing was deployed, broadcast, or pushed. No secrets written. The lead will provide the final protocol pin at freeze; regeneration is reproducible from the submodule.

---

## Seed/indexer gap-closing + build reproducibility fix (actions-v1), 2026-11-19

Additive follow-up to the indexer slice (protocol stays pinned `152bf41`; the lead froze the protocol at `9f50355`, production byte-identical, and re-pins after both client agents finish).

- **Seed (`devchain/seed.ts`), additive only** (existing seeded orders/addresses untouched): adds a Holder covered-purchase right, its Actions-token resale listing (0.2 ETH premium), bought and exercised by the buyer for its separate 0.5 ETH execution price; and a reserved Artwork palette change (issued + executed). New mints/orders only.
- **Indexer test** extended to **12/12**: covered right indexed + exercised with credits (royalty 0.0125 + proceeds 0.4875 = 0.5 ETH); the Actions-token **premium fill is a separate fill on the Actions collection, distinct from the execution price** on the underlying collection; reserved action indexed with an `action_performed` event and a 0.05 ETH surplus credit; and a **provenance test**: a foreign ERC-1167 clone of the Order implementation deployed outside Market is never indexed (`isOrder` false, `/api/orders/:clone` 404, absent from listings). Added a `reserved` → `exercised` status case. Evidence refreshed in `apps/indexer/evidence/indexer-api.json` (now includes the covered right + account and the reserved account).
- **Build reproducibility fix:** `forge build --ast` changes the embedded metadata and therefore the deployed bytecode / CREATE2 addresses, so it must never be the deployment build. `build:contracts` is reverted to plain `forge build`; `scripts/gen-abis.ts` now builds `--ast` into a throwaway out dir purely to extract the config/terms struct ASTs, leaving the canonical `out/` untouched. The generated `configStructs.gen.ts` is byte-identical to before. The `actions-v1` manifest codehashes were regenerated from the canonical build (the earlier committed values predated the local lib resolution); `verifyDeployment` (live code vs manifest) passes in the indexer test, and the codehash is stable across regenerations.

**Reproducibility note for the final re-pin:** manifest codehashes and CREATE2 addresses come from Foundry's metadata-ipfs build and depend on the exact resolved library bytes; this worktree's nested libs were copied locally (no network). At the lead's re-pin to `9f50355`, regenerate authoritatively with `git submodule update --init --recursive` then `pnpm build:contracts && pnpm --filter @market/protocol gen`.

## Indexer migration + config drift guard (actions-v1), 2026-11-19

Branch `claude/unified-actions`, protocol pin `152bf41`. Continues the foundation slice; `apps/web` is being migrated concurrently by another agent (not touched here).

**Indexer (`apps/indexer`) migrated to the unified Order/Action model, verified:**
- `ponder.config.ts` indexes Market.Created (factory source for Order), Order lifecycle (Activated/Executed/Canceled/Surrendered/Expired/Released/Credited/CreditWithdrawn/SurplusWithdrawn), Actions.Transfer (Holder-order ownership), ExchangeAction.Exchanged, CoveredNFTPurchase.Purchased, ReservedAction.ActionPerformed. `ponder.schema.ts` redesigned (order/fill/collection/token/meta/credit/account_event). `src/index.ts` decodes known action configs on Created and records settlements and credits. `src/api/index.ts` serves the `api.ts` shapes.
- **Effective liveness** uses the EXCLUSIVE deadline at query time: `now >= deadline` is `expired` even with no `finalizeExpiry` event indexed (verified by a test that queries a still-Live order past its deadline).
- All index-sourced addresses are documented as **unauthenticated hints**; clients must verify via `readOrder` (Market.isOrder + actionCodehash vs deployed code).
- **Legacy handling:** the new build serves only `actions-v1`; `src/deployment.ts` refuses `legacy-v1`/`rights-v1` (their old ABIs were removed from `@market/protocol`), directing them to their own historical indexer at the old commit. New ABIs are never pointed at legacy addresses.
- Verification: `apps/indexer` typecheck clean; `vitest run test/indexer.test.ts` = **8/8** against a real Anvil + Ponder + REST round trip (status/actions-v1, live vs sold vs awaiting-NFT, SQL priceNow parity with the contract, effective-deadline expiry, collection offers, positions, fill split). Live API responses captured in `apps/indexer/evidence/indexer-api.json` via `apps/indexer/scripts/capture-api.ts`.

**Config struct drift guard (task 2), verified:** `scripts/gen-abis.ts` now derives the ExchangeAction/CoveredNFTPurchase/ReservedAction config, terms and schedule ABI params from the compiler AST (`forge build --ast`) into `src/configStructs.gen.ts`, which `src/config.ts` consumes. A protocol struct change now changes the generated params and breaks `config.ts`'s typecheck instead of drifting silently (the old "configs are opaque bytes so they can't be ABI-derived" gap). `config.ts`'s public exports are unchanged (the concurrent web migration is unaffected). `build:contracts` now passes `--ast`. Protocol package typecheck clean; 32/32 unit tests (incl. the schedule-vs-config drift assertion).

**Lost / not done this slice:** the old indexer's rogue-clone-rejection and reorg tests were not reproduced (the new suite covers provenance via the factory source and the deployment-identity `setup` check, and statuses/parity/positions, but not a fabricated-event rejection or a reorg). Artwork reservation-target events are not indexed (Artwork is an example target, not in the manifest); the ReservedAction.ActionPerformed core event is. `apps/web` is mid-migration by another agent; workspace-wide build still depends on it.


## Web app migration to unified Order/Action (actions-v1), 2026-11-19

Branch `claude/unified-actions`, protocol pin `152bf41`. The Next.js client (`apps/web`) migrated off
the removed fill/handler/Rights model onto the unified Order/Action protocol. Scope: `apps/web`
(plus `apps/web/e2e` and `docs/screenshots`). Builds on the migrated `apps/indexer` (`b927205`) and
`packages/protocol` (actions-v1). **Wallet support is simulated locally** (an injected EIP-1193
provider forwarding to Anvil's unlocked accounts); no real wallet extension (MetaMask/Coinbase) was
tested.

### What changed
- Release guard `IS_ACTIONS` (`lib/deployment.ts`): discriminated by `exchange` (present only in
  actions-v1). Legacy/rights manifests lack the new contracts, so every unified-model read, builder
  and UI guards on it; a legacy selection never reaches new-model code.
- Unified flows library (`data/flows.ts`): creation+activation (sale/covered escrow create → deposit
  → activate, resumable + atomic-batch-collapsible; bid funded `createAndActivate`), sale listing
  (fixed/declining/increasing schedules), bid (funding + `topUp` replenishment), Actions-token resale
  and direct transfer, execution (buy; bid accept with approval to **ExchangeAction**, never the
  order — A1; covered exercise with explicit NFT recipient; reserved execution), surrender, expiry
  finalization, credit release/withdraw, surplus withdrawal, authenticated collateral `release`, and
  the atomic covered purchase (`acquireSteps`). Every step re-authenticates via `readOrder`
  (Market.isOrder + onchain `config()` + action codehash) and checks eligibility against chain block
  time with the exclusive `now >= deadline` boundary, never the indexer.
- Independent eligibility (owner spec): a royalty-over-limit sale is detected in `TokenDetailView`
  from the **on-chain** royalty vs the order's committed limit, so Buy is withheld even when the
  indexer still reports the order `live` (the migrated indexer does not flag royalty-blocked sales —
  see Things that don't make sense).
- Covered purchase rights reworked as covered orders (`RightsView`/`RightDetailView`/`IssueRightView`
  + `CoveredSection`); premium / exercise price / deadline / backing / recipients shown separately;
  no "option" wording.
- Mobile (375px): uint160-size Actions token ids middle-truncated in token cells (`shortId`) with a
  `TokenCell` clip safety net; `Hero`/`Toolbar` wrap and `StatBlock` scrolls on narrow screens. The
  e2e mobile run and the screenshot pass assert zero horizontal overflow at 375px.
- Display/listing helpers on the new `ApiOrder` (issuer/holder, maxExecutions/executions, deadline,
  closedAt); schedule carries price only.
- e2e migrated to the unified model + migrated indexer; six obsolete separate-Rights specs replaced
  by `covered.spec.ts` (issue → exercise → credit release, surrender + recover, finalize + recover).

### Verification (commands, exit status, result)
| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `cd apps/web && pnpm typecheck` | exit 0, 0 errors |
| Unit | `cd apps/web && npx vitest run lib/orderDisplay.test.ts` | exit 0, 1 passed (price-direction wording) |
| Build | `pnpm --filter @market/web build` | exit 0, compiled + TypeScript + 13 routes generated |
| E2E desktop+mobile | `cd apps/web && npx playwright test` (stack: `pnpm dev:chain`; indexer `ponder dev --port 42169 PONDER_RELEASE_ID=actions-v1`; `pnpm dev`) | exit 0, **28/28 passed** (14 flows x desktop 1440 + mobile 390; covered issue/exercise/credit, surrender, finalize; buy, accept, batch, create, offer, manage; all mobile pages 0 horizontal overflow at 375px) |

Screenshots (desktop 1440 + mobile 375) in `docs/screenshots/{desktop,mobile}-*`: listings,
collections, collection, token-detail, make-offer, sell, positions, rights, issue-right. (The older
`docs/screenshots/*-{desktop,mobile}.png` files are from the removed Rights UI and are superseded.)

### Lost / untested coverage
- AcquireAndExecute (atomic buy-and-exercise of a listed Actions token): flow builder exists
  (`acquireSteps`) but has no UI entry — it needs an indexer lookup of the resale listing's address +
  activation-terms hash, which the indexer does not yet expose. Documented TODO in `RightDetailView`.
  The Actions-token resale itself is exercised by the ordinary sale/buy flow.
- Reserved action + Artwork example: `executeReservedSteps` / `reservedSpec` / `artworkReserve`
  builders exist and are exercise-ready, but no dedicated screen or e2e was built this slice.
- Credit list in `RightDetailView` is driven by release-by-address + withdraw-your-own, not an
  enumerated beneficiaries list (no indexer `/api/accounts/:account` credits endpoint yet).
- Dropped from the old Rights specs (removed contract / generic flow mechanics): canonical
  separate-Rights-collection scenarios, atomic-wallet issuance + staged resume/cancel, manual
  encoded-config recovery, credit-withdraw to an alternate recipient, mid-form competing-transfer
  re-check, zero-price exercise. See `e2e/covered.spec.ts` header.

### Limitations
- No real wallet extension tested; wallet is a local injected provider over Anvil.
- Alchemy NFT API path untested (no key); the chain fallback for metadata/holdings is what ran.
- e2e ran against the just-migrated indexer (`b927205`), itself an unverified candidate.
- No human audit; the protocol itself is unaudited.

### Things that don't make sense
- **The migrated indexer does not flag royalty-blocked sales.** `ExchangeAction.quote()` is advisory
  and does not enforce `maxRoyaltyBps`, so a sale whose royalty exceeds the seller's limit is indexed
  `live` with `quoteError = null` (observed: seeded `maxRoyaltyBps=0` listings report `live`). The
  client now computes this itself from the on-chain royalty, but the indexer status is misleading;
  the indexer should compare the quote's capped royalty against the order's `maxRoyaltyBps` (apps/indexer).
- **`totalCredits` is per-beneficiary, not per-order.** Covered exercise credits BOTH the proceeds
  (to the issuer) and the royalty (to the collection's receiver), so releasing one beneficiary's
  credit does not zero `totalCredits`. An initial e2e assertion assumed a single credit; corrected to
  assert the released beneficiary's own credit clears.
- **Three read-only pages overflowed at 375px before this slice** (uint160 Actions ids in token
  cells, the collections period toggle, the collection StatBlock). Fixed here, but it means the prior
  mobile-overflow guarantees did not cover the collections/collection stats pages or Actions-token ids.
- **AcquireAndExecute can't be driven from the UI** until the indexer exposes the resale listing for
  an Actions token (address + activation-terms hash). The builder is ready; the discovery is missing.


## Focused improvements candidate, 2026-11-18

Verified implementation: `578e1b163ac1f458b7a6547ed9b90125da0800f1`; final protocol/submodule and artifact source: `c211808cf3dd6ed36f41e92d885e6f866a4b9436`. The complete protocol pin and repeated signed rehearsal are committed in `1d37cd8`; `4c86a5a` records the initial artifact generation. This supersedes the rights metadata-only candidate described in the historical status below. Current rights Market candidate is `0x5796242872BCAA3Fb0e16a4388c70f2e80aB966c`; Sepolia remains candidate/startBlock null. Legacy deployment and production selection remain unchanged.

Implemented independent listing/right acquisition eligibility, exact selected-right sale binding, Positions close-only cleanup for expired/burned entitlements, refreshed staged checks, canonical burn-source escrow history, and authenticated manual terminal collateral recovery during discovery outages. Activation-only policy remains separate from core terminal residual authority. Issuance also accepts a valid zero exercise price, preserving the approved protocol economics.

Fresh validation: protocol package 34/34, indexer 12/12, web unit 2/2, workspace typechecks and frozen production web build passed. Protocol local 245/245; both deep invariant campaigns 1,000 × 128 calls with unexpected reverts failing, zero reverts; fork suites 14 nft + 2 rights + 7 historical Sepolia passed after repairing the intentionally changed verifier metadata expectation. Focused immutable AI source review found and verified the scoped authority/association repairs and reported no remaining actionable finding. It did not independently rerun tests and is not an audit.

The repeated signed isolated local rehearsal at final protocol pin c211808 completed 56 transactions: 55 successes and one deliberate genuine atomic rollback. Receipts, gas, source pin and authoritative reads are in packages/protocol/evidence/rights-local.json. Primary/resale premiums are separate from the exact 1 eth exercise, with 0.95/0.05 eth actual beneficiary payments. Listing expiry/live token return and right expiry/close-only/finalization/manual-config recovery after burn both passed.

**52 distinct browser cases passed** at desktop 1440 × 900 and mobile 390 × 844, across the frozen campaign and affected repair/completion runs. The initial full command stopped with 30 passes, one mobile form-overflow failure and 21 unrun cases. A layout retry passed the next two mobile cases, then exposed the same overflow in Positions before any send. After repairs, all remaining 20 mobile cases passed (8.9 minutes), and six affected desktop Positions cases passed again (1.5 minutes). Earlier affected four-case desktop and three-case desktop runs also passed. No single all-green 52-case command is claimed. Screenshots in docs/screenshots show real loaded states, verified recovery destinations, separated expiry reasons and usable controls. Details, retained initial failures, exact commands and limitations are in [the verification record](docs/verification/2026-11-18-improvements.md).

Read-only Tenderly Sepolia identity check at block 12,163,460 returned no legacy runtime/relationship mismatches and no code for the new candidate Market. No public transaction, production infrastructure change, merge or package publication occurred. Real wallet extension smoke and public release steps remain pending authorization and environment support.

Historical milestone updated 2026-11-17, branch `codex/covered-rights`. Plan: [PLAN.md](PLAN.md). Decisions: [DECISIONS.md](DECISIONS.md). Release steps: [DEPLOYMENT.md](DEPLOYMENT.md).

## Rights client candidate

The client pins protocol `484223e81e6e68fd63531897ee7227aa20f8b91e`, including generic `Rights.tokenURI` metadata and exact deadline/execution fields (protocol D412–D413). `deployments/rights-local.json` identifies the local build. `deployments/rights-sepolia.json` is **candidate**, `startBlock: null`; its calculated addresses have **not** been deployed on Sepolia. `deployments/legacy-sepolia.json` preserves the verified order-only release at block 12,150,229. Public Sepolia still defaults to `legacy-v1`; rights indexing refuses the undeployed candidate.

| Candidate evidence | Observed result | Limit |
| --- | --- | --- |
| Protocol source suites | `CANDIDATE_RUN=1 forge test --no-match-path 'test/fork/*' --summary`: 223 passed in 27 suites; `MAINNET_RPC_URL=https://mainnet.gateway.tenderly.co SEPOLIA_RPC_URL=https://sepolia.gateway.tenderly.co forge test --match-path 'test/fork/*' --summary`: 23 passed in 3 fork suites. Both local invariant drivers ran 128 × 64 calls, zero reverts. | Captured in `/tmp/market_metadata_candidate_local.log` and `/tmp/market_metadata_candidate_forks.log` at pinned protocol source; fork tests do not put rights code on public Sepolia. |
| Protocol package | `pnpm --filter @market/protocol test`: 32 passed across four files, including 14 rights cases and a fresh-cache seven-day right after 16,001 actual blocks. | Package tests are distinct from browser and live-wallet paths. |
| Signed local RPC rehearsal | `pnpm --filter @market/protocol rehearse:rights`: 47 signed Anvil transactions on chain 31337, 46 successes and one deliberately reverted AtomicWallet activation. All receipts and readbacks are in `packages/protocol/evidence/rights-local.json`; protocol commit and deployment identity match the local manifest. | No public broadcast. Receipt gas prices are nonzero; a local transaction is not a Sepolia transaction. |
| Economic paths in that rehearsal | Primary 0.2 ETH premium pays 0.198 ETH seller and 0.002 ETH fee; secondary 0.3 ETH premium pays 0.297 ETH new seller and 0.003 ETH fee. Separate 1 ETH exercise pays 0.95 ETH proceeds and 0.05 ETH committed royalty through credits; canceled listing leaves right active; expiry and surrender recover only committed collateral. Failed atomic issuance leaves neither right nor deposit. | Example prices and 1%/5% rates are local test conditions, not launch settings or profit claims. |

The complete 36-case browser suite passed at desktop 1440 × 900 and mobile 390 × 844 (`CANDIDATE_RUN=1 E2E_RPC_URL=http://127.0.0.1:8865 E2E_INDEXER_URL=http://localhost:42369 E2E_BASE_URL=http://localhost:3130 pnpm exec playwright test`, 12.6 minutes). After the payment destination repair and fee disclosure changes, the affected `e2e/rights.spec.ts` passed 8/8 again against a fixed production build. This includes issue, sell, resell, exercise, exact payout receipts, rejected activation/reload/recovery, collection-wide right-offer rejection, and a genuine AtomicWallet issuance with no implicit staged fallback. The separate local RPC rehearsal submits a genuinely reverted atomic transaction to prove rollback; the old generic `batch.spec.ts` still checks the batch interface with sequential sends, not atomicity.

The independent AI source review covered immutable client trees and the consequential payment repairs. It found and prompted fixes for bounded older-config discovery, stale listing resumption, shared payout recipient state, fee disclosure, and alternate NFT delivery history. Its final repair pass found no further actionable issue in that narrow slice. It did not independently rerun the suites and is not an audit.

`CANDIDATE_RUN=1 pnpm typecheck` passed for all three packages. The production web build passed with the selected local rights release. Standalone component suites passed: protocol package 32, real Anvil/Ponder indexer 12, web unit tests 2. Slither 0.11.5 analyzed 30 protocol contracts with 101 detectors and reported 25 results (`/tmp/market_metadata_slither_final.log`); the added metadata timestamp comparison enforces the documented exclusive deadline. The protocol's review found no new actionable issue. Static analysis is not an audit. The initial workspace `pnpm test` failed because Vitest collected Playwright specs; the new web Vitest include rule separates the runners, and the affected component suites were completed. Earlier browser attempts failed during development hot reload, a missing explicit dialog selector, and indexer startup; those failures were diagnosed before the fixed-build pass. A separate payout outage check initially timed out on dialog closure after its exact recipient and balance assertions passed: the framework can wait 30 seconds for the indexer plus query retries. With a bounded 60-second wait, the final desktop and mobile runs passed. No economic assertion was weakened.

Public rights deployment and cutover checks remain pending. No public contract deployment, public walkthrough, hosted infrastructure change, push or merge occurred.

The positive canonical offer walkthrough passed at both widths in `e2e/right-offer.spec.ts`. A 0.15 eth token-specific premium bid clamps its deadline to one hour before exercise expiry, settles 0.1485 eth to the issuer and 0.0015 eth in fees, leaves the underlying nft in the same account, and creates no exercise credit. Its first mobile run exposed long token IDs overlapping the approval button; wrapping the picker, step rows and full-width buttons fixed it. The affected ordinary acceptance/batch cases and canonical offer cases then passed 6/6 (`/tmp/market_client_verified_long_ids.log`, 1.9 minutes). The final read-only viewport/screenshot checks passed 2/2 again after that CSS repair.

Coverage totals **42 distinct browser cases**: the 36-case full run, two viewport cases, two payout-outage cases, and two token-specific offer cases. Affected cases were rerun after repairs rather than repeating the whole suite. No unresolved functional failure remains in these local checks.

## Final local checks and limits

- `e2e/rights-views.spec.ts`: 2/2 passed, issuance/discovery/positions at both widths with no horizontal overflow. Screenshots are in `docs/screenshots/`.
- `e2e/z-right-payments.spec.ts`: 2/2 passed at desktop and mobile against Anvil (`/tmp/market_client_verified_payment_outage.log`). The old burned account lacks indexer config; release beneficiary and own-credit withdrawal destination stay separate. The issuer receives exactly 0.95 ETH, the royalty beneficiary balance is unchanged, and 0.05 ETH remains reserved. Its first attempt failed only because the dialog could take longer than the 20-second wait while the indexer and query retries took up to 30 seconds; the final assertion waits up to 60 seconds and checks the same amounts.
- Positive token-specific right offers passed 2/2; the affected ordinary acceptance and batch paths passed again in the same 6/6 run. The complete browser set contains 42 distinct cases.
- Read-only current Sepolia identity check through `https://sepolia.gateway.tenderly.co` at block 12,158,234: the preserved legacy manifest's runtime hashes and relationships all matched (`verifyDeployment` returned no mismatches). This performed no transaction.
- No real wallet extension smoke test, signer-specific Sepolia deployment dry run, public rights walkthrough, hosted indexer/client deployment, or production cutover ran. These remain review/release steps in `DEPLOYMENT.md`. Optional Alchemy and WalletConnect paths were not exercised.
- Test Multicall3 is the real stateless runtime installed as a local Anvil predeploy, following the existing development setup. Calls execute that code; no successful RPC answers or protocol balances are mocked. Local counterparties and hostile recipients are real deployed contracts.
- Older creation configs should come from the selected indexer and are checked against the immutable account hash before any supported action. Without config, exercise/trading is disabled. A known beneficiary can still release or withdraw its recorded credit; a contract that refuses eth and cannot authorize redirection remains unable to collect.
- The seven-day older-right test mined 16,001 local blocks. The resulting old Anvil on port 8865 refused historical block 21 calls from a subsequent indexer; the remaining browser preview moved to a fresh local node and separate indexer without clearing the old node or its database. This is an environment limit of that rehearsal, not evidence of a rights contract failure. No public indexer backfill under comparable depth was run.

The final payout-outage harness now aborts only failed browser indexer GET and RPC log-discovery requests, forwarding all successful RPC work to the real node. It no longer mines the shared preview chain, so project order cannot break later indexer checks. The separate isolated SDK test retains the actual 16,001-block, seven-day-right regression. Testing the real discovery failure also exposed raw RPC diagnostic text overflowing the mobile view: log lookup failures now produce the bounded unavailable-config message, and right panels wrap long text. Canonical/deployment/config-hash authorization checks remain outside this failure handling. The affected real-RPC SDK file passed 14/14; the final browser outage file passed 2/2 (`/tmp/market_client_complete_isolated_outage.log`, 2.2 minutes), with an additional immutable source review finding no weakening of payment or account authority. Web typecheck and production build passed again. No successful service response was mocked.

## Representative signed local transaction gas

| Operation | Gas used |
| --- | --- |
| purchase: create | 127,519 |
| purchase: activate | 235,334 |
| primary: escrow | 71,277 |
| A buys entitlement | 190,675 |
| B exercises | 203,463 |
| anyone finalizes expiry | 52,195 |
| issuer recovers expired collateral | 56,945 |

The 47 recorded transactions, including deployment and fixtures, used 12,494,581 gas and 0.012734040159391815 eth of local gas. These are actual nonzero-price Anvil receipts, not public gas quotes. Hashes, actors, addresses and post-state reads are in the committed JSON evidence.

## Verified legacy Sepolia release (2026-11-16 record)

## State

Milestones M0–M11 were built and verified locally against the **order-only** protocol pin. **Legacy Sepolia (M12) is live.** Market was deployed on Sepolia at block 12,150,229; all five runtime code hashes (Market, Order implementation, FeeConfig, NFTSale, NFTBid) matched that build, FeeConfig read 1%, recipient `0xD4ba…7e72`, admin `0xCB43…17F9` (checked 2026-11-16 through Tenderly's public gateway).

| Where | What |
| --- | --- |
| https://ripe-market-v1.netlify.app | Netlify production, from `main` |
| https://deploy-sepolia--ripe-market-v1.netlify.app | Historical branch deploy of `deploy/sepolia`; PR #2 merged at `69cb488` |
| https://market-indexer-sepolia.fly.dev | Indexer (Fly.io `market-indexer-sepolia`, Postgres `market-indexer-sepolia-db`, schema `market_v1`), at the Sepolia head |

## Legacy evidence (recorded 2026-11-16)

| Check | Command | Result |
| --- | --- | --- |
| Price parity | `cd packages/protocol && npx vitest run test/schedule.test.ts` | 3 passed: TS `priceAt` equals `NFTSale.priceAt` on 2,000 schedules incl. boundaries |
| Money flows | `npx vitest run test/flows.test.ts` | 8 passed: 1 ETH, 5% royalty, 1% fee → seller 0.94, royalty 0.05, fee 0.01, order empty; refunds; round trips; approvals |
| Errors | `npx vitest run test/errors.test.ts` | 7 passed: every mapped revert provoked and decoded |
| Indexer | `cd apps/indexer && npx vitest run test/indexer.test.ts` | 6 passed: fakes rejected (rogue clone Sold, spoofed event, unknown handler, garbage config), SQL price parity, time states, positions, reorg |
| SSRF guard | `cd apps/web && npx vitest run server/media.test.ts` | 1 passed |
| E2E | `cd apps/web && npx playwright test e2e/*.spec.ts` (with `pnpm dev:chain`, indexer, `next start`) | 22 passed: 11 flows × desktop 1440 and mobile 390, incl. one-prompt batch accept |
| Independent review | AI review of money, approval, indexer and server code | 2 confirmed bugs (SSRF in metadata fetch; accept broken on batching wallets) and 4 lesser findings, all fixed in `1680d83`; no economic loss or understated amount found |

## Remaining checks and limitations

1. No human audit of the client or the protocol. The protocol itself is unaudited (its STATUS.md).
2. The historical E2E result used a test wallet forwarding to Anvil's unlocked account; its batch mode ran calls one after another. The current signed AtomicWallet local rehearsal checks one atomic issuance and rollback, but no real wallet extension run (MetaMask/Coinbase) is recorded. Rights browser coverage uses the injected wallet plus a genuine owner-controlled account.
3. No mainnet-fork compatibility run through the client (real BAYC/Azuki/Opepen…). The protocol repo's own fork tests cover the contracts.
4. Tenderly's public gateway rate-limits the indexer (HTTP -32005 at 10 req/s); Ponder retries and stays at the head at 5 req/s. Heavier Sepolia traffic may need a lower rate or longer poll interval.
5. Alchemy NFT API path untested (no key); the chain fallback for metadata and holdings is what ran.
6. No Sentry or uptime monitoring configured (no accounts yet).
7. Pushes to GitHub do not trigger Netlify builds yet: Netlify's GitHub app likely lacks access to this repository. Builds so far were started through the Netlify API.
8. `pnpm audit`: 8 high and 13 moderate advisories in transitive dependencies (wallet and tooling packages), not triaged.

## Next action

Review the completed local candidate and its committed release record. PR #2 was already merged at `69cb488`; no Sepolia rights cutover is authorized under this implementation task. The Sepolia preparation sequence and separate legacy access are in [DEPLOYMENT.md](DEPLOYMENT.md).
