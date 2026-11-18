"use client";
// One engine for every write (PLAN.md §6): build each step's call from live reads, simulate it,
// estimate gas with headroom, send, wait, decode failures. Multi-step flows run as one atomic
// batch (EIP-5792) when the wallet supports it and the batch simulates. Failed atomic preparation
// stops; choosing separate transactions is explicit. Wallets without batching use staged steps.
// Step state is re-derived from chain on each run, so a reload resumes where it stopped.
import { decodeRevert, gasWithHeadroom, revertCopy, verifyDeployment, type ContractCall, type ErrorContext } from "@market/protocol";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { encodeFunctionData, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import { DEPLOYMENT } from "@/lib/deployment";
import { indexer, paths } from "./indexer";

export type Call = ContractCall | { to: Address; value: bigint };
export type StepState = "todo" | "wallet" | "pending" | "done" | "failed";

export type Step = {
  key: string;
  label: string;
  skippedNote?: string;
  /** True when this step's effect is already on chain (resume). */
  done?: (c: StepCtx) => Promise<boolean>;
  /** Live checks, then the call. Throw an Error with user copy to stop before the wallet. */
  call: (c: StepCtx) => Promise<Call>;
};

/** `batch`: the call is being built for an atomic batch, before earlier steps exist on chain, so
 * per-step simulation would fail; the batch is simulated as a whole instead. */
export type StepCtx = { pub: PublicClient; account: Address; results: Record<string, unknown>; batch?: boolean };

export type FlowState = {
  states: StepState[];
  /** Index of the step being worked on, or null. */
  current: number | null;
  error: string | null;
  /** Muted note, e.g. "Cancelled in wallet." */
  note: string | null;
  hashes: Hex[];
  running: boolean;
  done: boolean;
};

const isContract = (c: Call): c is ContractCall => "abi" in c;
const toRaw = (c: Call) =>
  isContract(c)
    ? { to: c.address, data: encodeFunctionData(c as never), value: ("value" in c ? c.value : 0n) as bigint }
    : { to: c.to, data: "0x" as Hex, value: c.value };

async function simulate(pub: PublicClient, account: Address, c: Call) {
  if (isContract(c)) {
    const { request } = await pub.simulateContract({ ...(c as object), account } as never);
    const gas = gasWithHeadroom(await pub.estimateContractGas({ ...(c as object), account } as never));
    return { request: request as object, gas };
  }
  const gas = gasWithHeadroom(await pub.estimateGas({ account, to: c.to, value: c.value }));
  return { request: { to: c.to, value: c.value }, gas };
}

async function supportsAtomic(wallet: WalletClient, account: Address, chainId: number) {
  try {
    const caps = (await wallet.getCapabilities({ account })) as Record<number, { atomic?: { status?: string } }>;
    const s = caps[chainId]?.atomic?.status;
    return s === "supported" || s === "ready";
  } catch {
    return false;
  }
}

/** Wait until the indexer has processed `block`, so refetched lists include the write. */
async function indexerAt(block: bigint) {
  for (let i = 0; i < 40; i++) {
    try {
      const st = await indexer<{ block: string }>(paths.status());
      if (BigInt(st.block) >= block) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 750));
  }
}

export type ExecutionMode = "auto" | "atomic" | "staged";

export function useTxFlow(steps: Step[], ctx: ErrorContext, mode: ExecutionMode = "auto") {
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();
  const qc = useQueryClient();
  const results = useRef<Record<string, unknown>>({});
  const [s, set] = useState<FlowState>({
    states: steps.map(() => "todo"),
    current: null,
    error: null,
    note: null,
    hashes: [],
    running: false,
    done: false,
  });

  const fail = (i: number | null, e: unknown) => {
    const r = decodeRevert(e);
    if (r.name === "UserRejected") {
      set((p) => ({ ...p, states: p.states.map((x, j) => (j === i ? "todo" : x)), running: false, current: null, note: "Cancelled in wallet." }));
      return;
    }
    // Our own checks (Stop, OrderCheckError) carry user copy; viem errors carry a revert.
    const own = e instanceof Error && !("shortMessage" in e);
    const copy = own ? e.message : revertCopy(r, ctx);
    set((p) => ({ ...p, states: p.states.map((x, j) => (j === i ? "failed" : x)), running: false, current: null, error: copy }));
  };

  const run = useCallback(async () => {
    if (!pub || !wallet?.account) return;
    const account = wallet.account.address;
    const c: StepCtx = { pub, account, results: results.current };
    set((p) => ({ ...p, running: true, error: null, note: null }));

    // Resume: mark steps already done on chain.
    const done = await Promise.all(steps.map((st) => st.done?.(c).catch(() => false) ?? Promise.resolve(false)));
    let states: StepState[] = done.map((d) => (d ? "done" : "todo"));
    set((p) => ({ ...p, states, note: steps.find((step, i) => done[i] && step.skippedNote)?.skippedNote ?? p.note }));
    const todo = steps.map((_, i) => i).filter((i) => !done[i]);

    let block = 0n;
    try {
      // Atomic batch: every remaining call must be buildable now (later steps use predicted
      // addresses) and the batch must simulate as a whole.
      if (await pub.getChainId() !== DEPLOYMENT.chainId || wallet.chain?.id !== DEPLOYMENT.chainId)
        throw new Stop("Switch to the selected network before signing.");
      if (DEPLOYMENT.startBlock === null || (await verifyDeployment(pub, DEPLOYMENT)).length)
        throw new Stop("The selected Market deployment could not be verified.");
      const atomic = todo.length > 1 && mode !== "staged" && await supportsAtomic(wallet, account, pub.chain!.id);
      if (todo.length > 1 && mode === "atomic" && !atomic)
        throw new Stop("This wallet doesn't provide atomic execution. Choose separate transactions to continue.");
      if (atomic) {
        // A failed atomic preparation never changes into separate transactions implicitly.
        const prepared = await (async () => {
          const calls: Call[] = [];
          for (const i of todo) calls.push(await steps[i]!.call({ ...c, batch: true }));
          const sim = await pub.simulateCalls({ account, calls: calls.map(toRaw) });
          return sim.results.every((r) => r.status === "success") ? calls : null;
        })().catch(() => null);
        if (!prepared) throw new Stop("The atomic batch could not be prepared. Nothing was sent. Choose separate transactions explicitly if you want a staged flow.");
        if (prepared) {
          const calls = prepared;
          set((p) => ({ ...p, current: todo[0]!, states: p.states.map((x, j) => (todo.includes(j) ? "wallet" : x)) }));
          const { id } = await wallet.sendCalls({ account, chain: pub.chain, calls: calls.map(toRaw), forceAtomic: true });
          set((p) => ({ ...p, states: p.states.map((x, j) => (todo.includes(j) ? "pending" : x)) }));
          const status = await wallet.waitForCallsStatus({ id, timeout: 180_000 });
          const receipts = status.receipts ?? [];
          if (status.status !== "success") throw new Error("The transaction failed. Nothing changed.");
          block = receipts.reduce((m, r) => (r.blockNumber > m ? r.blockNumber : m), 0n);
          states = states.map(() => "done");
          set((p) => ({ ...p, states, hashes: receipts.map((r) => r.transactionHash), current: null }));
          await indexerAt(block);
          await qc.invalidateQueries();
          set((p) => ({ ...p, running: false, done: true }));
          return;
        }
      }

      for (const i of todo) {
        // Earlier confirmations can change later eligibility, including crossing a deadline.
        if (await steps[i]!.done?.(c)) {
          set(p => ({ ...p, states: p.states.map((x, j) => j === i ? "done" : x), note: steps[i]!.skippedNote ?? p.note }));
          continue;
        }
        set((p) => ({ ...p, current: i, states: p.states.map((x, j) => (j === i ? "wallet" : x)) }));
        const call = await steps[i]!.call(c);
        let sim: Awaited<ReturnType<typeof simulate>>;
        try {
          sim = await simulate(pub, account, call);
        } catch (e) {
          return fail(i, e);
        }
        const hash = isContract(call)
          ? await wallet.writeContract({ ...(sim.request as object), gas: sim.gas, account, chain: pub.chain } as never)
          : await wallet.sendTransaction({ to: call.to, value: call.value, gas: sim.gas, account, chain: pub.chain });
        set((p) => ({ ...p, hashes: [...p.hashes, hash], states: p.states.map((x, j) => (j === i ? "pending" : x)) }));
        const receipt = await pub.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          // Re-run the call at the failing block to recover its reason.
          const reason = await pub
            .call({ account, ...toRaw(call), blockNumber: receipt.blockNumber })
            .then(() => new Error("The transaction failed. Network gas was spent."))
            .catch((e) => e);
          return fail(i, reason);
        }
        results.current[steps[i]!.key] = receipt;
        block = receipt.blockNumber;
        set((p) => ({ ...p, states: p.states.map((x, j) => (j === i ? "done" : x)) }));
      }
      await indexerAt(block);
      await qc.invalidateQueries();
      set((p) => ({ ...p, running: false, current: null, done: true }));
    } catch (e) {
      fail(null, e);
      set((p) => ({ ...p, states: p.states.map((x) => (x === "wallet" || x === "pending" ? "todo" : x)) }));
    }
  }, [pub, wallet, steps, ctx, qc, mode]);

  const reset = () => set({ states: steps.map(() => "todo"), current: null, error: null, note: null, hashes: [], running: false, done: false });
  return { ...s, run, reset, ready: !!wallet?.account && !!pub };
}

/** A user-facing stop raised by a step's live checks. */
export class Stop extends Error {}
