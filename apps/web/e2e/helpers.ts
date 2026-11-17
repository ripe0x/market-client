// Node-side helpers for e2e: a viem client against the seeded Anvil (:8645, accounts unlocked),
// minting fresh tokens from the test collections, and setting up orders directly on chain so the
// UI flow under test is the only thing exercised through the app.
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import {
  configHash,
  deploymentFor,
  encodeSaleConfig,
  erc721Abi,
  fixedSchedule,
  marketAbi,
  randomSalt,
  tx,
} from "@market/protocol";
import { artifacts } from "@market/protocol/devchain";
import { expect, type Page } from "@playwright/test";
import { localChain, ME } from "./wallet";

export const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8645";
export const D = deploymentFor(31337);
export const chain = defineChain({ id: 31337, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });

export const pub = createPublicClient({ chain, transport: http(RPC) });
export const wallet = (account: Address) => createWalletClient({ account, chain, transport: http(RPC) });
const test = createTestClient({ chain, transport: http(RPC), mode: "anvil" });
/** Advance the chain so the indexer's polling lanes (escrow, quote) run. */
export const mineBlocks = (n = 3) => test.mine({ blocks: n });

/** Anvil unlocked accounts. */
export const ACC = {
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  me: ME as Address, // account 1 — the injected wallet
  other: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // account 2
} as const;

const send = async (account: Address, call: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; value?: bigint }) => {
  const hash = await wallet(account).writeContract({ ...(call as object), account, chain } as never);
  return pub.waitForTransactionReceipt({ hash });
};

/** Mint `count` tokens of a test collection to `to`; returns the first id. */
export async function mint(nft: Address, to: Address, count = 1n): Promise<bigint> {
  const { result } = await pub.simulateContract({ address: nft, abi: artifacts.TestNFT.abi, functionName: "mint", args: [to, count], account: ACC.deployer });
  await send(ACC.deployer, { address: nft, abi: artifacts.TestNFT.abi, functionName: "mint", args: [to, count] });
  return result as bigint;
}

/** Create a fixed-price listing on chain (create + deposit), returning the order address. */
export async function listFixed(seller: Address, nft: Address, tokenId: bigint, priceWei: bigint, maxRoyaltyBps = 10000): Promise<Address> {
  const config = { nft, tokenId, schedule: fixedSchedule(priceWei), proceedsTo: seller, maxRoyaltyBps };
  const salt = randomSalt();
  const bytes = encodeSaleConfig(config);
  const order = (await pub.readContract({ address: D.market, abi: marketAbi, functionName: "orderAddress", args: [seller, D.nftSale, configHash(bytes), salt] })) as Address;
  await send(seller, tx.createListing(D, config, salt));
  await send(seller, tx.depositNft(nft, seller, order, tokenId));
  return order;
}

/** Create a falling (or rising) listing on chain over `durationSec`. */
export async function listSchedule(seller: Address, nft: Address, tokenId: bigint, startWei: bigint, endWei: bigint, durationSec: bigint): Promise<Address> {
  const t = (await pub.getBlock()).timestamp;
  const config = { nft, tokenId, schedule: { startPrice: startWei, endPrice: endWei, startTime: t, endTime: t + durationSec, expiry: 0n }, proceedsTo: seller, maxRoyaltyBps: 10000 };
  const salt = randomSalt();
  const bytes = encodeSaleConfig(config);
  const order = (await pub.readContract({ address: D.market, abi: marketAbi, functionName: "orderAddress", args: [seller, D.nftSale, configHash(bytes), salt] })) as Address;
  await send(seller, tx.createListing(D, config, salt));
  await send(seller, tx.depositNft(nft, seller, order, tokenId));
  return order;
}

/** Create a bid (offer) on chain, returning the order address. `priceWei` is the per-NFT amount;
 * `valueWei` (default price × maxFills) funds it — pass a smaller value to make it underfunded. */
export async function offerOnChain(owner: Address, nft: Address, anyToken: boolean, tokenId: bigint, priceWei: bigint, maxFills = 1n, valueWei?: bigint): Promise<Address> {
  const config = { nft, anyToken, tokenId, schedule: fixedSchedule(priceWei), recipient: owner, maxFills };
  const salt = randomSalt();
  const value = valueWei ?? priceWei * maxFills;
  const bytes = (await import("@market/protocol")).encodeBidConfig(config);
  const order = (await pub.readContract({ address: D.market, abi: marketAbi, functionName: "orderAddress", args: [owner, D.nftBid, configHash(bytes), salt] })) as Address;
  await send(owner, { ...tx.createOffer(D, config, salt, value) });
  return order;
}

const INDEXER = process.env.E2E_INDEXER_URL ?? "http://localhost:42169";
export const getToken = async (nft: Address, id: bigint) =>
  (await (await fetch(`${INDEXER}/api/tokens/${nft}/${id}`)).json()) as { listing: { status: string } | null };
export const positionsOf = async (a: Address) =>
  (await (await fetch(`${INDEXER}/api/accounts/${a}/positions`)).json()) as { listings: { address: Address; status: string; nft: Address; tokenId: string; balance: string }[]; offers: { address: Address; status: string; nft: Address; tokenId: string; anyToken: boolean; balance: string; fills: number; maxFills: string }[] };

/** Poll the indexer until `pred` holds. */
export async function waitFor<T>(get: () => Promise<T>, pred: (v: T) => boolean, tries = 60): Promise<T> {
  for (let i = 0; i < tries; i++) {
    const v = await get();
    if (pred(v)) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("waitFor timed out");
}

export const ownerOf = (nft: Address, id: bigint) => pub.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] }) as Promise<Address>;
export const isApprovedForAll = (nft: Address, owner: Address, op: Address) => pub.readContract({ address: nft, abi: erc721Abi, functionName: "isApprovedForAll", args: [owner, op] }) as Promise<boolean>;
export const setApprovalForAll = (owner: Address, nft: Address, op: Address, v: boolean) => send(owner, { address: nft, abi: erc721Abi, functionName: "setApprovalForAll", args: [op, v] });
export const balance = (a: Address) => pub.getBalance({ address: a });

type Collections = { driftlines: Address; meridian: Address; tessellate: Address; plain: Address; lockable: Address; erc1155: Address };
export const collections = async (): Promise<Collections> => (await localChain()).collections as unknown as Collections;
export const eth = (s: string) => parseEther(s);

/** Wait until the indexer has processed the chain head (so lists include our setup). */
export async function waitIndexer(indexerUrl = process.env.E2E_INDEXER_URL ?? "http://localhost:42169") {
  const target = await pub.getBlockNumber();
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${indexerUrl}/api/status`);
      const j = (await r.json()) as { block: string };
      if (BigInt(j.block) >= target) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** Ensure the injected test wallet is connected. wagmi auto-connects to the injected provider on
 * some devices (notably mobile emulation); otherwise drive the RainbowKit modal. Connection is
 * detected by the absence of the header "Connect" button, which is robust to both paths. */
export async function connect(page: Page) {
  const connectBtn = page.locator("button:visible").filter({ hasText: /^Connect$/ });
  await page.waitForTimeout(2_500); // let hydration + any auto-connect settle
  if ((await connectBtn.count()) === 0) return; // already connected
  await connectBtn.first().click();
  await page.getByText("Test Wallet", { exact: false }).first().click({ timeout: 15_000 });
  await expect(connectBtn).toHaveCount(0, { timeout: 20_000 });
}

export const NFTBID = D.nftBid;

/** Click a Positions tab if the (mobile-only) tab bar is visible; no-op on desktop. */
export async function selectTab(page: Page, label: string) {
  const b = page.locator("button:visible", { hasText: new RegExp("^" + label) });
  if (await b.count()) await b.first().click();
}
