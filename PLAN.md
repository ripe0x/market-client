# Market client: original V1 plan and rights milestone

The plan below records the 2026-11-16 order-only build and its original decisions. It is historical where it assumes nothing is deployed or the protocol is pinned to `d6b2073`: the legacy order-only Sepolia release is verified, and the current rights client candidate pins protocol `484223e`. Later [decisions](DECISIONS.md), [status](STATUS.md) and the [deployment runbook](DEPLOYMENT.md) control current work. Preserve the original `handoff/` design as its own input.

## Current rights milestone, 2026-11-17

**Outcome:** on the local rights release, a user can issue a collateralized NFT purchase right, sell and resell the entitlement without moving backing, then exercise at its committed price or expire/surrender and recover only as committed. Keep ordinary listings, bids and the verified legacy Sepolia release accessible. The right token and backing account have distinct identities; `Rights.ownerOf` is authoritative. The shared collection's metadata is generic identity and liveness, while the covered handler's config and activation terms determine price and royalty.

**Acceptance:** verify a backed issue, primary premium, secondary premium, exact-price exercise, credit release, listing cancel, deadline boundary, expiry and residual recovery; reject pending, expired and terminal right-token trading. Check a second sequence in which AtomicWallet issuance fails and every effect rolls back. Package, indexer and browser tests must use actual local contracts and the configured release identity. A separate frozen release milestone covers public Sepolia, isolated indexer catch-up, a signed walkthrough and explicit owner broadcast authority.

**Boundaries:** `deployments/legacy-sepolia.json` is historical deployed evidence. `deployments/rights-sepolia.json` is a candidate with `startBlock: null`; its computed addresses are not deployed code. The indexer must refuse that candidate and use a separate schema when rights are deployed. The web app must not enable writes for a missing or mismatched deployment. Public Sepolia still selects `legacy-v1` by default. Do not merge, push or broadcast under this implementation milestone.

---

## 1. Summary

A Next.js (App Router) web app, a Ponder indexer on Postgres, and a shared TypeScript package of protocol logic, all in one pnpm workspace in this repo. Users connect with RainbowKit, browse listings and collections discovered only from `Market.Created` plus `Sold`, `Bought`, `Filled` and `Closed`, and trade ERC721s for native ETH through `NFTSale` and `NFTBid` orders: create a listing (create, then move the NFT in), buy, make a fixed-price offer for one token or any token of a collection, accept an offer (approve `NFTBid`, then fill), top up, and cancel then withdraw. Every write is preceded by a live `quote()` and a simulation; the indexer is used for discovery, sorting and history, never as the authority on whether an order can fill. The UI matches the handoff for layout, copy and tokens, with the protocol-required changes listed in §2.3. Sepolia first, mainnet only after the protocol is audited and deployed by its owner.

---

## 2. Open questions for you

**Decided:** every question below was settled on its recommendation; the record, with what still needs the owner (Sepolia deployment, accounts, keys), is [DECISIONS.md](DECISIONS.md). Q1–Q17 map to D1, D30, D27, D28, D31, D29, D30, D3, D4, D5, D6, D8, D11, D9, D32, D26, D10. That file wins where it and this section differ.

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| Q1 | **"Market fee" label.** The core takes nothing; `NFTSale`/`NFTBid` charge the fee from `FeeConfig`, paid to `0xD4ba…7e72`. | (a) keep "Market fee" (b) "Fee" (c) "Trading fee" | **(a)** if "Market" is the product name and the recipient is the product's operator. The rate shown is always read from chain. |
| Q2 | **Items / Owners / wallet holdings.** Not protocol data. Create listing, "In your wallet 2" and the Accept-offer picker also need "which NFTs does this wallet own", which ERC721 cannot answer without `Enumerable`. | (a) Alchemy NFT API (metadata, media, owners count, totalSupply, wallet holdings; Sepolia supported) (b) index every `Transfer` of every traded collection (c) drop Items/Owners | **(a)**, server-side key, behind one small adapter so it can be swapped. (b) is heavy for large collections and still leaves metadata unsolved. |
| Q3 | **Chains.** | (a) Sepolia now, mainnet later, one chain per deployment (b) one app switching chains | **(a)**: `sepolia.<domain>` and later `<domain>`, each with its own indexer. No chain switcher in V1. |
| Q4 | **Contract addresses.** Sepolia must be redeployed (`STATUS.md`): `Market`, `FeeConfig`, `NFTSale`, `NFTBid`. Planned CREATE2 addresses: Market `0x7c91…1FD4`, FeeConfig `0x9A18…06fF`, NFTSale `0xfEf3…c2c8`, NFTBid `0x8dbB…017E`. | Who deploys and when? | You deploy from the protocol repo per `DEPLOYMENT.md` (I will not). Until then all work runs on local Anvil, where `Deploy.s.sol` produces the same addresses. I need the Sepolia deployment block for `startBlock`. |
| Q5 | **Production RPC.** Your global rule says Tenderly's public gateway for mainnet. A production indexer needs reliable `eth_getLogs` and polling volume a public gateway may rate-limit. | (a) Tenderly public everywhere (b) Tenderly public for dev, tests and scripts; a keyed provider (Alchemy, same account as Q2) for the production indexer and server reads | **(b)**, if you approve the exception for production. Dev, tests and fork work use `https://sepolia.gateway.tenderly.co` / `https://mainnet.gateway.tenderly.co`. |
| Q6 | **Hosting.** | (a) Netlify (web) + Fly.io (Ponder + Postgres) (b) Fly.io for all (c) your own infra (`ripe-infra`?) | **(a)**: least ops. Ponder needs a long-running process and Postgres, so not Netlify. |
| Q7 | **NFT metadata and media.** | (a) Alchemy metadata + cached media URLs, served through our own image route (b) resolve `tokenURI` ourselves (IPFS/Arweave/data URIs) | **(a)** with (b) as fallback for tokens Alchemy has not indexed. Media rendered only as `<img>` through our proxy, never inline SVG/HTML (§8). |
| Q8 | **Royalty limit default** (`maxRoyaltyBps`). | (a) exactly the collection's current rate (b) current + margin (c) fixed 10% | **(a)**: `ceil` of the bps implied by `royaltyOf` at both the start and end price. Dropdown: "Collection asks X%" (default), 0%, 2.5%, 5%, 7.5%, 10%, "No limit" (10,000). No ERC2981: default 0% labelled "Collection asks none". |
| Q9 | **Listing expiry options.** Design: Never / 30D / 90D, default Never. Offers: 1D / 3D / 7D / 30D / Never. | Default offer expiry? | Keep design options. **Offer default 7D** (an offer holding ETH forever is rarely intended). Confirm. |
| Q10 | **Prices that move between quote and inclusion.** A rising listing bought at "1.42" reverts `AboveMaxPrice` one block later; a falling collection offer accepted at "0.517" reverts `BelowMinProceeds`. | (a) bound at the quoted price (fails often on moving prices) (b) bound at the price 2 minutes ahead and show that bound | **(b)**: `maxPrice = max(priceAt(t), priceAt(t+120))`, `minProceeds` from `min(...)`. The CTA states the bound ("Buy for 1.43 ETH", "You pay at most 1.43 ETH"). Fixed prices are unaffected. |
| Q11 | **Rising listings.** The design shows them (`#87 1.52 to 2.00`) but the Create form does not say whether End price may exceed Start. | Allow or block in the form? | **Allow** (protocol supports it, the tables already show it). |
| Q12 | **Approval to `NFTBid`.** | (a) per token only (b) per token default, "Approve all" as an option | **(a)** in V1, plus approve-and-sell in one prompt when the wallet supports atomic batches (EIP-5792). Existing approve-all is detected, skipped and shown with a Revoke link. |
| Q13 | **Collection curation.** Anyone can list a token of a hostile contract named "Driftlines". | (a) fully permissionless (b) permissionless, plus a reviewed denylist file in this repo hiding known impersonators from browse/search (orders stay reachable by address) | **(b)**, and always show the full contract address on collection and token screens. |
| Q14 | **Activity amounts.** Design shows Sold 0.940 (looks net) and Offer filled 0.30 (price). | Gross or net? | Sold: **what you received** (price − fee − royalty). Bought / Offer filled: **what you paid** (price). Accepting someone's offer is also "Sold". |
| Q15 | **WalletConnect.** RainbowKit needs a Reown project ID. | | Please create one (domain-restricted). |
| Q16 | **Error monitoring.** | (a) Sentry (b) none in V1 | **(a)** for the web app only; costs nothing at this scale. |
| Q17 | **Volume figures and wash trades.** A seller can buy their own listing for ≤1% fee + gas and inflate Volume/Sales. | (a) count all genuine fills (b) exclude fills where buyer == order owner | **(b)**, cheap and catches the obvious case. Disclosed in the footer copy only if you want it. |

### 2.1 Design review: ambiguous or missing

1. **Accept offer on desktop is not designed** (only mobile). Plan: same content in the right-hand 520px panel of the token or collection page, following the two-column pattern.
2. **Search** has no results design. Plan: dropdown under the 520×42 field, two groups (Collections, Tokens), mono labels, keyboard navigable; matches collection name, symbol, address, and `name #id`.
3. **"All collections ▾"** menu contents not designed. Plan: list of collections with live listings, by volume.
4. **"Listed" column** (`4m ago`): time since the order became live (NFT escrowed) or since `Created`? Plan: since `Created` unless you prefer the deposit time.
5. **"Last sale"** is not scoped. The indexer only knows Market sales. Plan: last sale on Market; "—" otherwise.
6. **Collection "5% artist royalty"** assumes one rate and that the receiver is the artist. ERC2981 is per token and per price and the receiver is any address. Plan: rate from `royaltyOf(nft, sampleTokenId, 1 ether)`, label per your wording, "No royalty" when not reported.
7. **Offers "Remaining"** could mean fills left or fills the balance can pay. Plan: `maxFills − fills`, with an "Underfunded" note when balance < current price.
8. **Positions mobile** shows only an offers note; listings/activity mobile rows are not specified in full. Plan: follow the desktop columns collapsed into the design's `mline` pattern.
9. **Not designed, will follow the visual language** (README lists some): Add funds sheet and Underfunded status; error states (§7); transaction progress (pending / confirmed / failed) per step; approval revoke; wallet connect modal (themed); wrong network; disconnected states for Sell, Positions, Make offer; empty states (no listings, no offers, no NFTs in wallet); loading; 404 collection or token; indexer behind banner; **"Awaiting NFT"** state for a listing whose step 2 never ran, with "Move #15 into it" to resume; **expired listing** in Positions; **sold-out offer with leftover ETH**.
10. **Time formats** ("Sat 14:00", "Fri 6 Nov", "3 Nov"): plan: viewer's local time zone; weekday + time within 7 days, otherwise day + month.
11. **Precision.** Design shows 2–3 decimals. Plan: amounts the user pays are rounded **up**, amounts received rounded **down**, with as many decimals as needed (max 4) so a CTA never understates a payment.

### 2.2 Design vs contracts: conflicts

1. **Accept offer note**: "If the royalty or fee changes before this confirms". An order's fee rate is locked at creation (`FeeConfig.feeBpsOf`); what can change is the **price** (rising/falling offers) and the **royalty**. Proposed: "If the price or royalty changes before this confirms, the sale stops instead of paying you less than 0.517."
2. **Positions, expired offer "Withdraw 0.60 ETH"** (primary, one step). An expired order is still active; recovery is `close()` then `execute()`, **two confirmations** unless the order is already closed. Proposed: keep the label, show the two steps like the other rows ("Close, then withdraw: two confirmations"). Same for expired listings, which the design omits.
3. **"Buy for 1.42 ETH" / "You pay at most 1.42 ETH"** is exact only for fixed and falling prices. For rising listings the bound must be above the current price (Q10).
4. **Collection header royalty** hardcoded as a uniform 5%; see 2.1.6.
5. **Offers created in V1 are fixed price** (the form has one Amount). Rising offers from other apps still display ("Rising to 0.60 by Thu") and are accepted correctly.
6. **Statuses the protocol produces that the design lacks**: Awaiting NFT, Not started, Expired, Sale stopped (royalty above limit), Underfunded, Closed with assets to withdraw, Sold out with ETH left.

### 2.3 Protocol review: rules confirmed from code

All at `d6b2073`. File references are in the protocol repo.

| Rule | Code | What the UI does with it |
| --- | --- | --- |
| **Price schedule** | `NFTTrade.priceAt`: `t >= endTime` → `endPrice`; `t <= startTime` → `startPrice`; else `start ∓ (|end−start| × (t−start)) / (end−start)` with integer division. Falling rounds up, rising rounds down. Checked before `endTime`, so `startTime == endTime` is a step. | `priceAt` reimplemented in bigint (identical formula), parity-tested against the contract (§10). Fixed prices use `startTime = endTime = 0`, so they never hit `NotStarted` from clock skew. |
| **Fill window** | `_currentPrice`: `NotStarted(startTime)` if `now < startTime`; `Expired(expiry)` if `expiry != 0 && now >= expiry`. | Not started / Expired are computed at read time from schedule and chain time. |
| **`NFTSale.quote(order, c)`** | Returns `(price, royaltyTo, royalty, fee, feeTo)` in that order. Reverts `ZeroAddress` (proceedsTo 0), `NotStarted`, `Expired`, `RoyaltyAboveLimit`, `BadRoyalty`, or whatever `royaltyInfo` reverts with. **Does not check escrow, `maxPrice` or payment.** | Called before every buy; escrow checked separately with `ownerOf`; the fill is then simulated. |
| **`NFTBid.quote(order, c, tokenId)`** | Same tuple. Reverts `WrongToken`, window errors, `InsufficientFunds(price, balance)`, royalty errors. **Does not check `minProceeds`, ownership or approval.** | Called before every accept; ownership and approval read separately; fill simulated. |
| **Fee locked per order** | `FeeConfig.feeBpsOf(order)` searches the rate history by `Market.createdAt(order)`; a `setFee` applies from `timestamp + 1`, so an order's rate never changes after creation. `feeBps()` is the rate for new orders. `fee = price × bps / 10000` (floor). Recipient is current, not locked. | New orders: `feeBps()`. Existing orders: `feeBpsOf(order)` (never reverts, unlike `quote`), stored by the indexer at creation. Fee figures never hardcoded. |
| **Royalty lookup and cap** | `royaltyOf` (public, uncapped): no ERC165 support for `0x2a55205a` → `(0, 0)`; nonzero royalty with zero receiver → `BadRoyalty`. `_split` caps at `price − fee`. | Previews call `royaltyOf` at the exact prices and apply the cap the same way. |
| **`maxRoyaltyBps`** | `limit = price × maxRoyaltyBps / 10000` (floor), compared with the **capped** royalty → `RoyaltyAboveLimit(royalty, limit)`. `uint16`, so up to 65,535; ≥ 10,000 means no limit. | Default per Q8. Rounding up the default bps avoids a 1-wei refusal when a collection rounds differently. |
| **`maxPrice` and refund** | Input `(recipient, maxPrice)`. `price > maxPrice` → `AboveMaxPrice`; `value < price` → `Underpaid`; refund `value − price` to the caller in the same fill. | Send `value = maxPrice`. Since `price ≤ maxPrice = value`, `Underpaid` cannot occur from this app. |
| **`minProceeds`** | Input `(tokenId, minProceeds, proceedsTo)`; `proceeds = price − royalty − fee`; below → `BelowMinProceeds`. `proceedsTo` 0 → `ZeroAddress`. `value != 0` → `UnexpectedETH`. | `minProceeds` per Q10; `proceedsTo` = connected account; value 0. |
| **`maxFills` and `fills(order)`** | `n = ++fills[order]`; closes when `n >= maxFills`, so 0 and 1 both mean one. `fills` is public. | "2 of 5" = `fills / max(maxFills, 1)`. Indexer counts `Bought`; cross-checked against `fills()` in tests. |
| **Bid funding and top-up** | Paid from `order.balance`. Funded by `create{value}` or plain ETH to the order (`receive`, from anyone, **no event**, **accepted even after close**). Owner cannot withdraw while active. | Balances are polled (no event exists). "Add funds" offered only to the owner, only while active. |
| **Approval to `NFTBid`, not the order** | `NFTBid._transfer` calls `nft.transferFrom(caller, recipient, id)` itself; `_requireFill` limits it to genuine fills where the holder called `fill`. | Approve `NFTBid` address (from config), never an order address. Never ask anyone to approve an order (finding A1). |
| **Close, then execute** | `close()` owner-only outside a fill, permanent, emits `Closed()`. After close, `execute(target, value, data)` owner-only. Listing: `execute(nft, 0, transferFrom(order, owner, id))`. Bid: `execute(owner, balance, "")`. | Two confirmations, or one atomic batch when supported (§6.5). |
| **`_requireFill` and events** | Handlers accept `onFill` only from a 149-byte ERC-1167 clone of Market's implementation, bound to that handler, while `filling()`. So `Sold`/`Bought` **from the real handler addresses** always describe a settled fill. They do **not** prove Market created the order: a clone deployed by anyone else passes (`test_cloneOutsideMarketIsStillAnHonestOrder`). | Indexer accepts handler events only from configured handler addresses **and** only for orders already known from `Market.Created` (§4.2). |
| **`orderAddress`** | `predictDeterministicAddressWithImmutableArgs(impl, owner‖handler‖handler.codehash‖configHash, salt)`. Only `owner` can create it (owner = `msg.sender`). | Used to cross-check the address `create` returns in simulation, and to verify an order (§8). |
| **Order identity** | `owner()`, `handler()`, `handlerCodehash()`, `configHash()` read from clone code; `Market.createdAt(order) != 0` only for Market-created orders. | `verifyOrder()` before every write (§8). |
| **Delivery** | `_deliver` reverts `NotDelivered` if `recipient` already owns the token or `ownerOf` is not `recipient` afterwards; `ZeroAddress` for recipient 0. | Recipient = connected account. |

### 2.4 Where I disagree with `PROTOCOL_REVIEW.md`

1. **Data notes, "Index … Sold / Bought / Filled / Closed from trusted handler addresses only."** `Filled` and `Closed` are emitted by **order** addresses, not handlers. And trusting the handler address is not enough: a genuine `Sold` can belong to a clone Market never created. Both checks are needed (§4.2).
2. **Missing: two state changes emit no protocol event.** Top-ups (plain ETH to `receive`) and the NFT deposit into a listing (an ERC721 `Transfer` on the collection) are invisible to an indexer of Market events. Bid balances and listing escrow must be **polled** (§4.6). This contradicts the brief's hope that discovery works "from events alone": discovery does; liveness does not.
3. **#6 "read `quote()` for existing orders' fee."** `quote()` reverts for expired, not-started, underfunded or royalty-blocked orders. Use `FeeConfig.feeBpsOf(order)` for display; `quote()` for the pre-transaction check.
4. **#12 rising offer funding.** Correct as a requirement for *all* fills to succeed, but the protocol does not enforce it at creation and partial fills still settle while funds last. Moot for creation in V1 (fixed offers only); relevant for displaying others' rising offers as Underfunded.
5. **#18 two-step cancel** is right, but the review keeps the design's one-step "Withdraw" on expired offers; expiry does not close an order (2.2.2).
6. **#20 "anyone can add ETH".** True, and ETH sent to a **closed** order still lands and becomes the owner's. The UI must not offer top-up on closed orders, and should not invite third parties to top up.
7. **#21 fill failures** should also list: the **fee recipient** refusing ETH (blocks every fill on the deployment until the `FeeConfig` admin changes it), and `proceedsTo` refusing ETH.
8. **Missing: moving prices vs slippage limits** (Q10) and the copy error about the fee changing (2.2.1).

---

## 3. Architecture

```
                          ┌───────────────────────────────────────────┐
 Browser                  │ Next.js app (Netlify)                       │
 ┌───────────────────┐    │  RSC pages ─────────────► Indexer REST API │
 │ React client      │◄──►│  /api/media/[...] image proxy (cache)      │
 │  RainbowKit/wagmi │    │  /api/nfts/*  NFT API adapter (key here)   │
 │  viem: quote,     │    └───────────────┬───────────────────────────┘
 │  simulate, write  │                    │ server-only keys
 └───┬───────────┬───┘                    ▼
     │ reads,    │ GET /api/*        ┌──────────────┐
     │ txs       └──────────────────►│ Ponder       │ realtime + backfill
     ▼                               │ (Fly.io)    │ eth_getLogs, multicall
 ┌──────────┐   wallet signs         │  handlers    │◄──────────────┐
 │ Wallet   │──────────────────────► │  /api/* Hono │               │
 └──────────┘   to Ethereum          └──────┬───────┘               │
     │                                      ▼                       │
     ▼                               ┌──────────────┐        ┌──────┴─────┐
 ┌────────────────────────┐          │ Postgres     │        │ RPC        │
 │ Ethereum (Sepolia/main)│◄─────────┤ ponder schema│        │ (Q5)       │
 │ Market, Order clones,  │          └──────────────┘        └────────────┘
 │ NFTSale, NFTBid,       │                                  ┌────────────┐
 │ FeeConfig, ERC721s     │                                  │ Alchemy NFT│◄─ /api/nfts, /api/media
 └────────────────────────┘                                  │ API (Q2,Q7)│
                                                             └────────────┘
```

What runs where:

| Piece | Runs | Responsibility |
| --- | --- | --- |
| `apps/web` | Netlify | Pages, wallet, live reads (`quote`, `ownerOf`, balances, approvals), simulation, writes, media proxy, NFT-API adapter. No database, no protocol state of its own. |
| `apps/indexer` | Fly.io, one per chain | Ponder: events, polling, derived state, REST API. |
| Postgres | Fly.io | Ponder's tables and RPC cache only. |
| `packages/protocol` | library, used by both | ABIs, addresses + expected code hashes, `priceAt`, config codecs, fee/royalty split math, error decoding and copy keys, transaction builders, `verifyOrder`. |
| `contracts/market` | git submodule, pinned to `d6b2073` | Read-only: ABIs via `@wagmi/cli` foundry plugin, and `Deploy.s.sol` for local Anvil. Never modified. |

Repo layout:

```
apps/web            Next.js
apps/indexer        Ponder
packages/protocol   shared TS
contracts/market    submodule (ripe0x/market @ d6b2073)
test/contracts      Solidity test collections for local chains (ERC721+2981, hostile receiver, ERC1155)
scripts/            local chain boot, deploy, seed scenarios
handoff/            design handoff (unchanged)
```

---

## 4. Indexer

### 4.1 Choice: Ponder

**Recommended: Ponder** (pin the current stable at M0), self-hosted on Postgres.

| | Fits this protocol because | Against |
| --- | --- | --- |
| **Ponder** | Its `factory()` source registers child addresses from an event parameter: `Created.order` is exactly that, so `Filled`/`Closed` are indexed only from Market-created orders. Static sources for the two handlers. `blocks` sources give interval jobs for the polling this protocol needs (§4.6). `context.client` reads (`readContract`, multicall) are cached per block. Built-in reorg handling, TypeScript + viem end to end, Hono API with Drizzle for custom SQL (price-now sorting). | Self-hosted; schema changes trigger a full reindex (fine at this size). |
| Envio HyperIndex | Fast HyperSync backfill; can register contracts from decoded data (could index each collection's `Transfer`). | Hosted-first; the extra power (indexing collections) is what Q2 avoids. |
| The Graph | Mature hosting. | AssemblyScript, no TS/viem sharing; block handlers for polling are slow and costly; decoding `bytes` configs is clumsy. |
| Custom viem + Postgres | Full control. | Re-implements reorgs, backfill, caching. |

### 4.2 Sources, trust and fake-order rejection

| Source | Address | Events | Start block |
| --- | --- | --- | --- |
| `Market` | configured per chain | `Created(order, owner, handler, salt, config)` | Market deployment block |
| `Order` (factory) | `factory({ address: Market, event: Created, parameter: "order" })` | `Filled(caller, value)`, `Closed()` | same |
| `NFTSale` | configured | `Sold(order, buyer, recipient, price, royalty)` | same |
| `NFTBid` | configured | `Bought(order, seller, tokenId, price, royalty)` | same |
| `poll` (blocks) | — | interval job, realtime only (§4.6) | head at start |

Trust rules, applied in handlers:

1. **Only the configured `Market`** emits accepted `Created`. Addresses live in `packages/protocol/addresses.ts` with expected runtime code hashes; the indexer checks `getCode` hashes at startup and refuses to run on a mismatch.
2. **Only `handler ∈ {NFTSale, NFTBid}`** creates an order row. Other handlers are ignored; their `Filled`/`Closed` find no row and are dropped.
3. **`Sold`/`Bought` only from the configured handler addresses** (Ponder only listens there), **and only applied if `order` has a row** from `Created`. A genuine fill of a clone Market never created is logged and dropped.
4. **`Filled`/`Closed` only from factory-registered order addresses.**
5. The order row is keyed by the address from `Created`, which Market itself derived from `msg.sender`, so `owner` is trustworthy.

### 4.3 Decoding `Created.config`

`decodeAbiParameters` with the struct types generated from the protocol ABI:

- `NFTSale.Config`: `(address nft, uint256 tokenId, (uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 endTime, uint256 expiry) schedule, address proceedsTo, uint16 maxRoyaltyBps)`
- `NFTBid.Config`: `(address nft, bool anyToken, uint256 tokenId, (…) schedule, address recipient, uint256 maxFills)`

`Market.create` does not validate configs. Decode failure, `proceedsTo == 0` (sale, `quote` always reverts), `recipient == 0` (bid, delivery always reverts) or `nft` not reporting ERC721 via ERC165 marks the row `valid = false`: kept for the owner's Positions (so they can close and recover) and hidden from browse. The raw `config` bytes are stored: every fill needs them.

### 4.4 Schema (Ponder `onchainTable`)

`order`
| column | type | source |
| --- | --- | --- |
| `address` (pk) | hex | `Created.order` |
| `kind` | `'sale' \| 'bid'` | handler |
| `owner`, `handler`, `salt` | hex | `Created` |
| `config` | hex | `Created.config` |
| `valid` | bool | §4.3 |
| `nft`, `tokenId`, `anyToken` | hex, numeric, bool | config (`anyToken` false for sales) |
| `startPrice`, `endPrice`, `startTime`, `endTime`, `expiry` | numeric | config |
| `maxFills` | numeric | bid config |
| `maxRoyaltyBps` | int | sale config |
| `proceedsTo` / `recipient` | hex | config |
| `createdAt`, `createdBlock`, `createdTx` | int, bigint, hex | event block (= `Market.createdAt`) |
| `feeBps` | int | `FeeConfig.feeBpsOf(order)` read at the creation block; immutable afterwards |
| `closed`, `closedAt`, `closedTx`, `closedByFill` | bool, int, hex, bool | `Closed`; `closedByFill` when a `Sold`/`Bought` for the order is in the same tx |
| `fills` | int | count of `Sold`/`Bought` |
| `balance`, `balanceBlock` | numeric, bigint | poll + after each event |
| `escrowed`, `escrowBlock` | bool, bigint | sales: `ownerOf(tokenId) == order`, poll |
| `quoteError`, `quoteBlock` | text \| null, bigint | poll: decoded revert of `quote` (e.g. `RoyaltyAboveLimit`) |

`fill`: `id` (tx hash + log index), `order`, `kind`, `nft`, `tokenId`, `price`, `royalty`, `fee` (`price × order.feeBps / 10000`), `proceeds`, `buyer` (sale: `Sold.buyer`; bid: order owner), `seller` (sale: order owner; bid: `Bought.seller`), `recipient`, `value` (from `Filled`, for refunds), `timestamp`, `block`, `tx`, `selfTrade` (buyer == seller).

`collection`: `address` (pk), `name`, `symbol`, `isERC721`, `isERC1155`, `supports2981`, `firstSeenBlock`. Read once with `readContract` on first sight.

`token`: (`nft`, `tokenId`) pk, `lastSalePrice`, `lastSaleAt`.

Activity is a query over `fill` joined to `order` for the viewer, not a separate table. Bid balances are a column on `order`, not a table. Approvals are not indexed (read live).

Indexes: `order(nft, kind)`, `order(owner)`, `order(nft, tokenId)`, `fill(nft, timestamp)`, `fill(buyer)`, `fill(seller)`.

### 4.5 Derived state

Stored (event-driven): `closed`, `closedByFill`, `fills`. Polled: `balance`, `escrowed`, `quoteError`. **Time-based states are never stored**; every query computes them from `now` (chain head timestamp passed by the caller).

| State | Sale | Bid | Recomputed |
| --- | --- | --- | --- |
| Sold / Sold out | `closedByFill` | `closed && fills >= max(maxFills,1)` | event |
| Cancelled | `closed && !closedByFill` | `closed && fills < max(maxFills,1)` | event |
| Withdrawable | closed and (`escrowed` or `balance > 0`) | closed and `balance > 0` | event + poll |
| Awaiting NFT | open, `!escrowed` | n/a | poll (fast lane) |
| Not started | `now < startTime` | same | query time |
| Expired | `expiry != 0 && now >= expiry` | same | query time |
| Blocked | `quoteError` set (royalty above limit, bad royalty) | `quoteError` other than funds | poll |
| Underfunded | n/a | `balance < priceAt(now)` | query time over polled balance |
| **Live** | open, valid, escrowed, started, not expired, no `quoteError` | open, valid, started, not expired, `balance >= priceAt(now)` | query time |

### 4.6 Polling (`blocks` source, realtime only)

Skipped during backfill (historical polling would multiply RPC cost for nothing). Each run uses one multicall batch (Multicall3, `allowFailure`):

- **Fast lane, every block**: sales open and not yet escrowed, created in the last 7 days: `ownerOf(tokenId)`. Makes step 2 of listing visible within one block.
- **Normal lane, every 5 blocks (~1 min)**: every open order: sales `ownerOf` + `NFTSale.quote(order, config)`; bids `Multicall3.getEthBalance(order)` + `NFTBid.quote(order, config, tokenId)`; closed orders with assets: balance / `ownerOf`.
- Orders older than 7 days awaiting NFT: hourly.

`quote` reverts are decoded with the handler ABI into `quoteError`; window and funds errors are ignored there because SQL computes them.

Listing escrow rule: **a listing is shown as live only if `ownerOf(tokenId) == order`** as of the last poll. The app re-reads it live before any buy.

### 4.7 Price now, stats and sorting

`price_now(now)` in SQL, matching `priceAt` exactly (Postgres `numeric` handles uint256; `div()` truncates like Solidity on non-negative values):

```sql
CASE
  WHEN :now >= end_time   THEN end_price
  WHEN :now <= start_time THEN start_price
  WHEN end_price < start_price
    THEN start_price - div((start_price - end_price) * (:now - start_time), end_time - start_time)
  ELSE start_price + div((end_price - start_price) * (:now - start_time), end_time - start_time)
END
```

Sorting by price uses this expression with `:now` = the head timestamp the client is rendering at, so order and displayed prices agree. Between refetches the client re-renders prices every block from the schedule; order can drift by a block, which is acceptable.

Collection stats, per request:
- **Floor**: `min(price_now)` over live sales.
- **Top offer**: `max(price_now)` over live bids with `anyToken` (token page also includes that token's single offers).
- **Listed**: count of live sales.
- **Volume / Sales (24H/7D/30D)**: `sum(price)`, `count(*)` over `fill` in the window, excluding `selfTrade` (Q17).
- **Items / Owners**: NFT API (Q2), not the indexer.

### 4.8 Reorgs, backfill, reindex, API

- Reorgs: Ponder rolls back to the common ancestor and replays; poll results are written by block and rolled back with it.
- Backfill from the Market deployment block; RPC responses cached in Ponder's sync tables, so restarts are cheap.
- Reindex: deploy a new Ponder instance under a new schema name, wait for `/ready`, switch the API, drop the old schema. Zero downtime, no migration code.
- **API: custom REST in Ponder's Hono server** (`/api/listings`, `/api/collections`, `/api/collections/:nft`, `/api/collections/:nft/offers`, `/api/tokens/:nft/:id`, `/api/accounts/:addr/positions`, `/api/accounts/:addr/activity`, `/api/search`, `/api/status`), zod-validated params, cursor pagination, response types exported from `packages/protocol`. Reason over GraphQL/SQL-over-HTTP: the important queries need the `price_now(:now)` expression and aggregates; one typed path is simpler than two.

---

## 5. App

### 5.1 Framework

**Next.js App Router** (pin current stable at M0), React, TypeScript strict. Server components render collection and token pages from the indexer (fast first paint, shareable links); all wallet, quote and transaction work is client-side with wagmi + viem + TanStack Query (wagmi's dependency). Route handlers host the NFT API adapter and media proxy so keys stay server-side.

### 5.2 Routes and screens

Collections are addressed by contract address, never by name (impersonation).

| # | Screen | Route | Main components |
| --- | --- | --- | --- |
| 01 | Marketplace · Listings | `/` (`?collection=&sort=newest\|price_asc\|price_desc&view=table\|grid`) | `TopBar`, `GiantTabs`, `Toolbar`, `CollectionMenu`, `SortOptions`, `ViewToggle`, `ListingsTable` (`TokenCell`, `PriceFigure`, `PricingCell` + `ProgressBar`, `BuyButton`), `MediaGrid`, `TableFooter` |
| 02 | Marketplace · Collections | `/collections` (`?period=24h\|7d\|30d`) | `GiantTabs`, `PeriodToggle`, `CollectionsTable` (two-tier header), `TableFooter` |
| 03 | Collection · Listings | `/c/[nft]` | `CollectionHeader` (`StatBlock` groups), `InlineTabs`, `ListingsTable` (Seller column), `MakeOfferButton` |
| 04 | Collection · Offers | `/c/[nft]/offers` | `CollectionHeader` (compact), `OffersTable` (`SellButton` when eligible) |
| 04 | Accept offer | `/c/[nft]/offers/[order]/sell` (mobile page; desktop right panel) | `AcceptOffer`: `NftPicker`, `Breakdown`, `StepList`, `TxButton`, approval note |
| 05 | NFT detail | `/c/[nft]/[tokenId]` | `TokenMedia`, `TokenTitle`, `PriceFigure` (76px), `PriceScheduleChart`, `BuyPanel`, `TokenOffers`, `KeyValueRows`, `MoreFromCollection` |
| 06 | Create listing | `/sell` (`?nft=&id=`) | `WalletNfts` (3-col), `ListingForm` (`FormCell`, `Toggle`, `Segmented`, `RoyaltyLimitMenu`), `PriceScheduleChart`, `Breakdown` (At start / At end), `StepList`, `TxButton` |
| 07 | Make offer | `/c/[nft]/offer` (collection), `/c/[nft]/[tokenId]/offer` (single) | `OfferLadder` (yours highlighted), `OfferForm` (`Stepper`, `Segmented`), `CommitSummary`, `TxButton` |
| 08 | Positions | `/positions` (`?tab=listings\|offers\|activity`), opened by the wallet button | `PositionsListings`, `PositionsOffers`, `ActivityTable`, `ApprovalsRow`, `AddFundsSheet` |

Shared primitives (one file each, CSS Modules): `Button` (primary/secondary/text, 40/58/64), `Input`, `Segmented`, `Toggle`, `Stepper`, `InlineTabs`, `DataTable`, `StatBlock`, `KeyValueRows`, `Sheet`, `MobileNav` (`← | title | ···`, `Cancel | title |`), `BottomCta`, `Address` (middle truncation, copy, explorer ↗), `Amount` (round up for pay, down for receive).

### 5.3 Data: indexer vs live RPC

| Data | Source |
| --- | --- |
| Lists, sorting, stats, history, positions, search | Indexer REST |
| Token media, names, wallet holdings, Items/Owners | `/api/nfts/*` (NFT API adapter) |
| Chain time | `useBlock({ watch: true })` head timestamp |
| Price shown | client `priceAt(schedule, head.timestamp)`, recomputed each block |
| Detail page liveness | live: `ownerOf`, `order.closed()`, balance, `quote` |
| Before **every** write | live: `verifyOrder`, `quote`, ownership/approval, then `simulateContract` |
| New-order previews | live: `FeeConfig.feeBps()`, `royaltyOf(nft, id, price)` on the handler |

After a confirmed transaction the UI updates from the receipt immediately and waits for the indexer (`/api/status` block ≥ receipt block) before refetching lists.

### 5.4 Price display

- `packages/protocol/schedule.ts` exports `priceAt(s, t)` (bigint, same formula and branch order as the contract), `priceRange(s, t0, t1)` (min/max over an interval, used for Q10 bounds), `progress(s, t)` for the 72×2 bar.
- Refresh: every new block (wagmi `watchBlocks`, HTTP polling every 4s; WebSocket if the RPC offers it). No per-second ticking; the footer promises "payable at the current block".
- Charts: `PriceScheduleChart` draws the schedule exactly (two points and a hold segment), past solid `#b5b5b5`, future dashed `#444`, 4px `#fff` dot at head time.

---

## 6. Transaction flows

Common to every write, in `useTxFlow(steps)`:

1. Preconditions read live (per flow below).
2. `simulateContract` (viem) with the exact args, value and account. A revert is decoded (§7) and shown in place of the CTA; nothing is sent.
3. `estimateGas` + `estimateFeesPerGas` → "Network gas about 0.0004 ETH".
4. `writeContract`. States: **Confirm in wallet** → **Pending** (tx link ↗) → **Confirmed** or **Failed** (decoded reason). Wallet rejection returns to the previous state with a muted "Cancelled in wallet."
5. Multi-step flows show the design's numbered `StepList`; each step's state is derived from chain, so reloading resumes at the right step.
6. **Atomic batch** when `useCapabilities` reports `atomic` support for the chain (EIP-5792 `wallet_sendCalls`): the steps go in one prompt. Otherwise sequential.

### 6.1 Create listing

**Recommendation: create, then transfer** (not transfer to `orderAddress` first).
Reason: if the flow stops after step 1, the user holds an empty, closable order. If it stops after a transfer-first, the NFT sits at a codeless address recoverable only by re-creating with the identical config and the random salt, which a closed tab loses.

1. Preconditions: connected; `ownerOf(id) == account`; collection reports ERC721; not ERC1155; not a known incompatible contract (CryptoPunks); no existing open, un-escrowed listing of this token by this owner (if one exists, offer **"Move #15 into it"** to resume instead of creating another).
2. Build config: `{ nft, tokenId, schedule, proceedsTo: account, maxRoyaltyBps }`.
   - Fixed: `(p, p, 0, 0, expiry)`.
   - Changing: `startTime = head.timestamp`, `endTime = startTime + duration`; `expiry = 0` or `startTime + 30D/90D`. Warn if `expiry < endTime`.
   - `salt = crypto.getRandomValues(32 bytes)`.
3. Step 1: `Market.create(NFTSale, config, salt)`, value 0. Simulation returns the order address; assert it equals `Market.orderAddress(account, NFTSale, keccak256(config), salt)`.
4. Step 2: re-run `verifyOrder(order)` (createdAt ≠ 0, `owner() == account`, `handler() == NFTSale`, `configHash() == keccak256(config)`), then `nft.transferFrom(account, order, tokenId)`.
5. Done when `ownerOf(tokenId) == order`. Batch path: both calls in one `wallet_sendCalls`.

### 6.2 Buy

1. Preconditions (live): `verifyOrder`; `order.closed() == false`; `ownerOf(tokenId) == order`; `NFTSale.quote(order, config)` succeeds.
2. `maxPrice` = quoted price for fixed/falling; `priceRange(t, t+120).max` for rising (Q10). `value = maxPrice`.
3. `order.fill(config, abi.encode(account, maxPrice))` with `value`. Simulate first.
4. Confirmed: show actual price from the `Sold` log in the receipt and the refund (`value − price`).

### 6.3 Make offer

1. Preconditions: connected; collection reports ERC721; amount > 0; balance ≥ total + gas estimate.
2. Config: `{ nft, anyToken, tokenId (0 when anyToken), schedule: (a, a, 0, 0, expiry), recipient: account, maxFills: quantity }`. Single-token offers: `anyToken = false`, quantity 1.
3. Funding: `value = amount × quantity` (fixed price). If rising offers are added later: `endPrice × remaining`; falling: `startPrice × remaining`.
4. `Market.create{value}(NFTBid, config, random salt)`. One confirmation. CTA "Deposit 2.90 ETH and offer".

### 6.4 Accept offer

1. Preconditions (live): `verifyOrder`; open; `NFTBid.quote(order, config, tokenId)` succeeds (catches underfunded, expired, wrong token); `ownerOf(tokenId) == account` (listed tokens are owned by their order and so excluded); not the viewer's own offer.
2. `minProceeds = priceRange(t, t+120).min − fee − royalty` (fee from `feeBpsOf`, royalty from `royaltyOf` at that price, capped). Shown as "You receive".
3. Step 1 (skipped if `isApprovedForAll(account, NFTBid)` or `getApproved(tokenId) == NFTBid`): `nft.approve(NFTBid, tokenId)`. The spender is the `NFTBid` address from `addresses.ts`, asserted equal to `order.handler()`.
4. Step 2: `order.fill(config, abi.encode(tokenId, minProceeds, account))`, value 0.
5. Batch path: approve + fill in one prompt (what `NFT_TRADING.md` recommends).
6. Revoke: per-token approval is cleared by the sale itself. If the user approved and did not sell, Positions shows "Remove approval for #305" → `approve(0x0, tokenId)`. Approve-all detected anywhere → "Remove approval for all Driftlines" → `setApprovalForAll(NFTBid, false)`.

### 6.5 Cancel and withdraw

| Case | Steps |
| --- | --- |
| Open listing (live, expired, awaiting NFT, blocked) | 1 `order.close()`; 2 `order.execute(nft, 0, transferFrom(order, owner, tokenId))` (skipped if the NFT never arrived) |
| Closed listing still holding the NFT | `execute(...)` only: "Withdraw #3" |
| Open offer (live or expired) | 1 `close()`; 2 `execute(owner, order.balance, 0x)` |
| Closed offer with ETH (cancelled earlier, or sold out with leftover) | `execute(owner, balance, 0x)` only: "Withdraw 0.60 ETH" |
| Stray ETH in any closed order | included in the withdraw step |

`balance` and `ownerOf` are read immediately before step 2. Both steps in one batch when supported. Positions shows "Closed, not withdrawn" rows until the order holds nothing.

### 6.6 Top up an offer

Owner only, offer open. "Add funds" sheet: amount (default: what makes the remaining fills fundable, `price × remaining − balance`). Precondition `order.closed() == false` read live. `sendTransaction({ to: order, value })`. Underfunded status clears on the next balance read (forced immediately after the receipt).

---

## 7. Errors and edge states

Decoded with viem from the combined ABIs of `Order`, `Market`, `NFTSale`, `NFTBid`, `NFTTrade`, plus OpenZeppelin's ERC721 errors (IERC6093). Copy follows the design's tone: plain, present tense, what happened and what to do. A failure caught in simulation says nothing was sent; an onchain failure adds "Network gas was spent."

| Error | Where | Copy |
| --- | --- | --- |
| `NotStarted(startTime)` | buy, accept | "This listing opens Sat 14:00." / "This offer opens Sat 14:00." |
| `Expired(expiry)` | buy, accept | "This listing expired 27 Oct." / "This offer expired 27 Oct." Owner: "Expired. Cancel and withdraw to get #15 back." |
| `AboveMaxPrice(price, maxPrice)` | buy | "The price rose to 1.45 ETH before this confirmed. Nothing was bought." CTA re-quotes. |
| `Underpaid(price, value)` | buy | Not reachable with this app's `value`; generic: "The payment was below the price. Nothing was bought." |
| `RoyaltyAboveLimit(royalty, limit)` | buy; seller Positions | Buyer: "Sale stopped: the collection's royalty is above the seller's limit." Seller: "Sale stopped: royalty 7.5% is above your 5% limit. Cancel and list again to sell." |
| `InsufficientFunds(price, balance)` | accept; owner Positions | Seller: "This offer holds 0.40 ETH, less than its 0.55 ETH price." Owner: "Underfunded. Add funds or cancel." |
| `BelowMinProceeds(proceeds, min)` | accept | "The price or royalty changed before this confirmed. Nothing was sold." |
| `WrongToken(tokenId)` | accept | "This offer is for #212 only." |
| `NotDelivered()` | buy, accept | "The collection did not complete the transfer. Nothing changed." |
| `BadRoyalty(receiver, royalty, price)` | preview, buy, accept | "This collection reports a royalty with no receiver, so it can't be traded here." |
| `OrderClosed()` | buy, accept, top up | "This listing has sold or been cancelled." / "This offer is closed." |
| `HandlerCodeChanged()` | any fill | "This order can't be filled: its handler's code changed." (Not reachable for these handlers; kept for completeness.) |
| `ZeroAddress()` | invalid configs | Order hidden; owner: "This order can never fill. Cancel to recover." |
| `Unauthorized()` | close/execute | "Only the owner can do this." |
| ERC721 `ERC721InsufficientApproval` / non-owner | accept | "Approve #305 for offers first." / "You no longer hold #305." |
| Unknown revert with royalty > 0 | buy, accept | Diagnose with `eth_call` from the order to `royaltyTo` with the royalty as value (state override for balance). Refuses → "The royalty receiver for this collection refuses ETH, so it can't be traded right now." Same probe for the fee recipient: "Trading is paused: the fee recipient refuses ETH." |
| Collection ERC1155 | sell, offer | "Market trades ERC721 tokens. This collection is ERC1155." |
| CryptoPunks (known address) | sell, offer | "CryptoPunks aren't ERC721. Use a wrapped Punk." |
| Nested / transfer-locked (Moonbirds) | caught by simulation | "This token can't move right now, for example while nested. Nothing was sent." |
| Wrong network | any | "Switch to Sepolia to continue." with a switch button. |
| Indexer behind > 20 blocks | global | Mono banner: "Showing data from 2 minutes ago." |

---

## 8. Security

1. **Approval UX.** Only ever request approval for the `NFTBid` address from `addresses.ts`, and assert `order.handler() == NFTBid` before asking. Never ask for approval to an order (finding A1). Per token by default; approve-all only displayed and revocable. Copy under the step: "Approval lets offers move #305 only when you sell it yourself. Remove it any time." Positions has an Approvals row listing live approvals to `NFTBid` with Remove.
2. **Order authenticity** (`verifyOrder`, before every write and on detail pages): `Market.createdAt(order) != 0`; `handler()` is the configured `NFTSale`/`NFTBid`; `configHash() == keccak256(config)`; `owner()` matches the indexer. Fills with a wrong config revert anyway (`WrongConfig`); this check stops a tampered indexer or URL from steering the user.
3. **Events.** Only from configured addresses, only for Market-created orders (§4.2). The app never treats indexer data as proof: liveness and money figures are re-read before signing.
4. **Contract identity.** At startup, web and indexer compare deployed runtime code hashes with values generated from the pinned protocol build; mismatch disables trading with an error.
5. **Simulation** before every write; decoded failure blocks the CTA.
6. **Phishing (`NFT_TRADING.md`).** Anything that makes the user's account call `fill` can sell approved tokens, one per signed fill. Mitigations: `minProceeds` and `proceedsTo = account` always set by the app and shown; the confirm panel states "Sell #305 for at least 0.517 ETH to 0x7a…e41"; no deep link performs a write; recipient/proceeds addresses are never taken from URL params. FAQ copy (not in product UI) explains approvals.
7. **Impersonation.** Collections keyed by address; full address shown in collection header and token "Contract and token"; denylist per Q13.
8. **Untrusted metadata.** Token names/descriptions rendered as text only. Media through `/api/media` (content-type allowlist: png, jpeg, gif, webp, svg, mp4; size cap), rendered with `<img>`/`<video>` only; SVG never inlined (an `<img>` SVG cannot run script). `animation_url` HTML not rendered in V1.
9. **CSP** (Next middleware, nonce-based): `default-src 'self'`; `script-src 'self' 'nonce-…'`; `img-src 'self' data: blob:`; `media-src 'self'`; `connect-src 'self'` + indexer origin + RPC origin + WalletConnect relay (`wss://relay.walletconnect.com`, `https://*.walletconnect.com`, `https://*.walletconnect.org`) + Reown; `frame-src` WalletConnect verify only; `frame-ancestors 'none'`; `form-action 'self'`. Plus HSTS, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`. Fonts self-hosted via `next/font`.
10. **Keys.** NFT API key and production RPC key server-side only. Browser RPC: a separate, domain-restricted key or a `/api/rpc` proxy with a read-method allowlist and rate limit (decide with Q5). WalletConnect project ID is public and domain-restricted. No secrets in `NEXT_PUBLIC_*`, none committed; `.env*` ignored with `.env.example` allowlisted.
11. **Dependencies.** Lockfile committed, exact versions, no install scripts from unknown packages (`pnpm` `onlyBuiltDependencies`).

---

## 9. Design system implementation

- **Tokens as CSS variables** in `apps/web/app/tokens.css`, copied from `STYLE_GUIDE.md` §9 (`--bg`, `--ink`, `--ink-2`…`--fill-group`, `--gutter`), plus type roles as variables (`--fs-hero`, `--tracking-display`, …) and the spacing scale.
- **CSS Modules** per component. Recommended over Tailwind: the design is exact pixel values from a fixed token set; modules + variables add no dependency and keep the markup readable. Tailwind v4 with `@theme` is the alternative if you prefer utility classes.
- Global rules: `*{border-radius:0}`, `font-variant-numeric: tabular-nums`, no shadows, 120ms colour/background transitions only.
- **Fonts**: `next/font/google` for Archivo (400/500/700/800) and JetBrains Mono (400/500), self-hosted at build, exposed as `--font-ui` / `--font-mono`.
- **Responsive**: two layouts, as designed. `< 768px` mobile (390 design: 18px gutter, mobile nav, grids, pinned 58px CTA, tap targets ≥ 44px). `≥ 768px` desktop (1440 design, fluid: 40px gutter, tables flex). Two-column `1fr | 520px` screens stack below 1100px with the panel first. Tables below 1200px drop low-priority columns (Last sale, then Listed). Verified at 390, 768, 1024, 1440 in the preview.
- **RainbowKit**: `darkTheme({ accentColor: '#fff', accentColorForeground: '#000', borderRadius: 'none', overlayBlur: 'none', fontStack: 'system' })` then override: `colors.modalBackground '#000'`, `modalBorder '#262626'`, `generalBorder '#333'`, `actionButtonSecondaryBackground 'transparent'`, `connectButtonBackground '#fff'`, `connectButtonText '#000'`, all `shadows` `'none'`, `fonts.body` = Archivo. Wallet button via `ConnectButton.Custom`: 42px, white, mono 500 14px, `0x7a…e41`, opens `/positions`; disconnected label "Connect".
- Logo as inline SVG component (22px square, 2px stroke, diagonal).
- Glyph affordances (↑ ↓ ▾ ← ↗ ··· − + ×) as text, no icon library.

---

## 10. Testing

No mocks, per your rules: real contracts on real (local or forked) chains, real indexer, real Postgres. Hostile collections and receivers are real contracts deployed in tests.

| Layer | Tool | What |
| --- | --- | --- |
| Protocol package | Vitest + Anvil | **Price parity**: 2,000 random schedules × times (including `t == startTime`, `t == endTime`, `startTime == endTime`, huge values) comparing TS `priceAt` with `NFTSale.priceAt` via `eth_call`, and with the SQL expression in Postgres. Config encode → `Created` → decode round trip. Split math vs `quote()` at many prices, bps and royalties, including royalty > price − fee. |
| Contract interaction | Vitest + Anvil with the protocol deployed by its own `Deploy.s.sol` | Every flow builder end to end with **absolute balance checks** using receipt gas (`gasUsed × effectiveGasPrice`, Anvil base fee set explicitly and asserted non-zero). Scorecard at 1 ETH, 5% royalty, 1% fee: buyer −1 − gas, seller +0.94, royalty +0.05, fee recipient +0.01, order 0 ETH and 0 tokens. **Round trips**: list → cancel → withdraw returns the NFT; offer → cancel → withdraw returns all ETH; offer → top up → partial fill → cancel returns deposit + top-up − spent. Refund on falling listing equals `value − price`. Each error in §7 provoked for real (warp time, hostile receiver contract, royalty above limit, nested-style transfer-locked token, ERC1155). |
| Indexer | Vitest + Anvil + Ponder + Postgres | Scripted scenarios produce real chains (state dumped with `anvil --dump-state` as reproducible fixtures). Assert table state after: normal lifecycles; **fakes rejected** (a clone deployed outside Market filled through the real `NFTSale` emits a genuine `Sold` that must be dropped; a contract emitting a `Sold`-shaped event; a `Created` with an unknown handler; garbage config; `proceedsTo = 0`); top-up seen only via poll; escrow deposit seen via fast lane; **reorg** via `anvil_reorg` rolls back fills and poll results; time states change with `anvil_setNextBlockTimestamp` without events; `fills` equals `NFTBid.fills(order)`. |
| E2E | Playwright, desktop 1440 and mobile 390 | Anvil + Ponder + app. Every flow in §6, including resume after reload mid-listing, batch and non-batch paths, wallet rejection, each designed error state. The wallet is a test-only EIP-1193 provider backed by an Anvil account, compiled only into the e2e build (it signs real transactions on a real chain; it replaces the wallet UI, not a counterparty). One MetaMask smoke run (Synpress) before each release to exercise RainbowKit with a real extension. |
| Compatibility | Anvil fork of mainnet (`https://mainnet.gateway.tenderly.co`, block 26,357,000) with the protocol deployed on the fork | BAYC, Azuki, Opepen, Chimpers (royalty splitter), Moonbirds nested, ENS, CryptoPunks: list, buy, offer, accept through the app's protocol package with impersonated real holders (setup, not a mock). |
| Visual | Playwright screenshots at 390/1440 per screen | Reviewed against the handoff side by side each milestone; layout regressions caught by screenshot diff against approved baselines. |

PR checks run the affected layer's tests only. The full suite, fork compatibility and the Sepolia rehearsal run once on a frozen release candidate (`CANDIDATE_RUN=1`).

---

## 11. Deployment and environments

| Env | Chain | Indexer | Web | Contracts |
| --- | --- | --- | --- | --- |
| Local | Anvil (`scripts/chain.sh`: anvil, protocol `Deploy.s.sol` from the submodule, test collections, seed scenario) | `ponder dev` on Docker Postgres | `next dev` | Same CREATE2 addresses as planned for Sepolia |
| Sepolia | 11155111 | Fly.io Ponder + Postgres | Netlify `sepolia.<domain>` | Redeployed by you (Q4) |
| Mainnet | 1 | Separate Fly.io project | Netlify `<domain>` | After protocol audit and your deployment. App readiness: code-hash check passes, Sepolia rehearsal with real wallets done, then a capped canary period with a small set of real users. |

Addresses, start blocks and expected code hashes are committed data in `packages/protocol/addresses.ts`, reviewed in PRs, the same code path for every environment.

Env vars:

| Var | Where | Secret |
| --- | --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | web | no |
| `NEXT_PUBLIC_INDEXER_URL` | web | no |
| `NEXT_PUBLIC_RPC_URL` | web (browser reads, restricted key or proxy) | restricted |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | web | no (domain-restricted) |
| `RPC_URL` | web server | yes |
| `NFT_API_KEY` | web server | yes |
| `SENTRY_DSN` | web (Q16) | no |
| `PONDER_RPC_URL_<chainId>` | indexer | yes |
| `DATABASE_URL`, `DATABASE_SCHEMA` | indexer | yes |

Monitoring: Ponder `/ready` and `/status` behind an uptime check; alert when indexed head lags chain head by > 20 blocks for 5 minutes; Sentry errors for the web app; RPC error rate from Ponder logs. A weekly report is not needed in V1.

---

## 12. Milestones

Each is one reviewable PR (some may split), verified with the checks named, committed locally; nothing pushed or deployed without your go-ahead.

| # | PR | Scope | Acceptance |
| --- | --- | --- | --- |
| M0 | Workspace and protocol package | pnpm workspace, TS strict, lint; `contracts/market` submodule at `d6b2073`; `@wagmi/cli` ABIs; `addresses.ts` + code hashes; `priceAt`, `priceRange`, config codecs, split math, error decoder, `verifyOrder` | Price parity vs contract on Anvil (2,000 cases) passes; decode of real `Created` logs passes; code hashes match a local deploy |
| M1 | Local chain harness | `scripts/chain.sh`, test collections in `test/contracts` (ERC721+2981, no-2981, reverting receiver, zero-receiver royalty, ERC1155, transfer-locked), seed scenarios | One command gives a chain with deployed protocol and seeded orders; flow builders' round-trip and scorecard tests pass with absolute balances |
| M2 | Indexer: events and trust | Ponder config, schema, `Created`/`Filled`/`Closed`/`Sold`/`Bought`, decoding, trust rules | Indexer tests incl. all fake-order cases and reorg pass |
| M3 | Indexer: derived state and API | Polling lanes, `quoteError`, SQL `price_now`, stats, REST endpoints, search | Time-state, top-up, escrow, stats tests pass; SQL parity with `priceAt` |
| M4 | Web shell and design system | Next app, tokens, fonts, primitives, TopBar/MobileNav, RainbowKit theme + wallet button, CSP | Preview at 390/768/1024/1440 matches handoff tokens; wallet connects on Anvil; CSP has no violations |
| M5 | Browse | Screens 01, 02, 03, 04 (read), 05 (read), search, NFT API adapter + media proxy | Real seeded data renders; sort by price matches `priceAt` order; empty/loading/404 states |
| M6 | Buy + transaction framework | `useTxFlow`, simulation, gas line, progress states, error copy, batch detection; Buy on 01/03/05 | E2E buy (fixed, falling, rising) desktop + mobile; refund shown; §7 buy errors reproduced |
| M7 | Create listing | Screen 06, resume step 2, royalty limit menu, previews from `feeBps`/`royaltyOf` | E2E create → live within one block; resume after reload; batch path |
| M8 | Make offer | Screen 07 collection + single, ladder | E2E; deposit equals amount × quantity on chain |
| M9 | Accept offer | Accept panel/page, approval step, revoke, eligibility from wallet holdings | E2E per-token approve + sell, approve-all skip, revoke; `BelowMinProceeds` and `InsufficientFunds` states |
| M10 | Positions | Listings/Offers/Activity tabs, cancel/withdraw all cases in §6.5, Add funds, Approvals row | E2E every row state; round trips return all assets |
| M11 | Hardening | Mainnet-fork compatibility suite, MetaMask smoke, monitoring, a11y pass (`web-design-guidelines`), security headers review, independent review of money/approval code paths | All green on a frozen candidate |
| M12 | Sepolia | After your redeploy: addresses + start block, Fly.io + Netlify deploy (with your approval), rehearsal with real wallets | Full lifecycle on Sepolia from the deployed app, recorded |

---

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| Protocol is experimental and unaudited; any Solidity change moves every address | Submodule pinned; addresses + code hashes as data; trading disabled on mismatch; reindex is a redeploy |
| Liveness facts without events (top-ups, deposits, royalty changes) make the indexer stale | Polling lanes; app re-reads live before display on detail pages and before every write |
| Moving prices fail at inclusion | Q10 headroom; simulation; clear retry copy |
| Two-step flows abandoned midway | Chain-derived step state, resume CTA, batch path when supported, empty order is harmless and closable |
| Fake collections, wash trading, inflated stats | Address-keyed routes, full addresses shown, denylist (Q13), self-trades excluded (Q17) |
| Shared `NFTBid` approval phishing | Per-token default, fixed `minProceeds` and `proceedsTo`, revoke path, no write deep links, CSP |
| Third-party dependency (NFT API) outage or shutdown | One adapter; `tokenURI` fallback; trading never depends on it (only holdings and media) |
| RPC rate limits from polling | Multicall batching, realtime-only polling, lane intervals tunable per chain (Q5) |
| E2E wallet automation flakiness | Test provider for flows, one real-extension smoke run per release |
| Design is pixel-specified at 1440/390 only | Documented intermediate breakpoints, screenshot review at 768/1024 |
| Fee recipient or a royalty receiver refusing ETH halts trading | Diagnosed and named in the UI; recovery (close + withdraw) never depends on them |
| MEV takes crossing falling listings / rising offers first | Inherent (`NFT_TRADING.md` §8); nothing in V1 |

---

## Things that don't make sense

1. The brief says discovery must work from `Created`, `Sold`, `Bought`, `Filled` and `Closed` alone. Discovery does, but **two facts the UI must show emit no Market event**: bid top-ups and the NFT moving into a listing. Polling is unavoidable (§4.6).
2. `PROTOCOL_REVIEW.md` calls handler events trustworthy when read from the handler address. They describe real settlements, but possibly of orders **Market did not create**. Cross-referencing `Created` is required, not optional.
3. The design's expired-offer row has a one-step "Withdraw 0.60 ETH"; the contracts need two steps there.
4. The Accept-offer note says the fee might change before confirmation; it cannot for an existing order. The price can.
5. ETH sent to a closed order is accepted and becomes the owner's. A frontend that lets anyone "add funds" could let a stranger gift ETH to a cancelled offer's owner.
6. A rising **listing** is allowed by the protocol and shown in the design, but buying one at the displayed price fails one block later unless `maxPrice` has headroom; the design's "You pay at most 1.42" cannot hold for it.
7. `FeeConfig`'s admin is still an EOA (`SECURITY.md` residual risk 23). A refusing fee recipient halts every fill; worth moving the admin to a Safe before Sepolia is used by others.
8. Your global rule fixes mainnet RPC to Tenderly's public gateway; a production indexer may need a keyed provider (Q5).

## Focused reliability follow-up acceptance

Keep both expiry conditions visible; allow listing cleanup without impossible canonical token transfers. Support exact-byte authenticated covered collateral recovery when config discovery fails. Regenerate source-pinned artifacts after Artwork registry authentication, mint-history removal and production comment cleanup. Preserve legacy selection and require separate authority for public deployment or cutover. Validation and signed local evidence are recorded in STATUS.md.
