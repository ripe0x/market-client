// Covered purchase rights in the unified model are ordinary orders (kind "covered", admission
// "holder"): the backing account == the order address, and issuance is the shared escrow flow
// (create pending -> deposit NFT -> activate). All the lifecycle actions (exercise, surrender,
// finalize, recover, credits) live in data/flows.ts and are wired from RightsView.
import { predictOrderAddress, tx, type OrderSpec } from "@market/protocol";
import type { Address, Hex, PublicClient } from "viem";
import { DEPLOYMENT as d } from "@/lib/deployment";
import { escrowListingSteps } from "@/data/flows";
import type { Step } from "./txflow";

export type RightDraft = { nft: Address; tokenId: string; price: string; deadline: string; maxRoyaltyBps: number; salt: Hex };

export const rightDraftKey = (wallet: Address) => `market:right:${d.deploymentId}:${wallet.toLowerCase()}`;

/** The covered-purchase OrderSpec for a draft; issuer is proceeds + residual beneficiary. */
export const coveredSpecOf = (draft: RightDraft, issuer: Address): OrderSpec =>
  tx.coveredSpec(d, {
    issuer,
    nft: draft.nft,
    tokenId: BigInt(draft.tokenId),
    price: BigInt(draft.price),
    proceedsTo: issuer,
    maxRoyaltyBps: draft.maxRoyaltyBps,
    deadline: BigInt(draft.deadline),
  });

/** The address Market.create would deploy this covered right to. */
export const predictedRight = (c: { pub: PublicClient; account: Address }, draft: RightDraft): Promise<Address> =>
  predictOrderAddress(c.pub, d, c.account, coveredSpecOf(draft, c.account), draft.salt);

/** Create the pending right, escrow the NFT, and activate — the shared escrow flow, resumable and
 * collapsible into one atomic batch. The issuer is the connected wallet. */
export const issuanceSteps = (draft: RightDraft, issuer: Address): Step[] =>
  escrowListingSteps(coveredSpecOf(draft, issuer), draft.salt, { nft: draft.nft, tokenId: BigInt(draft.tokenId), kind: "covered" }, `#${draft.tokenId}`);
