# Market V1 UI vs protocol (ripe0x/market @ main, 2026-11-16)

Reviewed: README, SPEC, NFT_TRADING, STATUS, OWNER-REQUIREMENTS, DECISIONS (D013, D301, D303), `NFTSale.sol`, `NFTBid.sol`, `NFTTrade.sol`, `FeeConfig.sol`. UI: `Market 7 - V1 Final.dc.html`.

## Remove (UI shows things the protocol doesn't do)
1. **WETH everywhere.** Settlement is native ETH (D013: "Native ETH needs no wrapper"). Every price, offer and balance should read ETH.
2. **Pay with WETH / ETH, Fund with toggles, ETH→WETH conversion copy.** Nothing to wrap. Buy sends ETH with the fill; offers are funded with ETH sent to the order.
3. **Other currencies (USDC, DAI, ERC20).** "Not covered: ERC20 payment." Remove the currency filter, currency group rows and "Also listed in USDC 3 DAI 1".
4. **Custom pricing contracts** ("Floor +10% · custom 0x8f2…", "Floor −15% · custom 0x3c9…"). Strategies were removed from the release (D301). Pricing is only the linear schedule: fixed, falling or rising.
5. **"Market fee" as Market's fee.** Market (core) takes nothing. The fee belongs to the NFT handlers (read from `FeeConfig`). Label can stay "Fee" or "Market fee" only if the product brand is meant, not the protocol.

## Correct (exists, but differs)
6. **Fee:** up to 1%, set by the FeeConfig admin, **locked per order at creation**. Read `feeBps()` for new orders; read `quote()` (returns `fee`) for existing ones. Proceeds = price − fee − royalty, as designed.
7. **Royalty:** paid only if the collection reports ERC2981; capped at price − fee. Show "Royalty" from `royaltyOf`, and "None" when not reported (don't hardcode 5%).
8. **Seller's royalty limit (`maxRoyaltyBps`).** Required in every listing config; a higher royalty makes the sale revert. Form needs a default (e.g. current royalty) and probably an advanced field.
9. **Listing expiry is optional, not absent.** `Schedule.expiry` (0 = never). "No expiry" as the default is fine; the form could offer it as an option. Expired listings still hold the NFT and need Withdraw.
10. **Start time.** Schedules have `startTime`; orders can be scheduled to start later. Current UI assumes "now". Fine for V1 if intentional.
11. **Offer expiry options:** 1D/3D/7D/30D are fine; protocol also allows Never.
12. **Collection offer funding.** For a fixed offer, fund = amount × quantity. For a rising offer, fund must cover the highest price for the remaining fills, or fills fail with `InsufficientFunds`.
13. **"Held in Market escrow"** → the NFT is held by the listing's own order contract. Suggest "Held in this listing" + order address.
14. **Listed NFTs aren't in the seller's wallet.** "You hold 2" and the Sell-to-offer picker must exclude escrowed tokens; to accept an offer on a listed NFT the seller must cancel the listing first.

## Add (protocol requires it, UI doesn't show it)
15. **Approval step on Accept offer.** Holder approves the `NFTBid` handler (per token recommended, or approve all). Needs an explanation of what that approval allows (NFT_TRADING "What an approval to NFTBid authorizes") and a revoke path.
16. **Seller minimum on Accept offer (`minProceeds`)** and **buyer max price on Buy (`maxPrice`)**, i.e. slippage limits. Can be implicit (quoted value) but the confirm sheet should state them.
17. **Two-step listing:** create order, then transfer the NFT in (or transfer to the predicted address first). Show as two wallet steps.
18. **Two-step cancel:** close, then withdraw (NFT or ETH). Positions should handle a closed-but-not-withdrawn state.
19. **Placing orders costs gas** (~117k create, plus ~67–110k deposit for listings). Worth a line on create/offer forms.
20. **Offer top-up.** Anyone can add ETH to a bid order; Positions could offer "Add funds", and show "Underfunded" when balance < current price.
21. **Fill failures to design for:** royalty receiver refuses ETH, incompatible collection (CryptoPunks, nested Moonbirds, ERC1155), offer underfunded, listing not started / expired.

## Data notes
- Index `Market.Created`, plus `Sold` / `Bought` / `Filled` / `Closed`, from trusted handler addresses only.
- "Items" and "Owners" are not protocol data and many ERC721s don't expose them; they need an indexer.

## Unchanged and correct
Escrowed listings, funded offers, single-token and collection offers with quantity (`maxFills`), "2 of 5 bought" (`fills(order)`), falling/rising linear schedules that hold at the end price, cancel returning everything, Withdraw on expired offers, nothing returned automatically.
