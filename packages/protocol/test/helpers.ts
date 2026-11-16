import { decodeEventLog, type Address, type Hex, type TransactionReceipt } from "viem";
import { marketAbi } from "../src/abis";
import { gasWithHeadroom } from "../src/tx";
import type { Chain } from "../devchain";

/** Simulate, send, wait. Returns the receipt and the ETH the sender paid for gas. */
export async function send(c: Chain, from: Address, call: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[]; value?: bigint }) {
  const { request } = await c.pub.simulateContract({ ...call, account: from } as never);
  const gas = gasWithHeadroom(await c.pub.estimateContractGas({ ...call, account: from } as never));
  const hash = await c.wallet(from).writeContract({ ...(request as object), gas } as never);
  return settle(c, hash);
}

export async function sendValue(c: Chain, from: Address, to: Address, value: bigint) {
  const hash = await c.wallet(from).sendTransaction({ to, value, account: from, chain: c.chain });
  return settle(c, hash);
}

async function settle(c: Chain, hash: Hex) {
  const receipt = await c.pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    const t = await c.pub.getTransaction({ hash });
    const trace = await c.pub.request({ method: "debug_traceTransaction" as never, params: [hash, { tracer: "callTracer" }] as never }).catch(() => null);
    throw new Error(`reverted ${hash} gas ${receipt.gasUsed}/${t.gas} to ${t.to} ${JSON.stringify(trace, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 600)}`);
  }
  return { receipt, gas: receipt.gasUsed * receipt.effectiveGasPrice };
}

/** The order address from a create receipt's `Market.Created` log. */
export function createdOrder(r: TransactionReceipt): Address {
  for (const log of r.logs) {
    try {
      const e = decodeEventLog({ abi: marketAbi, ...log });
      if (e.eventName === "Created") return e.args.order;
    } catch {}
  }
  throw new Error("no Created log");
}

export async function balances(c: Chain, who: Record<string, Address>) {
  const out: Record<string, bigint> = {};
  for (const [k, a] of Object.entries(who)) out[k] = await c.pub.getBalance({ address: a });
  return out;
}

export async function now(c: Chain) {
  return (await c.pub.getBlock()).timestamp;
}

/** Make the next block's timestamp `t` (absolute) and mine it. */
export async function warp(c: Chain, t: bigint) {
  await c.test.setNextBlockTimestamp({ timestamp: t });
  await c.test.mine({ blocks: 1 });
}
