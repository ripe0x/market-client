import { index, onchainTable, primaryKey } from "ponder";

/** One row per order Market created for NFTSale or NFTBid. Time-based states are never stored. */
export const order = onchainTable(
  "order",
  (t) => ({
    address: t.hex().primaryKey(),
    kind: t.text().notNull(), // "sale" | "bid"
    owner: t.hex().notNull(),
    salt: t.hex().notNull(),
    config: t.hex().notNull(),
    /** Decodes, has a nonzero payee and an ERC721 collection. Invalid rows show only to their owner. */
    valid: t.boolean().notNull(),
    nft: t.hex().notNull(),
    tokenId: t.bigint().notNull(),
    anyToken: t.boolean().notNull(),
    startPrice: t.bigint().notNull(),
    endPrice: t.bigint().notNull(),
    startTime: t.bigint().notNull(),
    endTime: t.bigint().notNull(),
    expiry: t.bigint().notNull(),
    maxFills: t.bigint().notNull(),
    maxRoyaltyBps: t.integer().notNull(),
    /** Sale proceedsTo, bid recipient. */
    payee: t.hex().notNull(),
    createdAt: t.bigint().notNull(),
    createdBlock: t.bigint().notNull(),
    createdTx: t.hex().notNull(),
    /** FeeConfig.feeBpsOf(order) at creation; never changes afterwards. */
    feeBps: t.integer().notNull(),
    closed: t.boolean().notNull(),
    closedAt: t.bigint(),
    closedTx: t.hex(),
    closedByFill: t.boolean().notNull(),
    fills: t.integer().notNull(),
    balance: t.bigint().notNull(),
    balanceBlock: t.bigint().notNull(),
    escrowed: t.boolean().notNull(),
    escrowBlock: t.bigint().notNull(),
    quoteError: t.text(),
    quoteBlock: t.bigint(),
  }),
  (t) => ({
    nftKind: index().on(t.nft, t.kind),
    owner: index().on(t.owner),
    token: index().on(t.nft, t.tokenId),
  }),
);

/** One row per genuine fill (Sold/Bought) of a Market-created order. */
export const fill = onchainTable(
  "fill",
  (t) => ({
    id: t.text().primaryKey(), // `${tx}-${order}`: one fill per order per transaction (Reentrant)
    order: t.hex().notNull(),
    kind: t.text().notNull(),
    nft: t.hex().notNull(),
    tokenId: t.bigint().notNull(),
    price: t.bigint().notNull(),
    royalty: t.bigint().notNull(),
    fee: t.bigint().notNull(),
    proceeds: t.bigint().notNull(),
    buyer: t.hex().notNull(),
    seller: t.hex().notNull(),
    recipient: t.hex().notNull(),
    /** ETH sent with the fill (from Order.Filled); value − price was refunded. */
    value: t.bigint(),
    selfTrade: t.boolean().notNull(),
    timestamp: t.bigint().notNull(),
    block: t.bigint().notNull(),
    tx: t.hex().notNull(),
  }),
  (t) => ({ nftTime: index().on(t.nft, t.timestamp), buyer: index().on(t.buyer), seller: index().on(t.seller) }),
);

export const collection = onchainTable("collection", (t) => ({
  address: t.hex().primaryKey(),
  name: t.text(),
  symbol: t.text(),
  isERC721: t.boolean().notNull(),
  isERC1155: t.boolean().notNull(),
  supports2981: t.boolean().notNull(),
  firstSeenBlock: t.bigint().notNull(),
}));

export const token = onchainTable(
  "token",
  (t) => ({ nft: t.hex().notNull(), tokenId: t.bigint().notNull(), lastSalePrice: t.bigint(), lastSaleAt: t.bigint() }),
  (t) => ({ pk: primaryKey({ columns: [t.nft, t.tokenId] }) }),
);

/** Chain head as last seen by the poll; the API's default `at`. */
export const meta = onchainTable("meta", (t) => ({ id: t.integer().primaryKey(), block: t.bigint().notNull(), timestamp: t.bigint().notNull() }));

/** Factory-authenticated accounts survive token burning for payment and recovery history. */
export const right = onchainTable("right", (t) => ({
  address: t.hex().primaryKey(),
  tokenId: t.bigint().notNull(),
  issuer: t.hex().notNull(),
  holder: t.hex(),
  residual: t.hex().notNull(),
  handler: t.hex().notNull(),
  config: t.hex().notNull(),
  configHash: t.hex().notNull(),
  activationTerms: t.hex().notNull(),
  deadline: t.bigint().notNull(),
  state: t.integer().notNull(),
  supported: t.boolean().notNull(),
  configError: t.text(),
  nft: t.hex(),
  assetId: t.bigint(),
  price: t.bigint(),
  proceedsTo: t.hex(),
  royaltyTo: t.hex(),
  royalty: t.bigint(),
  backingOwner: t.hex(),
  balance: t.bigint().notNull(),
  createdAt: t.bigint().notNull(),
  createdBlock: t.bigint().notNull(),
  createdTx: t.hex().notNull(),
  updatedBlock: t.bigint().notNull(),
}), (t) => ({ issuer: index().on(t.issuer), holder: index().on(t.holder), token: index().on(t.tokenId) }));

export const rightCredit = onchainTable("right_credit", (t) => ({
  account: t.hex().notNull(),
  beneficiary: t.hex().notNull(),
  amount: t.bigint().notNull(),
}), (t) => ({ pk: primaryKey({ columns: [t.account, t.beneficiary] }), beneficiary: index().on(t.beneficiary) }));

export const rightEvent = onchainTable("right_event", (t) => ({
  id: t.text().primaryKey(),
  account: t.hex().notNull(),
  kind: t.text().notNull(),
  timestamp: t.bigint().notNull(),
  block: t.bigint().notNull(),
  tx: t.hex().notNull(),
  from: t.hex(),
  to: t.hex(),
  beneficiary: t.hex(),
  recipient: t.hex(),
  amount: t.bigint(),
  order: t.hex(),
}), (t) => ({ account: index().on(t.account) }));
