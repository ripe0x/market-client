import { deploymentFor, marketAbi, nftBidAbi, nftSaleAbi, orderAbi } from "@market/protocol";
import { createConfig, factory } from "ponder";
import { getAbiItem } from "viem";

// One chain per deployment (DECISIONS D27). RPC is Tenderly's public gateway for Sepolia, or
// the local Anvil (DECISIONS D31).
const chainId = Number(process.env.PONDER_CHAIN_ID ?? 31337);
const d = deploymentFor(chainId);
const rpc = process.env.PONDER_RPC_URL ?? d.rpcUrl;
const startBlock = Number(process.env.PONDER_START_BLOCK ?? d.startBlock ?? Number.NaN);
if (!Number.isInteger(startBlock)) throw new Error(`Market is not deployed on chain ${chainId}: set startBlock in addresses.ts`);

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite", directory: process.env.PGLITE_DIR },
  chains: {
    market: {
      id: chainId,
      rpc,
      pollingInterval: chainId === 31337 ? 250 : 4_000,
      // Tenderly's public gateway: stay well inside its limits.
      maxRequestsPerSecond: chainId === 31337 ? 1000 : 5,
      ethGetLogsBlockRange: chainId === 31337 ? undefined : 2_000,
      cacheRpcRequests: chainId !== 31337,
    },
  },
  contracts: {
    // Trust rule 1: only the configured Market announces orders.
    Market: { chain: "market", abi: marketAbi, address: d.market, startBlock },
    // Trust rule 4: Filled/Closed only from orders Market created.
    Order: {
      chain: "market",
      abi: orderAbi,
      address: factory({ address: d.market, event: getAbiItem({ abi: marketAbi, name: "Created" }), parameter: "order" }),
      startBlock,
    },
    // Trust rule 3: handler events only from the configured handlers.
    NFTSale: { chain: "market", abi: nftSaleAbi, address: d.nftSale, startBlock },
    NFTBid: { chain: "market", abi: nftBidAbi, address: d.nftBid, startBlock },
  },
  blocks: {
    // Liveness that emits no Market event (top-ups, NFT deposits, royalty changes) is polled at
    // the head only; never during backfill (PLAN.md §4.6).
    poll: { chain: "market", startBlock: "latest", interval: 1 },
  },
});
