# Decisions

Original Market V1 client decisions were made on the owner's instruction "make the decisions for me" (2026-11-16). D40–D44 below supersede the order-only scope for the approved rights milestone. **Status "Decided" means build on it; "Needs you" means a step only you can take.** Later dated decisions control where historical rows conflict.

Review order: start with the ones marked **Revisit first**.

## Unified Actions migration (2026-11-19, branch claude/unified-actions)

| # | Decision | Why | Status |
| --- | --- | --- | --- |
| DA1 | **New release id `actions-v1` with its own manifests; `legacy-v1` and `rights-v1` untouched.** `deployments/actions-local.json` (deployed, local) and `deployments/actions-sepolia.json` (candidate, undeployed). Public Sepolia still defaults to `legacy-v1`. | Never attach the new ABI to an address running different code; keep historical releases loadable. | Decided |
| DA2 | **Action configs are hand-written codecs; `Schedule`/`Quote` are ABI-derived.** In the unified model the per-action `config` and execution `input` are opaque `bytes`, so their struct shapes live in `src/config.ts` and are checked on chain by the signed rehearsal. | No ABI function exposes the config structs, so the old "config taken from `quote` inputs" drift guarantee is gone; the on-chain rehearsal replaces it. | Decided |
| DA3 | **Royalty = min(ERC2981, price − fee); sale `maxRoyaltyBps` checked against the capped royalty.** | Matches ExchangeAction `_quote` (lead confirmation 2026-11-19); a large royalty cannot block trading, and the issuer cap is applied to what is actually paid. | Decided |
| DA4 | **Incoming bid NFT approval targets ExchangeAction, never the order (prefer single-token approve).** The order never receives a seller's approval. | ExchangeAction moves only the executing actor's selected token inside a genuine execution (finding A1); the rehearsal proves an un-approved sell reverts `ERC721InsufficientApproval`. | Decided |
| DA5 | **Indexer and web migration deferred to a later slice.** This slice delivers only the verified protocol package; the repo does not build workspace-wide until they are migrated. | A single verified foundation beats a half-wired, unverified vertical; see STATUS lost-coverage list. | Needs follow-up |


## Product and copy

| # | Decision | Why | Status |
| --- | --- | --- | --- |
| D1 | **Fee label stays "Market fee".** The rate is always read from chain (`FeeConfig.feeBps()` for new orders, `feeBpsOf(order)` for existing ones). | "Market" is the product name and the fee goes to its operator (`0xD4ba…7e72`). The core contract takes nothing; the label refers to the product, not the protocol core. | Decided. **Revisit first** if the brand and the protocol name should be kept apart. |
| D2 | **Royalty label: "Artist royalty"** as designed, rate from `royaltyOf`, "No royalty" when the collection does not report ERC2981. | Matches the design. The receiver may not be the artist; changing to "Royalty" is a copy-only edit. | Decided |
| D3 | **Royalty limit default = the collection's current rate, rounded up to a whole basis point**, checked at both start and end price. Menu: "Collection asks X%", 0%, 2.5%, 5%, 7.5%, 10%, No limit. | Matches "the sale stops instead of paying you less"; rounding up avoids a 1-wei refusal when a collection rounds differently. | Decided |
| D4 | **Listing expiry: Never / 30D / 90D, default Never. Offer expiry: 1D / 3D / 7D / 30D / Never, default 7D.** | Design options kept. An offer holding ETH forever is rarely intended. | Decided |
| D5 | **Moving prices get 2 minutes of headroom.** Buy: `maxPrice` = highest price over the next 120 s (equals the current price for fixed and falling listings). Accept: `minProceeds` from the lowest price over the next 120 s. The CTA shows that bound. | Without it, rising listings and falling offers fail one block after the quote. Fixed prices are unaffected. | Decided |
| D6 | **Rising listings allowed** in the Create form (End price may exceed Start). | Protocol supports them and the design's tables show them. | Decided |
| D7 | **Offers created in V1 are fixed price.** Rising offers made elsewhere are shown and accepted. | The design's Make offer form has one amount. | Decided |
| D8 | **Approval to `NFTBid`: per token only.** Approve and sell in one prompt when the wallet supports atomic batches (EIP-5792). An existing approve-all is detected, skipped and shown with Remove. | Smallest exposure (`NFT_TRADING.md` recommends it); per-token approval clears itself on sale. | Decided |
| D9 | **Activity amounts: Sold shows what you received** (price − fee − royalty); **Bought and Offer filled show what you paid** (price). Accepting someone's offer is "Sold". | Matches the design's figures (Sold 0.940, Offer filled 0.30). | Decided |
| D10 | **Volume and Sales exclude self-trades** (buyer == order owner). | Removes the obvious wash trade at no cost. | Decided |
| D11 | **Collections are permissionless, keyed by contract address, with a reviewed denylist file** in this repo that hides known impersonators from browse and search. Orders stay reachable by address. Full contract address shown on collection and token screens. | Keeps the protocol permissionless while limiting the fake-"Driftlines" problem. | Decided. Denylist starts empty. |
| D12 | **Own offers show no Sell button.** | Selling to yourself only pays fee and royalty. | Decided |

## Design gaps and conflicts

| # | Decision | Status |
| --- | --- | --- |
| D13 | Accept offer on **desktop** uses the right-hand 520px panel of the two-column layout; mobile as designed. | Decided |
| D14 | Accept-offer note reads: "If the price or royalty changes before this confirms, the sale stops instead of paying you less than 0.517." (The fee of an existing order cannot change.) | Decided |
| D15 | **Expired or open orders recover in two steps** (close, then withdraw). Rows keep the designed labels ("Withdraw 0.60 ETH", "Cancel and withdraw") and show "two confirmations", or one prompt with batch support. Expired listings appear in Positions. | Decided |
| D16 | **Add funds is offered only to the offer's owner, only while it is open.** | Decided |
| D17 | Added statuses, in the design's type and colours: Awaiting NFT (with "Move #15 into it"), Not started, Expired, Sale stopped (royalty), Underfunded, Closed with assets to withdraw. | Decided |
| D18 | "Listed" column = time since the order was created. "Last sale" = last sale on Market, "—" otherwise. Offers "Remaining" = `maxFills − fills`, with an Underfunded note. | Decided |
| D19 | Search: dropdown under the field, Collections and Tokens groups, matching name, symbol, address and `name #id`. | Decided |
| D20 | Times in the viewer's local zone: weekday + time within 7 days, else day + month. Amounts you pay round up, amounts you receive round down, up to 4 decimals. | Decided |
| D21 | Breakpoints: < 768px mobile design; ≥ 768px desktop design, fluid; two-column screens stack below 1100px; tables drop Last sale, then Listed, below 1200px. | Decided |

## Architecture and build

| # | Decision | Why | Status |
| --- | --- | --- | --- |
| D22 | **Next.js App Router + Ponder + Postgres + shared `packages/protocol`, one pnpm workspace.** Protocol repo as a read-only submodule pinned to `d6b2073`. | `PLAN.md` §3–4. | Decided |
| D23 | **Listing flow: create, then transfer the NFT in** (not transfer to `orderAddress` first). Batched into one prompt when the wallet supports it. | An abandoned flow leaves an empty, closable order instead of an NFT at a codeless address. | Decided |
| D24 | **Indexer API: custom REST endpoints in Ponder's server** (no GraphQL in V1). | Price-now sorting and stats need custom SQL; one typed path. | Decided |
| D25 | **Styling: CSS Modules + CSS variables** (no Tailwind). Fonts via `next/font`. | Exact pixel values from a fixed token set; no extra dependency. | Decided |
| D26 | **Error monitoring: Sentry for the web app.** | Cheap, catches wallet and RPC failures users won't report. | Decided. Needs an account at M11. |

## Chains, hosting and services

| # | Decision | Status |
| --- | --- | --- |
| D27 | **Sepolia first, mainnet later, one chain per deployment** (`sepolia.<domain>`, later `<domain>`), each with its own indexer. No chain switcher. Mainnet only after the protocol's human audit and your mainnet deployment. | Decided |
| D28 | **Contract addresses: you redeploy Sepolia** from the protocol repo per `DEPLOYMENT.md` (`Market`, `FeeConfig`, `NFTSale`, `NFTBid`). I don't deploy. Until then all work runs on local Anvil, where the protocol's `Deploy.s.sol` gives the same planned addresses. | **Needs you** before M12: the deployment, then send me the block number. |
| D29 | **Hosting: Netlify for the web app, Fly.io for Ponder and Postgres** (owner's choice, 2026-11-16). No Vercel, no Railway. | Decided by you. **Needs you** before M12: accounts. Nothing is deployed without your go-ahead. |
| D30 | **NFT data: Alchemy NFT API** behind one adapter (metadata, media, wallet holdings, Items, Owners), with `tokenURI` resolution as fallback. Key server-side only. Media served only through our proxy as `<img>`/`<video>`. | Decided. **Needs you** before M5 against Sepolia: an Alchemy key. Local work uses `tokenURI` resolution. |
| D31 | **RPC: Tenderly's public gateways only, everywhere** (owner's choice, 2026-11-16): `https://sepolia.gateway.tenderly.co`, `https://mainnet.gateway.tenderly.co`, in the browser, the web server and the indexer. No keyed RPC provider. Polling is batched through Multicall3 and kept to the lanes in `PLAN.md` §4.6 to stay within public rate limits. | Decided by you. Risk: a public gateway may rate-limit the indexer under load; watch the lag alert. |
| D32 | **WalletConnect:** local and early milestones use injected wallets only (RainbowKit without WalletConnect). | **Needs you** before M12: a Reown project ID, domain-restricted. |

## Build-time decisions (2026-11-16)

| # | Decision | Status |
| --- | --- | --- |
| D33 | Accepting an offer opens its own page (`/c/[nft]/offers/[order]/sell`) at both widths instead of a 520px panel inside the collection page (deviation from D13). Same content and flow. | Decided; revisit if the panel matters |
| D34 | List and grid thumbnails use the #111 placeholder; token art loads on token pages and in the NFT pickers only, to avoid one metadata request per row. | Decided; revisit with an Alchemy key |
| D35 | The collection header's royalty samples the first listed token (else #1) at 1 ETH. ERC2981 is per token, so this is a heuristic. | Decided |
| D36 | List queries use the indexer's own head, not the client's; displayed prices are recomputed per block, so a price sort can lag the display by one block (PLAN §4.7). | Decided |
| D37 | `@base-org/account` is aliased to an empty module: RainbowKit's connector bundle imports it with optional dependencies that are not installed, and the app never uses the Base wallet connector. | Decided; revisit when adding WalletConnect wallets |
| D38 | Keyboard focus: a 2px white outline on `:focus-visible` everywhere, the design's selection style. | Decided |
| D39 | Every write CTA (`FlowButton`) is gated on the deployment check (start block, runtime code hashes) and the wallet's network. | Decided |

## Rights client superseding decisions (2026-11-17)

The owner's approved transferable-rights direction supersedes the order-only scope of the original plan and D22/D28 for the new release. The original decisions still describe the verified legacy Sepolia deployment. Protocol commitments and economic terms are specified in `contracts/market/docs/DECISIONS.md` D401–D413; the client cannot weaken them.

| # | Decision | Why and boundary | Status |
| --- | --- | --- | --- |
| D40 | Keep `legacy-v1` and `rights-v1` as separate release identities and manifests. Public Sepolia defaults to verified `legacy-v1`; the rights Sepolia manifest stays `candidate` with `startBlock: null` until actual receipts and postflight reads establish deployment. | Computed CREATE2 addresses are not deployed code. The historical legacy manifest and its positions remain intact. `deploymentId` scopes queries and indexer responses. | Decided |
| D41 | The rights indexer uses its own schema and authenticates Market-created Right accounts and canonical token ownership. A candidate manifest cannot start a public indexer. | Rights events and backing states must not contaminate legacy positions or become live solely through an environment override. | Decided |
| D42 | The supported first client right is a covered NFT purchase. Show the separate premium, fixed exercise price, committed royalty recipient/amount, backing account, holder, residual beneficiary and remaining exclusive exercise window. Refuse a right trade when its configured order expiry does not leave the required exercise window. Collection-wide canonical rights bids are excluded. | Buying or reselling the token does not execute the right, and generic NFT collection value does not describe a specific right. The protocol's `Rights.tokenURI` supplies generic identity and liveness; full operation terms come from `RightCreated` and activation state. | Decided |
| D43 | Use the existing NFT trading fee for right-token premiums; do not apply the underlying NFT's royalty to every premium. Covered exercise pays exact ETH and credits the activation-committed royalty and proceeds; credit release remains available after exercise. | A 0.2 ETH primary premium at 1% pays 0.198 ETH to that seller and 0.002 ETH fee. A 0.3 ETH resale pays 0.297 ETH to its listing seller and 0.003 ETH fee. A separate 1 ETH exercise at 5% credits 0.05 ETH royalty and 0.95 ETH proceeds. These are tested example amounts, not launch price limits. | Decided |
| D44 | Public rights release requires a frozen source, same-signer rehearsal, codehash and relationship readbacks, isolated indexer readiness, a separate web selection, a signed user walkthrough and explicit owner authorization before each public broadcast. | Local Anvil receipts and fork simulations do not establish a Sepolia deployment or authorize sending. Legacy access must survive evaluation of the rights candidate. | Decided |
| D45 | Covered issuance is staged and resumable by default. Atomic mode requires actual wallet support, preserves that account as issuer, and never silently falls back after failed preparation. Deposits reauthenticate the account, asset and committed terms. | Atomic setup failure rolls back creation and deposit. Separate transactions require a pending cancellation and recovery path. | Implemented |
| D46 | Exercise recipient, right transfer recipient, credit release beneficiary and own-credit withdrawal destination are independent inputs. Confirmation displays the destination captured with the call. | A third-party beneficiary entered for release must never redirect the caller's own proceeds. Live fees and seller net are shown for premiums; exercise has no trading fee. | Implemented |
| D47 | Indexed creation bytes are untrusted until the canonical account's config hash matches. Supplied bytes avoid a history scan; fallback discovery is bounded to eight 2,000-block requests. | Older rights need indexed or supplied config for exercise and trading. Missing config does not prevent withdrawal of a known credit. The listing UI requires more than two hours remaining and leaves a one-hour exercise window. | Implemented |

## Changes

- 2026-11-17: D40–D44 record the native rights client and separate release. D22's `d6b2073` pin and D28's pending Sepolia redeploy describe the original V1 plan; the legacy release was deployed and verified, while the rights candidate pins `484223e` and has no public start block. No new public broadcast is authorized.
- 2026-11-16: all of the above set on the owner's instruction "make the decisions for me". No owner review yet.
- 2026-11-16: owner: "Only use tenderly public rpc url. Dont use vercel or railway. Use netlify and fly.io." D29 and D31 replaced accordingly. D30 (Alchemy NFT API for metadata and holdings) is not RPC and stays.
- 2026-11-16: owner: "Complete the full work without asking me any more questions." Build proceeds M0 to M11 locally; M12 (Sepolia) still waits on the protocol redeploy and accounts.
- 2026-11-16: owner: "You have access to netlify and fly.io. Just use auto deploy on netlify from gh". Done:
  - GitHub: `plan/v1` pushed; `main` created at the plan commit `22bec9c` so a PR has a base.
  - Netlify site `ripe-market-v1` (team ripe0x, id `6fae7e25-455f-4121-970d-c4887dce54fa`), linked to `ripe0x/market-client` through the existing Netlify GitHub app: production from `main`, branch deploys for `plan/v1` at https://plan-v1--ripe-market-v1.netlify.app. Base directory: repo root; package directory `apps/web`; config in `apps/web/netlify.toml`. `NEXT_PUBLIC_INDEXER_URL=https://market-indexer-sepolia.fly.dev`.
  - Fly.io app `market-indexer-sepolia` created (no machines, no database yet). It cannot start until Market is deployed on Sepolia (D28): no start block exists. Then: `fly postgres create --name market-indexer-sepolia-db`, `fly postgres attach`, `fly secrets set DATABASE_SCHEMA=market_v1`, set `startBlock` in `packages/protocol/src/addresses.ts`, `fly deploy -c apps/indexer/fly.toml --dockerfile Dockerfile.indexer` from the repo root.
- 2026-11-16: owner: "market is deployed to sepolia". Verified on chain (code hashes, fee terms), start block 12,150,229 (D28 resolved). Indexer deployed to Fly.io with unmanaged Postgres `market-indexer-sepolia-db` (same pattern as the owner's other indexers). Indexer request rate lowered to 5/s on Tenderly's public gateway after rate limiting at 10/s. Indexer API CORS opened to any origin: it is public, read-only GET with no credentials, and origin lists broke branch deploys.

## 2026-11-18: independent eligibility and assisted terminal recovery

Listing state and right state are independent. Acquisition requires both to remain eligible at preparation and simulation. Keep stale listing associations for inspection and cleanup. Positions returns an escrowed right only while its canonical token remains transferable; a stale listing can be closed alone. Refresh before each staged step and retain a confirmed close if later expiry prevents withdrawal. Atomic behavior stays explicit.

During discovery outages the original encoded covered config may be supplied manually. Hash the exact bytes against the authenticated account commitment, then decode the supported format. Authenticate deployment, canonical mapping, known handler, terminal state, actual residual caller and nft custody before simulation and signing. Never apply issuer-only activation policy to terminal recovery from an invalid pending setup. Keep token-burn history and credit actions independent of metadata and ownership-token existence.
