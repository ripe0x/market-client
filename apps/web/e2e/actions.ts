// Helpers for the Actions-token / reserved-action e2e: the local Artwork example (mint, reads) and
// listing an Actions token for resale. Self-contained (own test client) so it doesn't depend on
// helpers.ts internals. Real transactions on the seeded Anvil.
import { createTestClient, http, parseEther, type Address } from "viem";
import { artworkAbi, erc721Abi, fixedSchedule, predictOrderAddress, randomSalt, tx } from "@market/protocol";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RPC, D, pub, wallet, chain, mineBlocks, waitIndexer } from "./helpers";

const test = createTestClient({ chain, transport: http(RPC), mode: "anvil" });
const ARTIST = "0xCB43078C32423F5348Cab5885911C3B5faE217F9" as Address; // Artwork's fixed artist

const send = async (account: Address, call: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[]; value?: bigint }) =>
  pub.waitForTransactionReceipt({ hash: await wallet(account).writeContract({ ...(call as object), account, chain } as never) });

/** The local Artwork example address, written to .local-chain.json by `pnpm dev:chain`. */
export function artworkAddr(): Address {
  const j = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../.local-chain.json"), "utf8")) as { artwork?: string };
  if (!j.artwork) throw new Error("No artwork address in .local-chain.json (restart dev:chain)");
  return j.artwork as Address;
}

/** Mint an Artwork token to `to` by impersonating the fixed artist (local setup only). */
export async function mintArtwork(to: Address, tokenId: bigint) {
  const art = artworkAddr();
  await test.setBalance({ address: ARTIST, value: parseEther("1") });
  await test.impersonateAccount({ address: ARTIST });
  await send(ARTIST, { address: art, abi: artworkAbi, functionName: "mint", args: [to, tokenId] });
  await test.stopImpersonatingAccount({ address: ARTIST });
}

export const artColor = (id: bigint) => pub.readContract({ address: artworkAddr(), abi: artworkAbi, functionName: "colorOf", args: [id] }) as Promise<number>;
export const artRenderer = (id: bigint) => pub.readContract({ address: artworkAddr(), abi: artworkAbi, functionName: "rendererOf", args: [id] }) as Promise<number>;

/** List the Actions token for a covered right (id == backing account) as a fixed-price resale. */
export async function listActionsForResale(seller: Address, account: Address, premiumWei: bigint, proceedsTo: Address = seller): Promise<Address> {
  const tokenId = BigInt(account);
  const spec = tx.saleSpec(D, { issuer: seller, nft: D.actions!, tokenId, schedule: fixedSchedule(premiumWei), proceedsTo, maxRoyaltyBps: 0 });
  const salt = randomSalt();
  const order = await predictOrderAddress(pub, D, seller, spec, salt) as Address;
  await send(seller, tx.create(D, spec, salt));
  await send(seller, tx.depositNft(D.actions!, seller, order, tokenId));
  await send(seller, tx.activate(order));
  await mineBlocks();
  await waitIndexer();
  return order;
}

/** Surrender a held covered right on chain (burns its Actions token; residual can then recover). */
export const surrenderOnChain = (holder: Address, account: Address) => send(holder, tx.surrender(account));

/** actions.ownerOf, resolving to null when the token is burned (nonexistent). */
export const actionsOwner = (id: bigint) => pub.readContract({ address: D.actions!, abi: erc721Abi, functionName: "ownerOf", args: [id] }).then((o) => o as Address).catch(() => null);
