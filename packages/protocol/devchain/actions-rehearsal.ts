// Signed local rehearsal of the unified Order/Action money flows on a disposable Anvil. Every
// participant is a freshly generated, disposable key (never persisted), funded from Anvil's
// unlocked faucet; every state-changing step is signed by that key. It exercises premium,
// execution price, trading fee, royalty, refund, collateral recovery and credit receipts, and
// broadcasts real reverting transactions, asserting absolute amounts throughout. No chain
// contract is mocked.
import {
  createWalletClient, encodeFunctionData, getAddress, http, keccak256, parseEther,
  type Account, type Address, type Hex, type TransactionReceipt,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { artworkAbi, marketAbi, orderAbi } from "../src/abis";
import { Admission } from "../src/config";
import { decodeRevert } from "../src/errors";
import { readOrder } from "../src/orders";
import * as tx from "../src/tx";
import { fixedSchedule } from "../src/schedule";
import { ACCOUNTS, ROYALTY_TO, type Chain } from "./index";
import * as A from "./artifacts";
import { createdOrder } from "./send";

const E = (s: string) => parseEther(s);
/** FeeConfig recipient from the protocol's Deploy script (FEE_TO). */
const FEE_TO: Address = getAddress("0xD4ba7cA95f3983514DDa317C4428CDb8F59c7e72");

type Signer = Account & { label: string };
type Step = { label: string; tx: Hex; gasUsed: string; status: "success" };
type RevertRecord = { label: string; expected: string; tx: Hex; status: "reverted" };
type MoneyLine = { label: string; who: Address; wei: string };

export type Evidence = {
  protocolCommit: string;
  deploymentId: string;
  rpcUrl: string;
  chainId: number;
  signers: Record<string, Address>;
  flows: { name: string; steps: Step[]; money: MoneyLine[] }[];
  reverts: RevertRecord[];
  transactions: Hex[];
};

export async function runActionsRehearsal(c: Chain): Promise<Evidence> {
  const d = c.deployment;
  const col = c.collections!;
  const faucet = c.wallet(ACCOUNTS[0]);
  const txs: Hex[] = [];

  const signer = (label: string): Signer => Object.assign(privateKeyToAccount(generatePrivateKey()), { label });
  const fund = async (s: Signer, amount: bigint) => {
    const hash = await faucet.sendTransaction({ to: s.address, value: amount, account: ACCOUNTS[0], chain: c.chain });
    await c.pub.waitForTransactionReceipt({ hash });
  };

  // Signed send: simulate, sign locally with the disposable key, broadcast, require success.
  const send = async (s: Signer, call: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[]; value?: bigint }): Promise<TransactionReceipt> => {
    const { request } = await c.pub.simulateContract({ ...call, account: s } as never);
    const w = createWalletClient({ account: s, chain: c.chain, transport: http(c.rpcUrl) });
    const hash = await w.writeContract(request as never);
    txs.push(hash);
    const receipt = await c.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`step reverted unexpectedly: ${s.label} ${call.functionName} ${hash}`);
    return receipt;
  };
  const step = (label: string, r: TransactionReceipt): Step => ({ label, tx: r.transactionHash, gasUsed: r.gasUsed.toString(), status: "success" });

  // Broadcast a transaction that is expected to revert on chain, decoding its reason first.
  const expectRevert = async (label: string, s: Signer, call: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; value?: bigint }): Promise<RevertRecord> => {
    let expected = "Unknown";
    try {
      await c.pub.simulateContract({ ...call, account: s } as never);
    } catch (e) {
      const r = decodeRevert(e);
      expected = r.name;
    }
    const data = encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args } as never);
    const w = createWalletClient({ account: s, chain: c.chain, transport: http(c.rpcUrl) });
    const hash = await w.sendTransaction({ to: call.address, data, value: call.value ?? 0n, gas: 600_000n, account: s, chain: c.chain });
    txs.push(hash);
    const receipt = await c.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "reverted") throw new Error(`expected revert did not revert: ${label} ${hash}`);
    return { label, expected, tx: hash, status: "reverted" };
  };

  const bal = (a: Address) => c.pub.getBalance({ address: a });
  const mintTo = async (nft: Address, to: Address, n = 1n): Promise<bigint> => {
    const { result, request } = await c.pub.simulateContract({ address: nft, abi: A.TestNFT.abi, functionName: "mint", args: [to, n], account: ACCOUNTS[0] });
    await c.pub.waitForTransactionReceipt({ hash: await faucet.writeContract(request) });
    return result;
  };

  const signers: Record<string, Address> = {};
  const flows: Evidence["flows"] = [];
  const reverts: RevertRecord[] = [];

  // ---- Flow 1: sale (fee + royalty + refund) ----
  {
    const seller = signer("seller"); const buyer = signer("buyer");
    const proceeds = signer("saleProceeds");
    signers.seller = seller.address; signers.buyer = buyer.address; signers.saleProceeds = proceeds.address;
    await fund(seller, E("1")); await fund(buyer, E("3"));
    const id = await mintTo(col.driftlines, seller.address, 1n); // driftlines: 5% royalty to ROYALTY_TO
    const spec = tx.saleSpec(d, { issuer: seller.address, nft: col.driftlines, tokenId: id, schedule: fixedSchedule(E("1")), proceedsTo: proceeds.address, maxRoyaltyBps: 1000 });
    const order = createdOrder(await send(seller, tx.create(d, spec, tx.randomSalt())));
    const steps: Step[] = [];
    steps.push(step("create sale", await c.pub.getTransactionReceipt({ hash: txs[txs.length - 1]! })));
    steps.push(step("deposit nft", await send(seller, tx.depositNft(col.driftlines, seller.address, order, id))));
    steps.push(step("activate", await send(seller, tx.activate(order))));
    const feeBefore = await bal(FEE_TO); const royBefore = await bal(ROYALTY_TO); const procBefore = await bal(proceeds.address); const buyBefore = await bal(buyer.address);
    const r = await send(buyer, tx.buy(order, buyer.address, E("1.2"))); // pays 1.2, price 1.0, refund 0.2
    steps.push(step("buy (pays 1.2 ETH)", r));
    const gas = r.gasUsed * r.effectiveGasPrice;
    const fee = (await bal(FEE_TO)) - feeBefore; const roy = (await bal(ROYALTY_TO)) - royBefore; const proc = (await bal(proceeds.address)) - procBefore;
    const spent = buyBefore - (await bal(buyer.address)) - gas; // net ETH out excluding gas
    assertEq("sale.fee (1% of 1.0)", fee, E("0.01"));
    assertEq("sale.royalty (5% of 1.0)", roy, E("0.05"));
    assertEq("sale.proceeds (1.0-fee-royalty)", proc, E("0.94"));
    assertEq("sale.buyerNetSpent (price after 0.2 refund)", spent, E("1"));
    if (getAddress(await c.pub.readContract({ address: col.driftlines, abi: A.TestNFT.abi, functionName: "ownerOf", args: [id] }) as Address) !== getAddress(buyer.address)) throw new Error("sale: buyer did not receive NFT");
    flows.push({ name: "sale", steps, money: [
      line("fee -> FeeConfig recipient", FEE_TO, fee), line("royalty -> ERC2981 receiver", ROYALTY_TO, roy),
      line("proceeds -> seller sink", proceeds.address, proc), line("buyer net spent", buyer.address, spent),
    ] });
  }

  // ---- Flow 2: bid (proceeds; approval must target ExchangeAction) ----
  {
    const bidder = signer("bidder"); const seller = signer("bidSeller"); const proceeds = signer("bidProceeds");
    signers.bidder = bidder.address; signers.bidSeller = seller.address; signers.bidProceeds = proceeds.address;
    await fund(bidder, E("1")); await fund(seller, E("1"));
    const id = await mintTo(col.meridian, seller.address, 1n); // meridian: 2.5% royalty
    const spec = tx.bidSpec(d, { issuer: bidder.address, nft: col.meridian, schedule: fixedSchedule(E("0.5")), recipient: bidder.address, anyToken: false, tokenId: id, maxExecutions: 1n });
    const order = createdOrder(await send(bidder, tx.create(d, spec, tx.randomSalt(), E("0.5"))));
    const steps: Step[] = [step("create+fund bid (0.5 ETH)", await c.pub.getTransactionReceipt({ hash: txs[txs.length - 1]! }))];
    steps.push(step("activate", await send(bidder, tx.activate(order))));
    // Approval MUST go to ExchangeAction, never the order. Prove the order has no approval:
    reverts.push(await expectRevert("sell before approving ExchangeAction -> ERC721InsufficientApproval", seller, { address: order, abi: orderAbi, functionName: "execute", args: [bidInputFor(id, 0n, proceeds.address)], value: 0n }));
    steps.push(step("approve ExchangeAction (single token)", await send(seller, tx.approveForBids(d, col.meridian, id))));
    const feeBefore = await bal(FEE_TO); const royBefore = await bal(ROYALTY_TO); const procBefore = await bal(proceeds.address);
    steps.push(step("sell into bid", await send(seller, tx.sellToBid(order, id, E("0.4"), proceeds.address))));
    const fee = (await bal(FEE_TO)) - feeBefore; const roy = (await bal(ROYALTY_TO)) - royBefore; const proc = (await bal(proceeds.address)) - procBefore;
    assertEq("bid.fee (1% of 0.5)", fee, E("0.005"));
    assertEq("bid.royalty (2.5% of 0.5)", roy, E("0.0125"));
    assertEq("bid.proceeds", proc, E("0.5") - E("0.005") - E("0.0125"));
    if (getAddress(await c.pub.readContract({ address: col.meridian, abi: A.TestNFT.abi, functionName: "ownerOf", args: [id] }) as Address) !== getAddress(bidder.address)) throw new Error("bid: recipient did not receive NFT");
    flows.push({ name: "bid", steps, money: [
      line("fee -> FeeConfig recipient", FEE_TO, fee), line("royalty -> ERC2981 receiver", ROYALTY_TO, roy),
      line("proceeds -> seller sink", proceeds.address, proc),
    ] });
  }

  // ---- Flow 3: covered purchase right, Actions resale, atomic acquireAndExecute, credit receipts ----
  {
    const issuer = signer("coverIssuer"); const buyer = signer("coverBuyer");
    const premiumSink = signer("premiumSink"); const execProceeds = signer("execProceeds");
    signers.coverIssuer = issuer.address; signers.coverBuyer = buyer.address; signers.premiumSink = premiumSink.address; signers.execProceeds = execProceeds.address;
    await fund(issuer, E("1")); await fund(buyer, E("2")); await fund(execProceeds, E("0.1"));
    const nftId = await mintTo(col.meridian, issuer.address, 1n); // 2.5% royalty
    const price = E("0.5");
    const far = (await c.pub.getBlock()).timestamp + 30n * 86_400n;
    const coverSpec = tx.coveredSpec(d, { issuer: issuer.address, nft: col.meridian, tokenId: nftId, price, proceedsTo: execProceeds.address, maxRoyaltyBps: 1000, deadline: far });
    const account = createdOrder(await send(issuer, tx.create(d, coverSpec, tx.randomSalt())));
    const steps: Step[] = [step("create covered right", await c.pub.getTransactionReceipt({ hash: txs[txs.length - 1]! }))];
    steps.push(step("deposit nft", await send(issuer, tx.depositNft(col.meridian, issuer.address, account, nftId))));
    steps.push(step("activate (mints Actions token)", await send(issuer, tx.activate(account))));
    const tokenId = BigInt(account);
    // List the Actions token through ExchangeAction (premium = 0.2 ETH), deposit it, activate.
    const premium = E("0.2");
    const listSpec = tx.saleSpec(d, { issuer: issuer.address, nft: d.actions!, tokenId, schedule: fixedSchedule(premium), proceedsTo: premiumSink.address, maxRoyaltyBps: 0 });
    const listing = createdOrder(await send(issuer, tx.create(d, listSpec, tx.randomSalt())));
    steps.push(step("create Actions-token listing", await c.pub.getTransactionReceipt({ hash: txs[txs.length - 1]! })));
    steps.push(step("deposit Actions token", await send(issuer, tx.depositNft(d.actions!, issuer.address, listing, tokenId))));
    steps.push(step("activate listing", await send(issuer, tx.activate(listing))));
    const info = await readOrder(c.pub, d, account);
    const feeBefore = await bal(FEE_TO); const premBefore = await bal(premiumSink.address);
    const params: tx.AcquireParams = {
      listing, account, nft: col.meridian, tokenId: nftId, executionPrice: price,
      activationTermsHash: keccak256(info.activationTerms), maxPremium: premium, maxTotal: premium + price,
      recipient: buyer.address, refundTo: buyer.address, deadline: far,
    };
    steps.push(step("acquireAndExecute (premium 0.2 + exec 0.5)", await send(buyer, tx.acquireAndExecute(d, params, premium + price))));
    // Premium settles on the listing: 1% fee of 0.2, no royalty (Actions), 0.198 to premiumSink.
    const premFee = (await bal(FEE_TO)) - feeBefore;
    const premProceeds = (await bal(premiumSink.address)) - premBefore;
    assertEq("premium.fee (1% of 0.2)", premFee, E("0.002"));
    assertEq("premium.proceeds", premProceeds, E("0.198"));
    // Execution credits on the covered account (withdrawn, not pushed). Royalty 2.5% of 0.5.
    const acct = await readOrder(c.pub, d, account);
    assertEq("covered.totalCredits (royalty + proceeds = price)", acct.totalCredits, price);
    const royCredit = await c.pub.readContract({ address: account, abi: orderAbi, functionName: "creditOf", args: [ROYALTY_TO] }) as bigint;
    const procCredit = await c.pub.readContract({ address: account, abi: orderAbi, functionName: "creditOf", args: [execProceeds.address] }) as bigint;
    assertEq("covered.royaltyCredit (2.5% of 0.5)", royCredit, E("0.0125"));
    assertEq("covered.proceedsCredit", procCredit, E("0.5") - E("0.0125"));
    if (getAddress(await c.pub.readContract({ address: col.meridian, abi: A.TestNFT.abi, functionName: "ownerOf", args: [nftId] }) as Address) !== getAddress(buyer.address)) throw new Error("covered: buyer did not receive NFT");
    // Credit receipts: anyone pays the royalty beneficiary; the issuer's beneficiary withdraws.
    const royPaidBefore = await bal(ROYALTY_TO);
    steps.push(step("releaseCredit(royaltyTo)", await send(buyer, tx.releaseCredit(account, ROYALTY_TO))));
    assertEq("covered.royaltyCredit paid", (await bal(ROYALTY_TO)) - royPaidBefore, E("0.0125"));
    const sink = signer("creditSink"); signers.creditSink = sink.address;
    const sinkBefore = await bal(sink.address);
    steps.push(step("withdrawCredit(proceeds -> sink)", await send(execProceeds, tx.withdrawCredit(account, sink.address))));
    assertEq("covered.proceedsCredit withdrawn", (await bal(sink.address)) - sinkBefore, E("0.5") - E("0.0125"));
    flows.push({ name: "covered+acquire", steps, money: [
      line("premium fee -> FeeConfig recipient", FEE_TO, premFee), line("premium proceeds -> issuer sink", premiumSink.address, premProceeds),
      line("execution royalty credit", ROYALTY_TO, royCredit), line("execution proceeds credit", execProceeds.address, procCredit),
    ] });
  }

  // ---- Flow 4: reserved action via the Artwork example (execution + surplus credit) ----
  if (c.artwork) {
    const owner = signer("artOwner"); const executor = signer("artExec"); const proceeds = signer("artProceeds");
    signers.artOwner = owner.address; signers.artExec = executor.address; signers.artProceeds = proceeds.address;
    await fund(owner, E("1")); await fund(executor, E("1"));
    // Mint an Artwork token to the owner (impersonate the fixed artist; local setup only).
    const artist = getAddress("0xCB43078C32423F5348Cab5885911C3B5faE217F9");
    await c.test.setBalance({ address: artist, value: E("1") });
    await c.test.impersonateAccount({ address: artist });
    const artistWallet = c.wallet(artist);
    const artTokenId = 1n;
    await c.pub.waitForTransactionReceipt({ hash: await artistWallet.writeContract({ address: c.artwork, abi: artworkAbi, functionName: "mint", args: [owner.address, artTokenId], account: artist, chain: c.chain }) });
    await c.test.stopImpersonatingAccount({ address: artist });
    const kind = 0; const choice = 3; const allowed = 1n << BigInt(choice);
    const operation = await c.pub.readContract({ address: c.artwork, abi: artworkAbi, functionName: "operation", args: [artTokenId, kind, allowed] }) as Hex;
    const price = E("0.1"); const targetValue = E("0.05");
    const far = (await c.pub.getBlock()).timestamp + 7n * 86_400n;
    const spec = tx.reservedSpec(d, { issuer: executor.address, target: c.artwork, operation, price, targetValue, proceedsTo: proceeds.address, deadline: far, admission: Admission.Public });
    const order = await c.pub.readContract({ address: d.market, abi: marketAbi, functionName: "orderAddress", args: [executor.address, spec, SALT] }); // predicted
    // Owner reserves the exact operation for the predicted order address, matching deadline/value.
    const steps: Step[] = [];
    steps.push(step("owner reserves change for order", await send(owner, tx.artworkReserve(c.artwork, order as Address, artTokenId, kind, allowed, far, targetValue))));
    const created = createdOrder(await send(executor, tx.create(d, spec, SALT)));
    if (getAddress(created) !== getAddress(order as Address)) throw new Error("reserved: predicted order address mismatch");
    steps.push(step("create reserved order", await c.pub.getTransactionReceipt({ hash: txs[txs.length - 1]! })));
    steps.push(step("activate", await send(executor, tx.activate(created))));
    steps.push(step("execute (pays 0.1, forwards 0.05)", await send(executor, tx.executeReserved(created, inputChoice(choice), price))));
    const color = await c.pub.readContract({ address: c.artwork, abi: artworkAbi, functionName: "colorOf", args: [artTokenId] }) as number;
    if (Number(color) !== choice) throw new Error(`reserved: color not set (${color})`);
    const surplusCredit = await c.pub.readContract({ address: created, abi: orderAbi, functionName: "creditOf", args: [proceeds.address] }) as bigint;
    assertEq("reserved.surplusCredit (price - targetValue)", surplusCredit, price - targetValue);
    const sinkBefore = await bal(proceeds.address);
    steps.push(step("releaseCredit(surplus)", await send(executor, tx.releaseCredit(created, proceeds.address))));
    assertEq("reserved.surplus paid", (await bal(proceeds.address)) - sinkBefore, price - targetValue);
    flows.push({ name: "reserved(artwork)", steps, money: [line("surplus credit -> proceeds", proceeds.address, surplusCredit)] });
  }

  // ---- Flow 5: recovery (cancel + withdrawSurplus; surrender + release) ----
  {
    const issuer = signer("recoverIssuer"); const sink = signer("recoverSink");
    signers.recoverIssuer = issuer.address; signers.recoverSink = sink.address;
    await fund(issuer, E("1.5"));
    // A funded bid, cancelled, then surplus withdrawn to a sink: exact 0.5 ETH recovered.
    const bidSpec = tx.bidSpec(d, { issuer: issuer.address, nft: col.driftlines, schedule: fixedSchedule(E("0.5")), recipient: issuer.address, anyToken: true, maxExecutions: 1n });
    const bid = createdOrder(await send(issuer, tx.create(d, bidSpec, tx.randomSalt(), E("0.5"))));
    const steps: Step[] = [step("create+fund bid (0.5)", await c.pub.getTransactionReceipt({ hash: txs[txs.length - 1]! }))];
    steps.push(step("activate", await send(issuer, tx.activate(bid))));
    steps.push(step("cancel", await send(issuer, tx.cancel(bid))));
    const before = await bal(sink.address);
    steps.push(step("withdrawSurplus -> sink", await send(issuer, tx.withdrawSurplus(bid, sink.address, E("0.5")))));
    assertEq("recovery.surplus (full bid funding)", (await bal(sink.address)) - before, E("0.5"));

    // A covered right, surrendered, then collateral recovered via release.
    const id = await mintTo(col.driftlines, issuer.address, 1n);
    const far = (await c.pub.getBlock()).timestamp + 30n * 86_400n;
    const coverSpec = tx.coveredSpec(d, { issuer: issuer.address, nft: col.driftlines, tokenId: id, price: E("0.3"), proceedsTo: issuer.address, maxRoyaltyBps: 1000, deadline: far });
    const account = createdOrder(await send(issuer, tx.create(d, coverSpec, tx.randomSalt())));
    steps.push(step("create covered", await c.pub.getTransactionReceipt({ hash: txs[txs.length - 1]! })));
    steps.push(step("deposit nft", await send(issuer, tx.depositNft(col.driftlines, issuer.address, account, id))));
    steps.push(step("activate", await send(issuer, tx.activate(account))));
    steps.push(step("surrender (burns token)", await send(issuer, tx.surrender(account))));
    steps.push(step("release (recover NFT)", await send(issuer, tx.release(account, sink.address))));
    if (getAddress(await c.pub.readContract({ address: col.driftlines, abi: A.TestNFT.abi, functionName: "ownerOf", args: [id] }) as Address) !== getAddress(sink.address)) throw new Error("recovery: NFT not recovered");
    flows.push({ name: "recovery", steps, money: [line("surplus recovered", sink.address, E("0.5"))] });
  }

  // ---- Flow 6: more real reverts ----
  {
    const seller = signer("revSeller"); const buyer = signer("revBuyer");
    signers.revSeller = seller.address; signers.revBuyer = buyer.address;
    await fund(seller, E("1")); await fund(buyer, E("2"));
    const id = await mintTo(col.driftlines, seller.address, 1n);
    const spec = tx.saleSpec(d, { issuer: seller.address, nft: col.driftlines, tokenId: id, schedule: fixedSchedule(E("1")), proceedsTo: seller.address, maxRoyaltyBps: 1000 });
    const order = createdOrder(await send(seller, tx.create(d, spec, tx.randomSalt())));
    await send(seller, tx.depositNft(col.driftlines, seller.address, order, id));
    await send(seller, tx.activate(order));
    // maxPrice below price (send 1.0 but cap at 0.9) -> AboveMaxPrice
    reverts.push(await expectRevert("buy with maxPrice below price -> AboveMaxPrice", buyer, { address: order, abi: orderAbi, functionName: "execute", args: [saleInputFor(buyer.address, E("0.9"), 0n)], value: E("1") }));
  }

  return {
    protocolCommit: d.protocolCommit, deploymentId: d.deploymentId, rpcUrl: c.rpcUrl, chainId: 31337,
    signers, flows, reverts, transactions: txs,
  };
}

const SALT: Hex = "0x0000000000000000000000000000000000000000000000000000000000000001";

function line(label: string, who: Address, wei: bigint): MoneyLine { return { label, who, wei: wei.toString() }; }
function assertEq(label: string, got: bigint, want: bigint) {
  if (got !== want) throw new Error(`${label}: expected ${want} got ${got}`);
}

// Local input encoders (kept here to avoid exporting internals).
import { encodeAbiParameters } from "viem";
const saleInputFor = (recipient: Address, maxPrice: bigint, minLeft: bigint): Hex =>
  encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint64" }], [recipient, maxPrice, minLeft]);
const bidInputFor = (tokenId: bigint, minProceeds: bigint, proceedsTo: Address): Hex =>
  encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "address" }], [tokenId, minProceeds, proceedsTo]);
const inputChoice = (choice: number): Hex => encodeAbiParameters([{ type: "uint8" }], [choice]);
