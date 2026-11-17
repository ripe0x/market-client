// Test-only wallet: an EIP-1193 provider injected into the page by Playwright (never part of the
// app bundle). It forwards every request to the local Anvil, whose default accounts are unlocked,
// so transactions are real transactions on a real chain; only the wallet's UI is replaced.
import type { Page } from "@playwright/test";

export const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8645";
/** Anvil account 1: the seeded "me" (packages/protocol/devchain/seed.ts). */
export const ME = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

/**
 * `atomic: true` makes the wallet report EIP-5792 atomic support and accept `wallet_sendCalls`.
 * It runs the calls one after another from the unlocked account (Anvil has no atomic batch), so
 * it tests the app's batch path, not atomicity. `window.__walletPrompts` counts prompts.
 */
export async function injectWallet(page: Page, account = ME, rpc = RPC, opts: { atomic?: boolean } = {}) {
  await page.addInitScript(
    ({ account, rpc, atomic }) => {
      let id = 0;
      const w = window as unknown as { __walletPrompts: number };
      w.__walletPrompts = 0;
      const batches: Record<string, unknown[]> = {};
      const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
      const call = async (method: string, params: unknown[] = []) => {
        const r = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
        const j = await r.json();
        if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code, data: j.error.data });
        return j.result;
      };
      const provider = {
        isMetaMask: false,
        request: async ({ method, params }: { method: string; params?: unknown[] }) => {
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [account];
            case "eth_chainId":
              return "0x7a69";
            case "wallet_switchEthereumChain":
            case "wallet_addEthereumChain":
              return null;
            case "wallet_getCapabilities":
              return atomic ? { "0x7a69": { atomic: { status: "supported" } } } : {};
            case "wallet_sendCalls": {
              if (!atomic) throw Object.assign(new Error("unsupported"), { code: 4200 });
              w.__walletPrompts++;
              const [{ calls }] = params as [{ calls: { to: string; data?: string; value?: string }[] }];
              const receipts: unknown[] = [];
              for (const c of calls) {
                const hash = await call("eth_sendTransaction", [{ from: account, to: c.to, data: c.data ?? "0x", value: c.value ?? "0x0" }]);
                let r = null;
                while (!(r = await call("eth_getTransactionReceipt", [hash]))) await new Promise((x) => setTimeout(x, 250));
                receipts.push(r);
              }
              const bid = `0x${(++id).toString(16).padStart(64, "0")}`;
              batches[bid] = receipts;
              return { id: bid };
            }
            case "wallet_getCallsStatus": {
              const [bid] = params as [string];
              const receipts = batches[bid] as { status: string }[];
              const ok = receipts.every((r) => r.status === "0x1");
              return { version: "2.0.0", id: bid, chainId: "0x7a69", atomic: true, status: ok ? 200 : 500, receipts };
            }
            case "wallet_requestPermissions":
            case "wallet_getPermissions":
              return [{ parentCapability: "eth_accounts" }];
            case "eth_sendTransaction": {
              w.__walletPrompts++;
              const [tx] = params as [Record<string, unknown>];
              return call("eth_sendTransaction", [{ ...tx, from: account }]);
            }
            default:
              return call(method, params ?? []);
          }
        },
        on: (e: string, f: (...a: unknown[]) => void) => ((listeners[e] ??= []).push(f), provider),
        removeListener: (e: string, f: (...a: unknown[]) => void) => ((listeners[e] = (listeners[e] ?? []).filter((x) => x !== f)), provider),
      };
      (window as unknown as { ethereum: unknown }).ethereum = provider;
      const info = { uuid: "e2e-wallet", name: "Test Wallet", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "test.e2e" };
      const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
      window.addEventListener("eip6963:requestProvider", announce);
      announce();
    },
    { account, rpc, atomic: !!opts.atomic },
  );
}

/** Read the seeded addresses written by `pnpm dev:chain`. */
export async function localChain() {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../.local-chain.json"), "utf8")) as {
    collections: Record<string, string>;
    seed: { orders: Record<string, string>; me: string };
  };
}
