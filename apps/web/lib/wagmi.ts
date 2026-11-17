import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  injectedWallet,
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { defineChain, type Chain } from "viem";
import { deploymentFor } from "@market/protocol";
import { CHAIN_ID, RPC_URL_OVERRIDE, WALLETCONNECT_PROJECT_ID } from "./env";

const deployment = deploymentFor(CHAIN_ID);
const rpcUrl = RPC_URL_OVERRIDE ?? deployment.rpcUrl;

// Local Anvil has no viem chain preset; build one. Sepolia is the viem preset with the RPC pinned
// to Tenderly's public gateway (DECISIONS D31 — no other RPC providers).
const localAnvil = defineChain({
  id: 31337,
  name: "Local Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});

export const chain: Chain =
  CHAIN_ID === sepolia.id
    ? { ...sepolia, rpcUrls: { default: { http: [rpcUrl] } } }
    : localAnvil;

// Injected only until a WalletConnect project id is set (DECISIONS D32).
const hasWC = Boolean(WALLETCONNECT_PROJECT_ID);
const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      wallets: hasWC
        ? [injectedWallet, metaMaskWallet, coinbaseWallet, walletConnectWallet]
        : [injectedWallet],
    },
  ],
  {
    appName: "Market",
    projectId: WALLETCONNECT_PROJECT_ID || "market-local",
  },
);

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(rpcUrl) },
  ssr: true,
});
