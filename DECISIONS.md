# Decisions

Decisions for the Market V1 client, made on the owner's instruction "make the decisions for me" (2026-11-16). Each one is the recommendation from `PLAN.md` §2 unless noted. **Status "Decided" means build on it; "Needs you" means a step only you can take.** To change one, edit its row and add a dated line under "Changes"; later work follows the latest entry.

Review order: start with the ones marked **Revisit first**.

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

## Changes

- 2026-11-16: all of the above set on the owner's instruction "make the decisions for me". No owner review yet.
- 2026-11-16: owner: "Only use tenderly public rpc url. Dont use vercel or railway. Use netlify and fly.io." D29 and D31 replaced accordingly. D30 (Alchemy NFT API for metadata and holdings) is not RPC and stays.
- 2026-11-16: owner: "Complete the full work without asking me any more questions." Build proceeds M0 to M11 locally; M12 (Sepolia) still waits on the protocol redeploy and accounts.
- 2026-11-16: owner: "You have access to netlify and fly.io. Just use auto deploy on netlify from gh". Done:
  - GitHub: `plan/v1` pushed; `main` created at the plan commit `22bec9c` so a PR has a base.
  - Netlify site `ripe-market-v1` (team ripe0x, id `6fae7e25-455f-4121-970d-c4887dce54fa`), linked to `ripe0x/market-client` through the existing Netlify GitHub app: production from `main`, branch deploys for `plan/v1` at https://plan-v1--ripe-market-v1.netlify.app. Base directory: repo root; package directory `apps/web`; config in `apps/web/netlify.toml`. `NEXT_PUBLIC_INDEXER_URL=https://market-indexer-sepolia.fly.dev`.
  - Fly.io app `market-indexer-sepolia` created (no machines, no database yet). It cannot start until Market is deployed on Sepolia (D28): no start block exists. Then: `fly postgres create --name market-indexer-sepolia-db`, `fly postgres attach`, `fly secrets set DATABASE_SCHEMA=market_v1`, set `startBlock` in `packages/protocol/src/addresses.ts`, `fly deploy -c apps/indexer/fly.toml --dockerfile Dockerfile.indexer` from the repo root.
- 2026-11-16: owner: "market is deployed to sepolia". Verified on chain (code hashes, fee terms), start block 12,150,229 (D28 resolved). Indexer deployed to Fly.io with unmanaged Postgres `market-indexer-sepolia-db` (same pattern as the owner's other indexers). Indexer request rate lowered to 5/s on Tenderly's public gateway after rate limiting at 10/s. Indexer API CORS opened to any origin: it is public, read-only GET with no credentials, and origin lists broke branch deploys.
