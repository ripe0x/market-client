import { coveredNFTPurchaseAbi, marketAbi, nftBidAbi, nftSaleAbi, orderAbi, rightAbi, rightsAbi } from "@market/protocol";
import { createConfig, factory } from "ponder";
import { getAbiItem, zeroAddress } from "viem";
import { chainId, deployment as d } from "./src/deployment";

// One chain per deployment (DECISIONS D27). RPC is Tenderly's public gateway for Sepolia, or
// the local Anvil (DECISIONS D31).
const rpc = process.env.PONDER_RPC_URL ?? d.rpcUrl;
const startBlock = Number(process.env.PONDER_START_BLOCK ?? d.startBlock ?? Number.NaN);
if (!Number.isInteger(startBlock)) throw new Error(`Market is not deployed on chain ${chainId}: set startBlock in addresses.ts`);

export default createConfig({
  database: process.env.DATABASE_URL
    ? { kind: "postgres", connectionString: process.env.DATABASE_URL }
    : { kind: "pglite", directory: process.env.PGLITE_DIR ?? `.ponder/pglite-${chainId}-${d.releaseId}` },
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
    // Legacy releases have no RightCreated logs; the zero-address sources never discover accounts.
    Right: {
      chain: "market",
      abi: rightAbi,
      address: factory({ address: d.rights ? d.market : zeroAddress, event: getAbiItem({ abi: marketAbi, name: "RightCreated" }), parameter: "account" }),
      startBlock,
    },
    Rights: { chain: "market", abi: rightsAbi, address: d.rights ?? zeroAddress, startBlock },
    CoveredNFTPurchase: { chain: "market", abi: coveredNFTPurchaseAbi, address: d.coveredNFTPurchase ?? zeroAddress, startBlock },
  },
  blocks: {
    // Liveness that emits no Market event (top-ups, NFT deposits, royalty changes) is polled at
    // the head only; never during backfill (PLAN.md §4.6).
    poll: { chain: "market", startBlock: "latest", interval: 1 },
  },
});
