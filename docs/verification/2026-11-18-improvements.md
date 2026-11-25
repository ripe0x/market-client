# Focused rights reliability verification, 2026-11-18

Final protocol artifact source and client submodule pin: `c211808cf3dd6ed36f41e92d885e6f866a4b9436`. Production files are unchanged from cf7f48d; c211808 also includes the corrected historical fork-test expectation. Protocol implementation review head: `7736cba`; protocol documentation handoff head `0e8832c`. Initial generated artifacts and signed rehearsal commit: `4c86a5a`. Initial client implementation: `85fb4fd56c3d1b6a1f19892010356b32c6c9bbd7`. Verified layout/copy/test repairs conclude at `578e1b163ac1f458b7a6547ed9b90125da0800f1`. Complete pin and repeated signed evidence: `1d37cd8`. Earlier implementation checkpoints were explicitly unverified until these completion runs. Later documentation records its completed verification without rewriting that published intent.

## Changes and authority boundaries

Acquisition checks listing closure, start, exclusive listing expiry, status, custody and quote separately from the right's liveness and backing. The selected backing account is bound to the authenticated sale config in both the view and transaction preparation. Stale listings remain visible. Terminal associations resolve the actual canonical burn source, not an arbitrary unrelated listing.

Positions can close stale listings without attempting an impossible expired/burned ERC721 transfer. It returns a live token when only the listing expires. Staged steps refresh their completion/eligibility checks; a confirmed close stays confirmed across rejection and later expiry. The batch interface shim is not evidence of atomic rollback; the separate AtomicWallet test and signed reverted issuance provide that evidence.

Advanced recovery accepts original encoded covered config and hashes the exact bytes before decoding. Reads authenticate deployment, canonical account/token mapping and supported handler code, then require terminal state, the actual immutable residual caller and current nft custody. The displayed verified asset and destination feed the existing simulated recovery path. No indexer, metadata or successful ownerOf on a burned entitlement is required. Zero proceeds or residual unequal to issuer can invalidate activation without invalidating the core's later terminal recovery path. Payout paths remain separate. Issuance accepts zero exercise prices, consistent with the unchanged handler.

## Commands and results

- `pnpm build:contracts && pnpm gen`: exit 0. ABI no longer includes everMinted. Both rights manifests and the repeated final rehearsal identify c211808. Runtime hashes, addresses and relationships are identical to the production-finalized cf7f48d build. The generator deploys only isolated local Anvil contracts, checks runtime identities and relationships, and marks Sepolia candidate/startBlock null. Legacy manifest was byte-for-byte preserved.
- `CANDIDATE_RUN=1 pnpm typecheck`: passed all three packages; repeated after affected UI repairs and final build.
- `CANDIDATE_RUN=1 pnpm test`: initial protocol 33/33 and web 2/2 pass, indexer 11/12 because a previous assertion expected stale listings to disappear. Updated it to assert retained closed association, nontransferability and no withdrawal.
- `CANDIDATE_RUN=1 pnpm --filter @market/protocol test`: final 34/34 pass, including original-byte config, older 16,001-block account, wrong hash, wrong residual, active refusal, postburn recovery, invalid pending setup, and selected-right sale binding.
- `CANDIDATE_RUN=1 pnpm --filter @market/indexer test`: final 12/12 pass on real Anvil/Ponder. New decoy regression initially queried before indexing and returned 404; waiting for its receipt block fixes the harness without fabricating service responses.
- `CANDIDATE_RUN=1 NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_MARKET_RELEASE=rights-v1 NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8895 NEXT_PUBLIC_INDEXER_URL=http://localhost:42400 pnpm --filter @market/web build`: passed frozen production build.
- `CANDIDATE_RUN=1 pnpm --filter @market/protocol rehearse:rights`: 56 signed isolated Anvil transactions, 55 success and one deliberate reverted atomic activation, 13,178,694 total gas. Evidence: packages/protocol/evidence/rights-local.json.

Initial browser campaign, equivalent invocation from apps/web: `E2E_RPC_URL=http://127.0.0.1:8895 E2E_INDEXER_URL=http://localhost:42400 E2E_BASE_URL=http://localhost:3172 pnpm exec playwright test --max-failures=1` from apps/web. The initial browser run and first layout retries omitted the CANDIDATE_RUN environment marker despite an explicitly frozen candidate. The client has no consumer of this flag, so runtime behavior was unaffected; this is a process deviation, not retroactively marked execution. Subsequent Positions and completion campaigns explicitly set CANDIDATE_RUN=1. The initial frozen campaign stopped at 30 passes, one mobile ordinary-create failure and 21 unrun cases. Long canonical token identifiers overflowed the trading form and intercepted the CTA. Bounded repair 9ecda4d contains identifiers and grid minimum widths; the existing create test now asserts viewport fit and a real elementFromPoint hit test before an unforced click. Four affected desktop cases passed on the repaired build; the mobile create and royalty-blocked cases also passed. A subsequent mobile ordinary-cancel timeout was traced to the same overflow in Positions before any transaction was sent. Repair 30a28f3 adds localized wrapping mobile rows and stronger viewport/modal hit tests; desktop layout inspection additionally prompted wrapping identifiers/actions within the existing columns. Postburn screenshots now wait for loaded right-record content, preventing a vacuous absent-button assertion. Final completion: 52 distinct desktop/mobile cases pass across valid runs. The remaining 20 mobile cases passed in 8.9 minutes; six affected desktop cases passed again in 1.5 minutes. This is not represented as a single passing 52-case invocation. Initial browser runs exposed a bigint query key causing a server-render failure and an unstable implicit textarea accessible name after validation. Fixed by serializing chain time in the query key, binding selected account into that key, and assigning an explicit accessible name. An obsolete build run was interrupted with exit 130 and not counted as evidence. Later affected retries supersede these failures; the failures remain described here rather than hidden.

New reliability fixtures use a finite three-hour deadline and a two-minute listing expiry. This preserves the exclusive boundary, live return and useful exercise window while avoiding repeated day-long clock jumps that would overtake the application’s unchanged seven-day wall-clock issuance default. The older-history SDK test remains isolated and still mines 16,001 real blocks.

## Signed reconciliation

Primary 0.2 eth premium: issuer 0.198 eth, trading fee 0.002 eth. Resale 0.3 eth: first buyer 0.297 eth, fee 0.003 eth. Backing remains at one account across both sales. The final holder pays exactly 1 eth exercise, receives the nft and burns the entitlement. Issuer and royalty beneficiary receive exactly 0.95 and 0.05 eth on permissionless credit release. Gas is separate, recorded with nonzero effective gas prices per receipt. Total local receipt cost 0.013413042342625812 eth. These are local conditions, not public gas quotes.

The rehearsal also closes an expired listing while its right remains live and returns the entitlement, closes an expired-right escrow without withdrawing it, finalizes it and recovers with authenticated manual bytes after burn. It cancels pending setup and proves genuine atomic issuance rollback leaves neither account nor deposit. Browser outage tests abort only failed indexer GET and RPC log discovery requests; all successful contract reads and sends go to the real local node. They do not advance the shared browser chain by 16,001 blocks.

## Read-only public identity

Tenderly Sepolia at block 12,163,460: verifyDeployment returned no legacy runtime/relationship mismatches; the new Market candidate returned no code. Its status/startBlock stay candidate/null. No signer was selected or used.

## Remote protocol CI

Draft protocol PR #17 at documentation head c211808 completed both GitHub Actions jobs: forge passed in 1m51s and fork passed in 43s (run 44379855624). Local campaigns above remain distinct evidence. Client draft checks are reported separately after publication.

## Independent review and limits

Focused AI source review of protocol cf7f48d and client 85fb4fd found and prompted removal of zero-proceeds activation policy from terminal decoding, actual burn-source escrow association, and exact selected-right listing binding. The affected repairs were reviewed in the immutable checkpoint. The subsequent layout/copy repairs at 9ecda4d and 30a28f3 were separately reviewed with no policy or authority change found; 578e1b1 contains the final localized desktop identifier/action wrapping and bounded test-clock fixture. No remaining actionable source finding was identified in that scoped review; tests were not independently rerun by the reviewer. This is not a full or independent human audit.

During a discovery outage, the existing transaction framework may wait up to 30 seconds for indexer acknowledgment after a successful receipt. The collateral transaction and authoritative state still complete; the modal can acknowledge later. No payout or collateral authority is changed by that wait.

Real wallet extension smoke, public broadcast, signer-specific Sepolia deployment simulation, hosted indexer migration/readiness, production cutover, public walkthrough and package publication did not run. All public steps remain outside this task. Preserve the legacy release and schema when reviewing the existing DEPLOYMENT.md runbook.


## Final affected browser completion commands

Executed from the client repository root, both exit 0:

```sh
set -o pipefail; CANDIDATE_RUN=1 E2E_BASE_URL=http://localhost:3175 E2E_RPC_URL=http://127.0.0.1:8895 E2E_INDEXER_URL=http://localhost:42400 pnpm --filter @market/web exec playwright test e2e/manage.spec.ts e2e/right-reliability.spec.ts e2e/rights-views.spec.ts --project=desktop --grep 'cancel and withdraw a listing|cancel and withdraw an offer|add funds to an underfunded|remove an approve-all|Positions closes an expired|rights discovery' --max-failures=1 2>&1 | tee /tmp/market_improvements_browser_positions_final_desktop.log
```

Six passed, 1.5 minutes.

```sh
set -o pipefail; CANDIDATE_RUN=1 E2E_BASE_URL=http://localhost:3175 E2E_RPC_URL=http://127.0.0.1:8895 E2E_INDEXER_URL=http://localhost:42400 pnpm --filter @market/web exec playwright test e2e/manage.spec.ts e2e/offer.spec.ts e2e/right-offer.spec.ts e2e/right-reliability.spec.ts e2e/right-termination.spec.ts e2e/rights-views.spec.ts e2e/rights.spec.ts e2e/z-right-payments.spec.ts --project=mobile --max-failures=1 2>&1 | tee /tmp/market_improvements_browser_positions_final_mobile.log
```

Twenty passed, 8.9 minutes.

After switching the complete protocol pin from production-finalization cf7f48d to c211808, `pnpm build:contracts && pnpm gen` confirmed identical runtime identities/relationships, `CANDIDATE_RUN=1 pnpm --filter @market/protocol test` passed 34/34 again, and the signed 56-transaction rehearsal was repeated with source c211808. This fixes reproducibility of the submodule’s historical fork check without changing deployed bytecode. Final source-pin web build and workspace typecheck passed. Fresh local indexer status reported ready with deploymentId `31337:rights-v1:0x5796242872bcaa3fb0e16a4388c70f2e80ab966c`, chain 31337 and release rights-v1. The read-only final viewport smoke `CANDIDATE_RUN=1 E2E_RPC_URL=http://127.0.0.1:8895 E2E_INDEXER_URL=http://localhost:42401 E2E_BASE_URL=http://localhost:3176 pnpm exec playwright test e2e/rights-views.spec.ts` from apps/web passed 2/2 in 9.1 seconds.

Things that do not make sense: no new unresolved policy decision. The approved split of premium and exercise can legitimately yield zero underlying royalty or zero premium trading fee. A recipient refusing eth without any ability to authorize another destination still cannot collect its reserved credit.
