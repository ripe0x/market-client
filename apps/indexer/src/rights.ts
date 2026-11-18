import { erc721Abi, marketAbi, MULTICALL3, multicall3Abi, rightAbi, rightsAbi } from "@market/protocol";
import { and, asc, eq, or, sql } from "ponder";
import { ponder, type Context } from "ponder:registry";
import { right, rightCredit, rightEvent } from "ponder:schema";
import { decodeAbiParameters, getAddress, isAddressEqual, keccak256, parseAbiParameters, zeroAddress, type Address, type Hex } from "viem";
import { deployment as d } from "./deployment";

const covered = parseAbiParameters("(address nft, uint256 tokenId, uint256 price, address proceedsTo, uint16 maxRoyaltyBps)");
const royaltyTerms = parseAbiParameters("address royaltyTo, uint256 royalty");
type ChainEvent = { transaction: { hash: Hex }; block: { number: bigint; timestamp: bigint }; log: { logIndex: number } };

export async function recordRightEvent(context: Context, event: ChainEvent, account: Address, kind: string,
  fields: Partial<typeof rightEvent.$inferInsert> = {}) {
  await context.db.insert(rightEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}-${kind}`,
    account, kind, timestamp: event.block.timestamp, block: event.block.number, tx: event.transaction.hash, ...fields,
  });
}

ponder.on("Market:RightCreated", async ({ event, context }) => {
  if (!d.rights) return;
  const { account, issuer, handler, config } = event.args;
  const calls = [
    { address: d.market, abi: marketAbi, functionName: "isRight", args: [account] },
    ...["market", "rights", "issuer", "handler", "residual", "deadline", "configHash", "handlerCodehash", "tokenId"].map((functionName) => ({ address: account, abi: rightAbi, functionName })),
    { address: d.rights, abi: rightsAbi, functionName: "accountOf", args: [BigInt(account)] },
  ];
  const values = await context.client.multicall({ contracts: calls as never, allowFailure: false, multicallAddress: MULTICALL3 }) as unknown as [boolean, Address, Address, Address, Address, Address, bigint, Hex, Hex, bigint, Address];
  if (!values[0] || !isAddressEqual(values[1], d.market) || !isAddressEqual(values[2], d.rights)
    || !isAddressEqual(values[3], issuer) || !isAddressEqual(values[4], handler)
    || values[7] !== keccak256(config) || values[9] !== BigInt(account) || !isAddressEqual(values[10], account)) {
    throw new Error(`Market announced an unauthenticated right account ${account}`);
  }
  let supported = !!d.coveredNFTPurchase && isAddressEqual(handler, d.coveredNFTPurchase);
  let configError: string | null = supported ? null : "This exercise handler isn't supported.";
  let terms: { nft: Address; tokenId: bigint; price: bigint; proceedsTo: Address; maxRoyaltyBps: number } | null = null;
  if (supported) {
    if (values[8] !== d.codehash.coveredNFTPurchase) {
      supported = false;
      configError = "The committed exercise handler code doesn't match this release.";
    } else {
      try {
        [terms] = decodeAbiParameters(covered, config);
        if (!isAddressEqual(values[5], issuer) || terms.proceedsTo === zeroAddress || terms.maxRoyaltyBps > 10_000) {
          configError = "This covered purchase setup has invalid terms or a non-issuer residual beneficiary.";
          supported = false;
        }
      } catch {
        configError = "The committed exercise configuration can't be decoded.";
        supported = false;
      }
    }
  }
  await context.db.insert(right).values({
    address: account, tokenId: values[9], issuer, handler, residual: values[5], deadline: values[6], config,
    configHash: values[7], activationTerms: "0x", state: 0, supported, configError,
    nft: terms?.nft, assetId: terms?.tokenId, price: terms?.price, proceedsTo: terms?.proceedsTo,
    balance: await context.client.getBalance({ address: account }), createdAt: event.block.timestamp,
    createdBlock: event.block.number, createdTx: event.transaction.hash, updatedBlock: event.block.number,
  });
  await recordRightEvent(context, event, account, "created", { from: issuer });
});

ponder.on("Right:Activated", async ({ event, context }) => {
  const address = event.log.address;
  const row = await context.db.find(right, { address });
  if (!row) return;
  const fields: Partial<typeof right.$inferInsert> = { state: 1, activationTerms: event.args.terms, updatedBlock: event.block.number };
  if (row.supported) {
    try {
      const [royaltyTo, royalty] = decodeAbiParameters(royaltyTerms, event.args.terms);
      fields.royaltyTo = royaltyTo;
      fields.royalty = royalty;
    } catch {
      fields.supported = false;
      fields.configError = "The stored exercise royalty terms can't be decoded.";
    }
  }
  await context.db.update(right, { address }).set(fields);
  await recordRightEvent(context, event, address, "activated");
});

ponder.on("Rights:Transfer", async ({ event, context }) => {
  if (!d.rights || event.args.tokenId > (1n << 160n) - 1n) return;
  const address = getAddress(`0x${event.args.tokenId.toString(16).padStart(40, "0")}`);
  const row = await context.db.find(right, { address });
  if (!row) return;
  await context.db.update(right, { address }).set({ holder: event.args.to === zeroAddress ? null : event.args.to, updatedBlock: event.block.number });
  await recordRightEvent(context, event, address, "transfer", { from: event.args.from, to: event.args.to });
});

ponder.on("Right:Exercised", async ({ event, context }) => {
  const address = event.log.address;
  if (!(await context.db.find(right, { address }))) return;
  await context.db.update(right, { address }).set({ state: 2, holder: null, updatedBlock: event.block.number });
  await recordRightEvent(context, event, address, "exercised", { from: event.args.holder, amount: event.args.value });
});

ponder.on("CoveredNFTPurchase:Purchased", async ({ event, context }) => {
  const { right: account, holder, recipient, price } = event.args;
  const row = await context.db.find(right, { address: account });
  // The source is the selected release's handler; the account and config were authenticated
  // at creation. A different handler's account cannot contribute a covered delivery record.
  if (!row || !row.supported || !d.coveredNFTPurchase || !isAddressEqual(row.handler, d.coveredNFTPurchase)) return;
  if (row.state !== 1 || !row.holder || !isAddressEqual(row.holder, holder) || row.price !== price) {
    throw new Error(`Unreconciled covered purchase delivery at ${account}`);
  }
  await recordRightEvent(context, event, account, "exercise_delivery", { from: holder, recipient });
});

ponder.on("Right:Expired", async ({ event, context }) => {
  const address = event.log.address;
  if (!(await context.db.find(right, { address }))) return;
  await context.db.update(right, { address }).set({ state: 3, holder: null, updatedBlock: event.block.number });
  await recordRightEvent(context, event, address, "expired");
});

ponder.on("Right:Surrendered", async ({ event, context }) => {
  const address = event.log.address;
  if (!(await context.db.find(right, { address }))) return;
  await context.db.update(right, { address }).set({ state: 4, holder: null, updatedBlock: event.block.number });
  await recordRightEvent(context, event, address, "surrendered", { from: event.args.holder });
});

ponder.on("Right:SetupCanceled", async ({ event, context }) => {
  const address = event.log.address;
  if (!(await context.db.find(right, { address }))) return;
  await context.db.update(right, { address }).set({ state: 5, holder: null, updatedBlock: event.block.number });
  await recordRightEvent(context, event, address, "setup_canceled");
});

ponder.on("Right:Credited", async ({ event, context }) => {
  const account = event.log.address;
  if (!(await context.db.find(right, { address: account }))) return;
  const { beneficiary, amount } = event.args;
  const existing = await context.db.find(rightCredit, { account, beneficiary });
  await context.db.insert(rightCredit).values({ account, beneficiary, amount: (existing?.amount ?? 0n) + amount })
    .onConflictDoUpdate({ amount: (existing?.amount ?? 0n) + amount });
  await recordRightEvent(context, event, account, "credited", { beneficiary, amount });
});

ponder.on("Right:CreditWithdrawn", async ({ event, context }) => {
  const account = event.log.address;
  if (!(await context.db.find(right, { address: account }))) return;
  const { beneficiary, recipient, amount } = event.args;
  const existing = await context.db.find(rightCredit, { account, beneficiary });
  if (!existing || existing.amount < amount) throw new Error(`Unreconciled payment credit at ${account}`);
  await context.db.update(rightCredit, { account, beneficiary }).set({ amount: existing.amount - amount });
  await recordRightEvent(context, event, account, "credit_withdrawn", { beneficiary, to: recipient, amount });
});

/** Deposits and recovery emit no Right event; poll their actual asset destinations at the head. */
export async function pollRights(context: Context, number: bigint, timestamp: bigint, normal: boolean) {
  if (!d.rights) return;
  const slow = number % 300n === 0n;
  const due = slow ? undefined : normal
    ? or(sql`${right.state} <= 1`, sql`${right.balance} > 0`, sql`${right.backingOwner} = ${right.address}`)
    : and(eq(right.state, 0), sql`${right.createdAt} > ${timestamp - 7n * 86_400n}`);
  const rows = await context.db.sql.select().from(right).where(due)
    .orderBy(asc(right.updatedBlock)).limit(200);
  if (!rows.length) return;
  const calls = rows.flatMap((r) => {
    const balance = { address: MULTICALL3, abi: multicall3Abi, functionName: "getEthBalance", args: [r.address] };
    return r.nft && r.assetId != null ? [balance, { address: r.nft, abi: erc721Abi, functionName: "ownerOf", args: [r.assetId] }] : [balance];
  });
  type Result = { status: "success"; result: unknown } | { status: "failure"; error: Error };
  const results = await context.client.multicall({ contracts: calls as never, allowFailure: true, multicallAddress: MULTICALL3 }) as unknown as Result[];
  let i = 0;
  for (const row of rows) {
    const balance = results[i++]!;
    const owner = row.nft && row.assetId != null ? results[i++]! : null;
    await context.db.update(right, { address: row.address }).set({
      ...(balance.status === "success" ? { balance: balance.result as bigint } : {}),
      ...(owner ? { backingOwner: owner.status === "success" ? owner.result as Address : null } : {}),
      updatedBlock: number,
    });
  }
}
