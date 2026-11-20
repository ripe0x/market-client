import { decodeErrorResult, type Hex } from "viem";
import {
  acquireAndExecuteAbi, actionsAbi, coveredNFTPurchaseAbi, erc721ErrorsAbi, exchangeActionAbi,
  feeConfigAbi, marketAbi, orderAbi, reservedActionAbi, reservedActionTargetAbi,
} from "./abis";
import { eth, pct, when } from "./format";

/** Every custom error a Market transaction can revert with, for decoding raw revert data. */
export const revertAbi = [
  ...orderAbi, ...marketAbi, ...exchangeActionAbi, ...coveredNFTPurchaseAbi, ...reservedActionAbi,
  ...actionsAbi, ...feeConfigAbi, ...acquireAndExecuteAbi, ...reservedActionTargetAbi, ...erc721ErrorsAbi,
].filter((x) => x.type === "error");

export type Revert =
  | { name: "UserRejected" }
  | { name: string; args: readonly unknown[] }
  | { name: "Unknown"; message: string; data?: Hex };

/** Walk an error's `cause` chain by name, not `instanceof`: Ponder and wallets may bundle their
 * own copy of viem, whose error classes are different objects. */
function find(err: unknown, name: string): Record<string, unknown> | null {
  for (let e = err as Record<string, unknown> | undefined, i = 0; e && i < 20; e = e.cause as Record<string, unknown>, i++) {
    if (e.name === name) return e;
  }
  return null;
}

export function decodeRevert(err: unknown): Revert {
  if (find(err, "UserRejectedRequestError")) return { name: "UserRejected" };
  const r = find(err, "ContractFunctionRevertedError") as
    | { data?: { errorName?: string; args?: readonly unknown[] }; raw?: Hex; reason?: string; shortMessage?: string }
    | null;
  if (r) {
    if (r.data?.errorName) return { name: r.data.errorName, args: r.data.args ?? [] };
    if (r.raw && r.raw !== "0x") {
      try {
        const d = decodeErrorResult({ abi: revertAbi, data: r.raw });
        return { name: d.errorName, args: d.args ?? [] };
      } catch {
        return { name: "Unknown", message: r.reason ?? r.shortMessage ?? "", data: r.raw };
      }
    }
    return { name: "Unknown", message: r.reason ?? r.shortMessage ?? "" };
  }
  const message = err instanceof Error ? ((err as { shortMessage?: string }).shortMessage ?? err.message) : String(err);
  if (/user rejected|user denied|rejected the request/i.test(message)) return { name: "UserRejected" };
  return { name: "Unknown", message };
}

export type ErrorContext = {
  kind: "sale" | "bid" | "covered" | "reserved" | "action";
  /** "#212" */
  token?: string;
  /** Viewer owns the order (issuer / holder). */
  owner?: boolean;
};

/**
 * Product copy for a decoded revert (PLAN.md §7). Plain, present tense, what happened and what to
 * do; never the word "option". Returns null for a wallet rejection, which the UI shows as a muted
 * reset.
 */
export function revertCopy(r: Revert, ctx: ErrorContext): string | null {
  const thing = ctx.kind === "sale" ? "listing" : ctx.kind === "bid" ? "offer" : ctx.kind === "covered" ? "purchase right" : ctx.kind === "reserved" ? "reserved action" : "action";
  const a = "args" in r ? r.args : [];
  const big = (i: number) => (typeof a[i] === "bigint" ? (a[i] as bigint) : 0n);
  switch (r.name) {
    case "UserRejected":
      return null;
    // ---- Order lifecycle ----
    case "WrongState":
      return `This ${thing} is no longer in the required state. Refresh its details.`;
    case "Busy":
      return "This order is mid-operation. Try again in a moment.";
    case "DeadlinePassed":
      return ctx.owner ? `This ${thing} has expired. Finalize expiry, then recover.` : `This ${thing} has expired.`;
    case "NotExpired":
      return "This has not reached its deadline yet.";
    case "Incomplete":
      return "This action did not complete, so nothing changed.";
    case "ActionCodeChanged":
      return `This ${thing} can't run: its action contract's code changed.`;
    case "EncumberedBalance":
    case "InsufficientFunds":
      return ctx.owner
        ? "Not enough free ETH. Some is reserved for unpaid beneficiaries; add funds or withdraw credits."
        : `This offer holds ${eth(big(1))} ETH, less than its ${eth(big(0), "up")} ETH price.`;
    case "Unauthorized":
    case "NotAuthorized":
      return "The connected account cannot perform this action.";
    case "TransferFailed":
      return "A recipient refused the ETH transfer. Nothing changed.";
    // ---- ExchangeAction / trading ----
    case "NotStarted":
      return `This ${thing} opens ${when(big(0))}.`;
    case "AboveMaxPrice":
      return `The price rose to ${eth(big(0), "up")} ETH before this confirmed. Nothing was bought.`;
    case "Underpaid":
      return "The payment was below the price. Nothing was bought.";
    case "RoyaltyAboveLimit":
      return ctx.owner
        ? "Stopped: the collection's royalty is above your limit. Cancel and list again to sell."
        : "Stopped: the collection's royalty is above the seller's limit.";
    case "BelowMinProceeds":
      return "The price or royalty changed before this confirmed. Nothing was sold.";
    case "WrongToken":
      return "This offer is for a different token.";
    case "NotHeld":
      return ctx.kind === "bid" ? `You no longer hold ${ctx.token ?? "this NFT"}.` : "The order no longer holds this NFT.";
    case "NotEscrowed":
    case "NotCovered":
      return ctx.owner ? "Deposit the NFT into the order before activating." : "This order is not holding its NFT.";
    case "NotDelivered":
      return "The collection did not complete the transfer. Nothing changed.";
    case "BadRoyalty":
      return "This collection reports a royalty with no receiver, so it can't be traded here.";
    case "FeeAboveMax":
      return `The trading fee (${pct(big(0))}) is above this ${thing}'s cap (${pct(big(1))}).`;
    case "UnexpectedValue":
      return "A bid execution takes no ETH.";
    case "ActionNotLive":
      return "The underlying action is no longer live, so its token can't move.";
    case "ActionTimeLeft":
      return "The underlying action has less time left than required.";
    case "InvalidLifetime":
      return "A minimum lifetime applies only to Actions tokens.";
    // ---- Covered / reserved ----
    case "WrongPayment":
      return `Send the exact price (${eth(big(0), "up")} ETH).`;
    case "BadRecipient":
      return "Choose a valid recipient.";
    case "ReservationMismatch":
      return "The target's reservation does not match this order. Nothing changed.";
    case "TargetChanged":
      return "The target contract's code changed. Nothing changed.";
    case "NotConsumed":
      return "The target did not record the action as performed.";
    // ---- AcquireAndExecute ----
    case "PriceAboveLimit":
      return `The premium or total exceeded your limit (premium ${eth(big(0), "up")} ETH). Nothing was bought.`;
    case "Mismatch":
      return "The listing or account no longer matches. Refresh and try again.";
    case "RefundFailed":
      return "The refund recipient refused ETH. Nothing changed.";
    // ---- ERC721 ----
    case "ERC721InsufficientApproval":
      return `Approve ${ctx.token ?? "the NFT"} for ExchangeAction first.`;
    case "ERC721IncorrectOwner":
    case "ERC721NonexistentToken":
      return `You no longer hold ${ctx.token ?? "this NFT"}.`;
    case "InvalidTransfer":
      return "This Actions token can move only while its underlying order is live.";
    default:
      return "This transaction would fail. Nothing was sent.";
  }
}

export { pct };
