import {
  configHash, encodeCoveredConfig, erc721Abi, marketAbi, readRight, rightAbi,
  rightsTx, sameAddress, verifyCoveredRecovery, type CoveredNFTConfig,
} from "@market/protocol";
import { type Address, type Hex } from "viem";
import { DEPLOYMENT as d } from "@/lib/deployment";
import { Stop, type Step, type StepCtx } from "./txflow";

export type RightDraft = { nft: Address; tokenId: string; price: string; deadline: string; maxRoyaltyBps: number; salt: Hex };
export const rightDraftKey = (wallet: Address) => `market:right:${d.deploymentId}:${wallet.toLowerCase()}`;
export const configOf = (draft: RightDraft, issuer: Address): CoveredNFTConfig => ({
  nft: draft.nft, tokenId: BigInt(draft.tokenId), price: BigInt(draft.price), proceedsTo: issuer, maxRoyaltyBps: draft.maxRoyaltyBps,
});

export async function predictedRight(c: StepCtx, draft: RightDraft): Promise<Address> {
  if (!d.coveredNFTPurchase) throw new Stop("This release doesn't support execution rights.");
  return c.pub.readContract({ address: d.market, abi: marketAbi, functionName: "rightAddress",
    args: [c.account, d.coveredNFTPurchase, configHash(encodeCoveredConfig(configOf(draft, c.account))), BigInt(draft.deadline), c.account, draft.salt] });
}

const exists = async (c: StepCtx, a: Address) => !!await c.pub.getCode({ address: a });

/** Resumes from authenticated state; the issuer is always the actual wallet account. */
export function issuanceSteps(draft: RightDraft): Step[] {
  return [
    { key: "create", label: "Create pending right", done: async (c) => exists(c, await predictedRight(c, draft)),
      call: async (c) => {
        const config = configOf(draft, c.account);
        if (BigInt(draft.deadline) <= (await c.pub.getBlock()).timestamp) throw new Stop("Choose a future exercise deadline.");
        const owner = await c.pub.readContract({ address: config.nft, abi: erc721Abi, functionName: "ownerOf", args: [config.tokenId] });
        if (!sameAddress(owner, c.account)) throw new Stop("You no longer own this nft.");
        return rightsTx.createRight(d, config, BigInt(draft.deadline), c.account, draft.salt);
      } },
    { key: "deposit", label: "Deposit the nft", done: async (c) => {
        const owner = await c.pub.readContract({ address: draft.nft, abi: erc721Abi, functionName: "ownerOf", args: [BigInt(draft.tokenId)] });
        return sameAddress(owner, await predictedRight(c, draft));
      }, call: async (c) => {
        const account = await predictedRight(c, draft);
        if (await exists(c, account)) {
          const r = await readRight(c.pub, d, account, { config: encodeCoveredConfig(configOf(draft, c.account)) });
          if (r.stateCode !== 0 || !r.supported || r.configError || !sameAddress(r.issuer, c.account) || !sameAddress(r.residual, c.account)
            || r.config !== encodeCoveredConfig(configOf(draft, c.account)) || !sameAddress(r.nft, draft.nft)
            || r.assetId !== BigInt(draft.tokenId) || r.deadline !== BigInt(draft.deadline) || r.effectiveExpired)
            throw new Stop("This pending account doesn't match your intended deposit.");
        } else if (!c.batch) throw new Stop("Create and verify the pending account first.");
        // An undeployed account is used only inside the explicitly chosen atomic batch,
        // whose preceding factory call fixes these arguments and rolls back with any failure.
        return { address: draft.nft, abi: erc721Abi, functionName: "transferFrom", args: [c.account, account, BigInt(draft.tokenId)] } as const;
      } },
    { key: "activate", label: "Activate the right", done: async (c) => {
        const a = await predictedRight(c, draft);
        return await exists(c, a) && (await c.pub.readContract({ address: a, abi: rightAbi, functionName: "state" })) === 1;
      }, call: async (c) => {
        const a = await predictedRight(c, draft);
        if (!c.batch) {
          const r = await readRight(c.pub, d, a, { config: encodeCoveredConfig(configOf(draft, c.account)) });
          if (!r.supported || r.configError || r.stateCode !== 0 || !r.backed || r.proceedsTo === "0x0000000000000000000000000000000000000000" || !sameAddress(r.residual, r.issuer) || !sameAddress(r.issuer, c.account) || !sameAddress(r.residual, c.account))
            throw new Stop("The pending right isn't ready to activate.");
        }
        return rightsTx.activateRight(a, encodeCoveredConfig(configOf(draft, c.account)));
      } },
  ];
}

export function rightAction(account: Address, action: "activate" | "deposit" | "exercise" | "surrender" | "expire" | "cancel" | "recover" | "recoverEth" | "transfer" | "release" | "withdraw", recipient?: Address, config?: Hex): Step[] {
  return [{ key: action, label: ({ activate: "Activate right", deposit: "Deposit nft", exercise: "Exercise right", surrender: "Surrender right", expire: "Finalize expiry", cancel: "Cancel pending setup", recover: "Recover backing", recoverEth: "Recover free eth", transfer: "Transfer right", release: "Release payment", withdraw: "Withdraw your payment" })[action], call: async (c) => {
    const r = await readRight(c.pub, d, account, { config });
    if (["activate", "deposit", "exercise"].includes(action) && (!r.supported || r.configError || !r.config)) throw new Stop(r.configError || "Exercise terms couldn't be verified.");
    switch (action) {
      case "activate":
        if (r.stateCode !== 0 || !r.backed || r.proceedsTo === "0x0000000000000000000000000000000000000000" || !sameAddress(r.residual, r.issuer) || !sameAddress(r.issuer, c.account)) throw new Stop("This right isn't ready to activate.");
        return rightsTx.activateRight(account, r.config!);
      case "deposit":
        if (r.stateCode !== 0 || r.effectiveExpired || r.proceedsTo === "0x0000000000000000000000000000000000000000" || !sameAddress(r.issuer, c.account) || !sameAddress(r.residual, c.account)) throw new Stop("The pending deposit terms don't match your wallet.");
        return { address: r.nft!, abi: erc721Abi, functionName: "transferFrom", args: [c.account, account, r.assetId!] } as const;
      case "exercise":
        if (r.stateCode !== 1 || !(r.stateCode === 1 && !r.effectiveExpired) || !r.backed || !sameAddress(r.holder, c.account)) throw new Stop("Only the current holder of a live backed right can exercise.");
        return rightsTx.exerciseRight(account, r.config!, recipient ?? c.account, r.price!);
      case "surrender":
        if (!(r.stateCode === 1 && !r.effectiveExpired) || !sameAddress(r.holder, c.account)) throw new Stop("You no longer hold this live right.");
        return rightsTx.surrenderRight(account);
      case "expire":
        if (!r.effectiveExpired || (r.stateCode !== 0 && r.stateCode !== 1)) throw new Stop("This right hasn't reached its deadline.");
        return rightsTx.finalizeRight(account);
      case "cancel":
        if (r.stateCode !== 0 || !sameAddress(r.issuer, c.account)) throw new Stop("Only the issuer can cancel pending setup.");
        return rightsTx.cancelRightSetup(account);
      case "recover":
        const verified = await verifyCoveredRecovery(c.pub, d, account, c.account, config ?? r.config ?? "0x");
        return rightsTx.recoverRightNft(account, verified.nft!, verified.assetId!, c.account);
      case "transfer":
        if (r.stateCode !== 1 || r.effectiveExpired || !sameAddress(r.holder, c.account) || !recipient || sameAddress(recipient, account)) throw new Stop("Only the holder can transfer this live entitlement to another account.");
        return { address: d.rights!, abi: erc721Abi, functionName: "transferFrom", args: [c.account, recipient, r.tokenId] } as const;
      case "recoverEth":
        if (r.stateCode < 2 || !sameAddress(r.residual, c.account) || r.balance <= r.totalCredits) throw new Stop("There is no free eth for your wallet to recover.");
        return rightsTx.recoverRightEth(account, c.account, r.balance - r.totalCredits);
      case "release":
        if (!recipient || await c.pub.readContract({ address: account, abi: rightAbi, functionName: "creditOf", args: [recipient] }) === 0n) throw new Stop("This beneficiary has no payment to release.");
        return rightsTx.releaseRightCredit(account, recipient);
      case "withdraw":
        if (await c.pub.readContract({ address: account, abi: rightAbi, functionName: "creditOf", args: [c.account] }) === 0n) throw new Stop("Your wallet has no payment credit here.");
        return rightsTx.withdrawRightCredit(account, recipient ?? c.account);
    }
  } }];
}
