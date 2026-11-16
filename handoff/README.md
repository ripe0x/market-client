# Handoff: Market V1 (protocol-matched)

Start with `PROMPT.md`: it is the brief for Claude Code. This README is the design spec it refers to.

## Overview
Market is a web app for trading ERC721 NFTs for native ETH on the Market protocol (https://github.com/ripe0x/market). Each listing and offer is its own onchain order contract created through `Market.create`, using the `NFTSale` and `NFTBid` handlers. V1 covers: browsing listings and collections, a collection page (listings, offers), NFT detail, create listing, make offer, accept offer, and Positions (your listings, offers, activity). Each screen is designed at desktop 1440px and mobile 390px.

## Files
- `design/Market V1 - standalone.html`: the full design, opens offline.
- `design/Market V1.dc.html` (+ `support.js`, `art.js`): design source. `art.js` only draws placeholder artwork; use real token media.
- `PROTOCOL_REVIEW.md`: reconciliation of the design with the contracts; lists what is still open.
- `STYLE_GUIDE.md`: the visual system in portable form.
- `PROMPT.md`: the brief for Claude Code.

## Fidelity
High-fidelity: final layout, copy, colours, type and spacing. The HTML is a static reference, not production code; mock data is illustrative. Rebuild in the target stack.

## Core model (from the contracts)
- **Currency:** native ETH only. No WETH, no ERC20s.
- **Price schedule** (`NFTTrade.Schedule`): `startPrice`, `endPrice`, `startTime`, `endTime`, `expiry` (0 = never). Linear between start and end, then holds at `endPrice`. Fixed when start = end. Falling rounds up, rising rounds down.
- **Listing** (`NFTSale`): an order holding one NFT. Created, then the NFT is transferred in (two wallet steps). The seller sets `maxRoyaltyBps`; a higher royalty makes the sale revert. Buyer sends ETH with `maxPrice`; overpayment is refunded.
- **Offer** (`NFTBid`): an order holding ETH, for one token or any token in a collection, up to `maxFills`. Anyone can top up. Selling to an offer needs an approval to the `NFTBid` handler (not the order) and a `minProceeds`.
- **Money split:** price − fee − royalty = proceeds. Fee is up to 1%, locked per order at creation (`FeeConfig`). Royalty is ERC2981 when reported, capped at price − fee.
- **Cancel:** `close`, then withdraw via `execute`: two steps. Nothing is returned automatically.
- **Listed NFTs are not in the seller's wallet;** they can't be sold to an offer without cancelling first.

## Global layout
- **Desktop top bar:** 76px, padding 0 40px, bottom 1px #262626, grid `260px | 1fr | auto`. Logo (22px square outline + diagonal, "Market" Archivo 800 22px −0.03em). Search 520×42, 1px #333. Right: "Sell" 15px/500 (2px underline when active) and wallet button (42px, bg #fff, mono 500 14px). Wallet button opens Positions.
- **Gutter** 40px desktop, 18px mobile. Toolbars 64px with top/bottom 1px #262626.
- **Tables:** header 44–48px mono 12px uppercase #7a7a7a (sorted column #fff with ↑/↓); rows 60–80px, bottom 1px #1a1a1a, hover #0d0d0d, column gap 24px, tabular nums. Footer 64px: note left #7a7a7a, "Show N more" right #fff.
- **Two-column screens:** `1fr | 520px`, left column border-right #262626.
- **Mobile:** status bar 50px; sub-screen nav `← | title | ···` or `Cancel | title | spacer`; primary CTA 58px full width; tap targets ≥ 40px.

## Screens

### 01 Marketplace · Listings
- Big tabs "Listings" / "Collections" (Archivo 800 64px, inactive #3d3d3d). Mobile 32px.
- Toolbar: "All collections ▾"; sorts Newest | Price low | Price high; Table/Grid toggle.
- Columns `2fr 1.2fr 1.5fr 1fr 1fr 88px`: Token (52px thumb, collection 17px/700, #id mono) | Price (22px/700 + "ETH" mono 12px) | Pricing (changing: "to 0.80 · Sat 14:00" + 72×2px progress bar; fixed: empty) | Last sale | Listed ↓ | Buy (40px outline).
- Footer: "Prices shown are payable at the current block."
- Mobile: 2-col grid with 1px gutters.

### 02 Marketplace · Collections
- Period toggle 24H | 7D | 30D.
- Two-tier header: "TRADING ON MARKET" (Floor, Top offer, Listed, Volume, Sales) and "COLLECTION" (Owners).
- Footer: "Trading figures count orders and sales on Market. Owners come from indexed collection data."

### 03 Collection · Listings
- Header: 88px avatar, name 64px/800, "0xd1e…4a07 · 5% artist royalty". Stats: Trading on Market (Floor, Top offer, Listed, Volume 7D) and Collection (Items, Owners).
- Tabs Listings | Offers; sorts; Table/Grid; primary "Make offer".
- Columns: Token | Price ↑ | Pricing | Last sale | Seller | Buy.

### 04 Collection · Offers + Accept offer (mobile)
- Header line: Floor, Top offer, "In your wallet 2".
- Columns: Offer ↓ (sub-line for rising offers, e.g. "Rising to 0.60 by Thu") | For | Remaining | Expires (may be "Never") | Buyer | Sell (only when the wallet holds an eligible, unlisted NFT).
- Footer: "Offers are funded in advance. Sell appears where your wallet holds an eligible NFT. Cancel a listing first to sell its NFT to an offer."
- **Accept offer:** amount 48px; "From 0x51…20a9 · 7 remaining · expires in 3 days"; choose NFT (2-col, selected outline 2px #fff offset 4px); breakdown Offer / Artist royalty / Market fee / You receive; steps "1 Approve #305 for offers (Next)" and "2 Sell #305, ETH to your wallet"; note on what approval allows and that the sale stops rather than pay less than the shown amount (`minProceeds`); CTA "Approve #305", then "Sell #305".

### 05 NFT detail
- Desktop `1fr | 520px`. Token 88px/800. Price 76px/700 + "ETH" 28px.
- Changing-price block: "Changes to 0.80 ETH by Sat 14:00", 424×48 line chart (past solid #b5b5b5, future dashed #444, 4px #fff dot), "Then stays at 0.80 until sold or cancelled."
- CTAs "Buy for 1.42 ETH" (64px, #fff) and "Make offer" (outline). Note: "You pay at most 1.42 ETH. If the price falls before this confirms, the difference is refunded. Plus network gas."
- Offers list; meta rows Seller, Artist royalty, Held in "This listing 0x6e…a3f2", Expires "Never", Contract and token ▾.
- Mobile shows a fixed-price listing.

### 06 Create listing
- Left: wallet NFTs (3-col; selected outline 2px #fff offset 8px; "Listed" note).
- Form: Start price; Change price over time (toggle 44×24); End price; Duration 1D|3D|7D|30D; Expires Never|30D|90D; Royalty limit "5% · collection asks 5% ▾".
- Preview chart; "You receive at least" with At start / At end table (Sale price, Artist royalty, Market fee, You receive).
- Copy: "Listing creates an order that holds #15 until it sells. If the collection's royalty rises above your limit, the sale stops instead of paying you less. Cancel any time to get #15 back."
- Steps: "1 Create the listing", "2 Move #15 into it"; "Two wallet confirmations, each with network gas." CTA "List #15".

### 07 Make offer
- Desktop (collection offer): ladder of existing offers with yours highlighted (bg #fff, text #000).
- Form: Amount per NFT; Quantity stepper; Expires 1D|3D|7D|30D|Never.
- Summary: Total committed (amount × quantity), wallet balance after.
- Copy ends "Creating the offer costs network gas." CTA "Deposit 2.90 ETH and offer".
- Mobile: single-NFT offer, same rules.

### 08 Positions
- **Listings:** "Cancel, then withdraw the NFT: two confirmations". Columns Token | Price | Pricing | Status | action. States: Listed → "Cancel and withdraw" (outline); Cancelled → "Withdraw #3" (primary).
- **Offers:** "Cancel, then withdraw unspent ETH: two confirmations". Columns Offer | For | Bought ("2 of 5") | Unspent | Expires | action. Active → "Cancel and refund 1.74"; expired → "Withdraw 0.60 ETH" (primary).
- **Activity:** Date | Event (Sold / Bought / Offer filled) | Token | Amount ETH | With | Tx ↗.

## Not yet designed (follow the visual language)
- "Add funds" to an offer (top-up) and an "Underfunded" status.
- Error states: incompatible collection, offer without enough ETH, royalty receiver refusing ETH, not started / expired.
- Transaction progress (pending, confirmed, failed) and approval revoke.
- Wallet connect (RainbowKit, themed square/black/white).

## Design tokens
Colours: #000 bg · #fff ink · #b5b5b5 secondary · #7a7a7a muted · #555 group labels · #444 off-toggle/dashed · #3d3d3d inactive tabs · #333 control borders · #262626 dividers · #1a1a1a row dividers · #111 media placeholder · #0d0d0d hover · #0a0a0a group rows.
Type: Archivo 400/500/700/800 (UI, display), JetBrains Mono 400/500 (labels, IDs, addresses, units). Titles 800 with −0.05em; prices 700 with −0.045 to −0.02em; mono labels 11–12px uppercase 0.06em; tabular nums.
Radius 0 everywhere. No shadows in the UI (frame shadows and rounded phone corners in the HTML are presentation only).
