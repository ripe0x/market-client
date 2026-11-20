// `pnpm dev:chain`: Anvil on 127.0.0.1:8645 with the protocol, test collections and a seeded
// market. Writes .local-chain.json at the repo root for the web app and tests. Ctrl-C stops it.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, startChain } from "./index";
import { seed } from "./seed";

const port = Number(process.env.PORT ?? 8645);
const c = await startChain({ port, blockTime: process.env.BLOCK_TIME ? Number(process.env.BLOCK_TIME) : undefined });
const s = process.env.NO_SEED ? null : await seed(c);
const out = { deploymentId:c.deployment.deploymentId,releaseId:c.deployment.releaseId,protocolCommit:c.deployment.protocolCommit,rpcUrl: c.rpcUrl, chainId: 31337, artwork: c.artwork, collections: c.collections, seed: s && { orders: s.orders, me: s.me } };
writeFileSync(resolve(ROOT, ".local-chain.json"), JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
console.log(`Anvil with Market at ${c.rpcUrl}; wrote .local-chain.json`);
const stop = () => (c.stop(), process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
