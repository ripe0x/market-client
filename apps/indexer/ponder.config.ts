import {
  actionsAbi, coveredNFTPurchaseAbi, exchangeActionAbi, marketAbi, orderAbi, reservedActionAbi,
} from "@market/protocol";
import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";
import { chainId, deployment as d } from "./src/deployment";

// One chain per deployment (DECISIONS D27). RPC is Tenderly's public gateway for Sepolia, or the
// local Anvil (DECISIONS D31).
const rpc = process.env.PONDER_RPC_URL ?? d.rpcUrl;
const startBlock = Number(process.env.PONDER_START_BLOCK ?? d.startBlock ?? Number.NaN);
if (!Number.isInteger(startBlock)) throw new Error(`Market is not deployed on chain ${chainId}: set startBlock in the manifest`);

const created = getAbiItem({ abi: marketAbi, name: "Created" });

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite", directory: process.env.PGLITE_DIR ?? `.ponder/pglite-${chainId}-${d.releaseId}` },
  chains: {
    market: {
      id: chainId,
      rpc,
      pollingInterval: chainId === 31337 ? 250 : 4_000,
      maxRequestsPerSecond: chainId === 31337 ? 1000 : 5,
      ethGetLogsBlockRange: chainId === 31337 ? undefined : 2_000,
      cacheRpcRequests: chainId !== 31337,
    },
  },
  contracts: {
    // Trust rule: only the configured Market announces orders.
    Market: { chain: "market", abi: marketAbi, address: d.market, startBlock },
    // Order lifecycle only from orders Market created (factory source).
    Order: {
      chain: "market", abi: orderAbi,
      address: factory({ address: d.market, event: created, parameter: "order" }),
      startBlock,
    },
    // Actions ERC721: token id is the order address; tracks Holder-order ownership.
    Actions: { chain: "market", abi: actionsAbi, address: d.actions!, startBlock },
    // Action settlement events, only from the configured action implementations.
    ExchangeAction: { chain: "market", abi: exchangeActionAbi, address: d.exchange!, startBlock },
    CoveredNFTPurchase: { chain: "market", abi: coveredNFTPurchaseAbi, address: d.coveredNFTPurchase!, startBlock },
    ReservedAction: { chain: "market", abi: reservedActionAbi, address: d.reservedAction!, startBlock },
  },
  blocks: {
    // Liveness that emits no event (top-ups, NFT deposits, royalty changes, effective expiry) is
    // polled at the head only; never during backfill (PLAN.md §4.6).
    poll: { chain: "market", startBlock: "latest", interval: 1 },
  },
});
