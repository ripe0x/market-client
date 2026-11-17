// Test-only wallet: an EIP-1193 provider injected into the page by Playwright (never part of the
// app bundle). It forwards every request to the local Anvil, whose default accounts are unlocked,
// so transactions are real transactions on a real chain; only the wallet's UI is replaced.
import type { Page } from "@playwright/test";

export const RPC = process.env.E2E_RPC_URL ?? "http://127.0.0.1:8645";
/** Anvil account 1: the seeded "me" (packages/protocol/devchain/seed.ts). */
export const ME = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export async function injectWallet(page: Page, account = ME, rpc = RPC) {
  await page.addInitScript(
    ({ account, rpc }) => {
      let id = 0;
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
              return {};
            case "wallet_requestPermissions":
            case "wallet_getPermissions":
              return [{ parentCapability: "eth_accounts" }];
            case "eth_sendTransaction": {
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
    { account, rpc },
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
