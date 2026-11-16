# Prompt for Claude Code

Copy everything below the line into Claude Code, run from a new, empty app repository with this handoff folder inside it (e.g. `./handoff/`).

---

You are planning the production build of **Market**, a web app for trading ERC721 NFTs on the Market protocol. Your first deliverable is a plan, not code. Do not scaffold, install or implement anything until I approve the plan.

## Inputs

1. **Design handoff** in `./handoff/`:
   - `README.md`: screen-by-screen spec, behaviour, states, design tokens.
   - `design/Market V1 - standalone.html`: the full design (8 screens, desktop 1440 and mobile 390). Open it in a browser. `design/Market V1.dc.html` is the same file in source form; read it for exact copy, sizes and colours.
   - `PROTOCOL_REVIEW.md`: how the design was reconciled with the contracts, and what is still open.
   - `STYLE_GUIDE.md`: the visual system in portable form.
2. **Protocol repo**: https://github.com/ripe0x/market (branch `main`). Read at least `README.md`, `CLAUDE.md`, `OWNER-REQUIREMENTS.md`, `docs/SPEC.md`, `docs/NFT_TRADING.md`, `docs/HANDLERS.md`, `docs/SECURITY.md`, `docs/DEPLOYMENT.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, and the source in `src/`, `handlers/` (`NFTSale`, `NFTBid`, `NFTTrade`, `HandlerBase`, `FeeConfig`) and `periphery/FillVerifier.sol`. Treat the code as the source of truth where docs and design disagree.

## Stack constraints

- Wallet connection: **RainbowKit**, with wagmi and viem.
- TypeScript throughout. Pick the app framework (Next.js App Router is the default assumption; argue for something else only with a reason).
- **An indexer is required.** Recommend one (e.g. Ponder, Envio, The Graph, or a custom viem-based indexer on Postgres) and justify the choice against this protocol's event model. Discovery must work from `Market.Created` plus handler `Sold` / `Bought` events and order `Filled` / `Closed` events alone.
- No offchain order book and no signatures for orders: every order is an onchain contract. Do not invent server-side state the protocol doesn't have.
- Build the real thing: production-quality, typed, tested, deployable. No mocked data paths in the shipped app.

## What to do

1. **Review the design.** Walk every screen and state in the handoff. List anything ambiguous, missing, or that conflicts with the contracts.
2. **Review the protocol.** Confirm, from code, every rule the UI depends on: the price schedule (`priceAt`, rounding, `startTime`, `expiry`), `quote()` return values, fee rate locked per order via `FeeConfig.feeBpsOf` and `Market.createdAt`, royalty lookup and cap, `maxRoyaltyBps`, `maxPrice` and overpayment refund, `minProceeds`, `maxFills` and `fills(order)`, funding and top-up of bids, approval to `NFTBid` (not the order), close-then-execute recovery, `_requireFill` and what it means for trusting events, the `orderAddress` prediction path. Flag anything in `PROTOCOL_REVIEW.md` you disagree with.
3. **Come back with a plan** in `PLAN.md` covering the sections below. Be specific: name packages, tables, events, functions, routes and components. Where there is a real choice, give options with a recommendation.

## PLAN.md sections

1. **Summary**: what will be built, in one paragraph.
2. **Open questions for me**: decisions you need before building. At minimum: the "Market fee" label (the core takes no fee; the NFT handlers do), where Items/Owners counts come from, chains (Sepolia first? mainnet later?), contract addresses (Sepolia must be redeployed per `STATUS.md`), hosting, NFT metadata and media source, the royalty limit default, listing expiry options.
3. **Architecture**: diagram (ASCII is fine) of app, indexer, database, RPC, metadata service. What runs where.
4. **Indexer**:
   - Chosen tool and why.
   - Event sources and start blocks; how handler addresses are trusted and fake orders are rejected (orders must come from `Market.Created`; events only from known handler addresses).
   - Decoding `Created.config` into `NFTSale.Config` / `NFTBid.Config`.
   - Schema: orders (type, owner, nft, tokenId, anyToken, schedule, maxFills, maxRoyaltyBps, proceedsTo/recipient, createdAt, fee bps at creation, status), fills, collections, tokens, activity, balances of bid orders.
   - Derived state: active / closed / sold / expired / not started / underfunded / token missing from escrow; how and when each is recomputed (time-based states change without events).
   - Listing escrow verification: a listing is only live if `ownerOf(tokenId) == order`.
   - Collection stats (floor, top offer, listed, volume, sales) and how "price now" is computed for sorting given prices move every block.
   - Reorg handling, backfill, re-indexing, and how the app reads from it (GraphQL, REST, or SQL).
5. **App**:
   - Routes and screen-to-component map for all 8 sections.
   - Data fetching: what comes from the indexer vs live RPC reads (always re-quote via `quote()` before any transaction).
   - Price display: client-side `priceAt` that matches the contract's rounding exactly; refresh cadence.
6. **Transaction flows**, step by step with contract calls, wallet prompts and failure handling:
   - Create listing (create + transfer, or transfer to `orderAddress` first; recommend one), with salt generation.
   - Buy (`maxPrice`, value, refund).
   - Make offer (single token and collection, funding, quantity, expiry, rising offers' funding requirement).
   - Accept offer (approval per token vs for all, `minProceeds`, revoke).
   - Cancel and withdraw for listings and offers (close, then execute); the closed-not-withdrawn state.
   - Top up an offer.
   - Simulation before every write, gas estimates, pending/confirmed/failed UI.
7. **Error and edge states** mapped to contract errors (`NotStarted`, `Expired`, `AboveMaxPrice`, `Underpaid`, `RoyaltyAboveLimit`, `InsufficientFunds`, `BelowMinProceeds`, `WrongToken`, `NotDelivered`, `BadRoyalty`, `OrderClosed`, `HandlerCodeChanged`) plus incompatible collections (ERC1155, CryptoPunks, nested tokens) and royalty receivers that refuse ETH. Propose UI copy in the design's tone.
8. **Security**: approval UX and what to tell users, verifying order authenticity, never trusting events from unknown addresses, simulation, phishing considerations from `NFT_TRADING.md`, CSP, RPC key handling.
9. **Design system implementation**: how tokens from `README.md` / `STYLE_GUIDE.md` become code (CSS variables, Tailwind config or CSS modules), fonts, responsive strategy between the 1440 and 390 designs, RainbowKit theming to match (square, black, white).
10. **Testing**: contract interaction tests against an Anvil fork with the Market contracts deployed; indexer tests with fixtures; e2e (Playwright) covering each flow; price-schedule parity tests against `priceAt`.
11. **Deployment and environments**: local (Anvil + local indexer), Sepolia, mainnet readiness; env vars; monitoring.
12. **Milestones**: an ordered breakdown into reviewable PRs, each with scope and acceptance criteria.
13. **Risks**: what could go wrong and how the plan reduces it.

## Rules

- Do not modify the protocol repo. If the UI seems to need a contract change, write it up as a question.
- Do not deploy contracts or sign transactions.
- Match the design exactly for layout, copy and tokens; propose changes only where the protocol requires them, and list them.
- Fee figures in the design use today's 1% rate. Always read the real rate (`FeeConfig.feeBps()` for new orders, `quote()` for existing ones).
- When finished, stop and wait for my review of `PLAN.md`.
