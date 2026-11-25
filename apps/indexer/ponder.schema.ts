import { index, onchainTable, primaryKey } from "ponder";

/** One row per order Market created. Time-based and deadline-effective states are computed at
 * query time, never stored. All addresses here are unauthenticated hints: a client must verify an
 * order via readOrder (Market.isOrder + actionCodehash vs deployed code) before trusting it. */
export const order = onchainTable(
  "order",
  (t) => ({
    address: t.hex().primaryKey(),
    kind: t.text().notNull(), // sale | bid | covered | reserved | unknown
    issuer: t.hex().notNull(),
    action: t.hex().notNull(),
    actionCodehash: t.hex().notNull(),
    admission: t.integer().notNull(), // 0 Public, 1 Holder
    salt: t.hex().notNull(),
    config: t.hex().notNull(),
    deadline: t.bigint().notNull(), // exclusive; 0 never expires
    residual: t.hex().notNull(),
    state: t.integer().notNull(), // 0 Pending 1 Live 2 Completed 3 Canceled 4 Expired 5 Surrendered
    /** Decodes to a known action with usable terms. Invalid rows show only to their issuer. */
    valid: t.boolean().notNull(),
    // Decoded ExchangeAction / CoveredNFTPurchase terms (zero/empty for other actions).
    nft: t.hex().notNull(),
    tokenId: t.bigint().notNull(),
    anyToken: t.boolean().notNull(),
    isActionsCollection: t.boolean().notNull(),
    startPrice: t.bigint().notNull(),
    endPrice: t.bigint().notNull(),
    startTime: t.bigint().notNull(),
    endTime: t.bigint().notNull(),
    maxExecutions: t.bigint().notNull(),
    maxRoyaltyBps: t.integer().notNull(),
    maxFeeBps: t.integer().notNull(),
    /** Fixed covered-purchase price (covered only). */
    price: t.bigint().notNull(),
    /** Sale/covered proceedsTo, bid recipient. */
    payee: t.hex().notNull(),
    createdAt: t.bigint().notNull(),
    createdBlock: t.bigint().notNull(),
    createdTx: t.hex().notNull(),
    /** Fee rate snapshotted at activation (ExchangeAction activationTerms); -1 before activation. */
    feeBps: t.integer().notNull(),
    activationTerms: t.hex().notNull(),
    /** Current Actions-token holder for a Holder order; null when burned/non-holder. */
    holder: t.hex(),
    executions: t.integer().notNull(),
    balance: t.bigint().notNull(),
    balanceBlock: t.bigint().notNull(),
    totalCredits: t.bigint().notNull(),
    escrowed: t.boolean().notNull(),
    escrowBlock: t.bigint().notNull(),
    quoteError: t.text(),
    quoteBlock: t.bigint(),
    closedAt: t.bigint(),
    closedTx: t.hex(),
  }),
  (t) => ({
    nftKind: index().on(t.nft, t.kind),
    issuer: index().on(t.issuer),
    holder: index().on(t.holder),
    token: index().on(t.nft, t.tokenId),
  }),
);

/** One row per settlement (Exchanged / Purchased) of a Market-created order. */
export const fill = onchainTable(
  "fill",
  (t) => ({
    id: t.text().primaryKey(), // `${tx}-${order}-${logIndex}`
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
    selfTrade: t.boolean().notNull(),
    timestamp: t.bigint().notNull(),
    block: t.bigint().notNull(),
    tx: t.hex().notNull(),
  }),
  (t) => ({ nftTime: index().on(t.nft, t.timestamp), buyer: index().on(t.buyer), seller: index().on(t.seller), order: index().on(t.order) }),
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

/** Reserved ETH owed to a beneficiary by an order account; survives token burning. */
export const credit = onchainTable(
  "credit",
  (t) => ({ account: t.hex().notNull(), beneficiary: t.hex().notNull(), amount: t.bigint().notNull() }),
  (t) => ({ pk: primaryKey({ columns: [t.account, t.beneficiary] }), beneficiary: index().on(t.beneficiary) }),
);

/** Lifecycle, settlement and payment history of an order account. */
export const accountEvent = onchainTable(
  "account_event",
  (t) => ({
    id: t.text().primaryKey(),
    account: t.hex().notNull(),
    kind: t.text().notNull(),
    timestamp: t.bigint().notNull(),
    block: t.bigint().notNull(),
    tx: t.hex().notNull(),
    actor: t.hex(),
    from: t.hex(),
    to: t.hex(),
    beneficiary: t.hex(),
    recipient: t.hex(),
    amount: t.bigint(),
  }),
  (t) => ({ account: index().on(t.account) }),
);
