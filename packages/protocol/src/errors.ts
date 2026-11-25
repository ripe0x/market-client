import { decodeErrorResult, type Hex } from "viem";
import { erc721ErrorsAbi, marketAbi, nftBidAbi, nftSaleAbi, orderAbi, rightAbi, rightsAbi, coveredNFTPurchaseAbi } from "./abis";
import { eth, pct, when } from "./format";

/** Every custom error a Market transaction can revert with, for decoding raw revert data. */
export const revertAbi = [...orderAbi, ...marketAbi, ...nftSaleAbi, ...nftBidAbi, ...erc721ErrorsAbi, ...rightAbi, ...rightsAbi, ...coveredNFTPurchaseAbi].filter(
  (x) => x.type === "error",
);

export type Revert =
  | { name: "UserRejected" }
  | { name: string; args: readonly unknown[] }
  | { name: "Unknown"; message: string; data?: Hex };

/** Walk an error's `cause` chain. By name, not `instanceof`: Ponder and wallets may bundle
 * their own copy of viem, whose error classes are different objects. */
function find(err: unknown, name: string): Record<string, unknown> | null {
  for (let e = err as Record<string, unknown> | undefined, i = 0; e && i < 20; e = e.cause as Record<string, unknown>, i++) {
    if (e.name === name) return e;
  }
  return null;
}

/** Find the revert reason in any viem error (simulation, estimate, write, multicall). */
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
  kind: "sale" | "bid" | "right";
  /** "#212" */
  token?: string;
  /** Viewer owns the order. */
  owner?: boolean;
};

/**
 * Product copy for a decoded revert (PLAN.md §7). Plain, present tense, what happened and what
 * to do. Returns null for a wallet rejection, which the UI shows as a muted reset.
 */
export function revertCopy(r: Revert, ctx: ErrorContext): string | null {
  const thing = ctx.kind === "right" ? "right" : ctx.kind === "sale" ? "listing" : "offer";
  const a = "args" in r ? r.args : [];
  const big = (i: number) => (typeof a[i] === "bigint" ? (a[i] as bigint) : 0n);
  switch (r.name) {
    case "WrongPayment": return "Send the exact committed exercise price.";
    case "DeadlinePassed": return "This right has expired. It cannot be exercised or transferred.";
    case "WrongState": return "This right is no longer in the required state. Refresh its details.";
    case "ResidualNotIssuer": return "The covered nft account must return collateral to its issuer.";
    case "EncumberedBalance": return "This eth is reserved for unpaid beneficiaries.";
    case "NotARight": return "This is not a canonical right account.";
    case "UserRejected":
      return null;
    case "NotStarted":
      return `This ${thing} opens ${when(big(0))}.`;
    case "Expired":
      return ctx.owner
        ? `Expired ${when(big(0))}. Cancel and withdraw to get ${ctx.kind === "sale" ? (ctx.token ?? "the NFT") : "the ETH"} back.`
        : `This ${thing} expired ${when(big(0))}.`;
    case "AboveMaxPrice":
      return `The price rose to ${eth(big(0), "up")} ETH before this confirmed. Nothing was bought.`;
    case "Underpaid":
      return "The payment was below the price. Nothing was bought.";
    case "RoyaltyAboveLimit":
      return ctx.owner
        ? "Sale stopped: the collection's royalty is above your limit. Cancel and list again to sell."
        : "Sale stopped: the collection's royalty is above the seller's limit.";
    case "InsufficientFunds":
      return ctx.owner
        ? "Underfunded. Add funds or cancel."
        : `This offer holds ${eth(big(1))} ETH, less than its ${eth(big(0), "up")} ETH price.`;
    case "BelowMinProceeds":
      return "The price or royalty changed before this confirmed. Nothing was sold.";
    case "WrongToken":
      return "This offer is for a different token.";
    case "NotDelivered":
      return "The collection did not complete the transfer. Nothing changed.";
    case "BadRoyalty":
      return "This collection reports a royalty with no receiver, so it can't be traded here.";
    case "OrderClosed":
      return ctx.kind === "sale" ? "This listing has sold or been cancelled." : "This offer is closed.";
    case "HandlerCodeChanged":
      return "This order can't be filled: its handler's code changed.";
    case "ZeroAddress":
      return ctx.owner ? "This order can never fill. Cancel to recover." : `This ${thing} can't be filled.`;
    case "Unauthorized":
      return ctx.kind === "right" ? "The connected account cannot perform this right action." : "Only the owner can do this.";
    case "WrongConfig":
      return `This ${thing}'s terms didn't match. Nothing was sent.`;
    case "ERC721InsufficientApproval":
      return `Approve ${ctx.token ?? "the NFT"} for offers first.`;
    case "ERC721IncorrectOwner":
    case "ERC721NonexistentToken":
      return `You no longer hold ${ctx.token ?? "this NFT"}.`;
    default:
      return "This transaction would fail. Nothing was sent.";
  }
}

export { pct };
