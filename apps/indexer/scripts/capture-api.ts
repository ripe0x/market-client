// Start a seeded local chain + Ponder, fetch a few REST endpoints, and write the responses to
// evidence/indexer-api.json. Verification artifact only; local, no broadcast.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { freePort, startChain } from "@market/protocol/devchain";
import { seed, ME } from "@market/protocol/devchain/seed";

const c = await startChain();
const s = await seed(c);
const port = await freePort();
const api = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "ponder-capture-"));
const ponder = spawn("npx", ["ponder", "start", "--schema", "market_capture", "--port", String(port)], {
  cwd: resolve(import.meta.dirname, ".."),
  env: { ...process.env, PONDER_CHAIN_ID: "31337", PONDER_RPC_URL: c.rpcUrl, PGLITE_DIR: dir },
  stdio: ["ignore", "ignore", "ignore"], detached: true,
});
const get = async (p: string) => (await fetch(api + p)).json();
try {
  for (let i = 0; i < 300; i++) {
    try { const st: any = await get("/api/status"); if (st.ready && BigInt(st.block) >= (await c.pub.getBlockNumber({ cacheTime: 0 }))) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  await c.test.mine({ blocks: 6 });
  await new Promise((r) => setTimeout(r, 1500));
  const col = s.collections.driftlines;
  const out = {
    deploymentId: c.deployment.deploymentId,
    protocolCommit: c.deployment.protocolCommit,
    "GET /api/status": await get("/api/status"),
    "GET /api/listings?limit=3": await get("/api/listings?limit=3"),
    "GET /api/collections": await get("/api/collections"),
    [`GET /api/collections/${col}/offers`]: await get(`/api/collections/${col}/offers`),
    [`GET /api/orders/${s.orders.fixed}`]: await get(`/api/orders/${s.orders.fixed}`),
    [`GET /api/accounts/${ME}/positions`]: await get(`/api/accounts/${ME}/positions`),
  };
  writeFileSync(resolve(import.meta.dirname, "../evidence/indexer-api.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("wrote apps/indexer/evidence/indexer-api.json");
} finally {
  try { if (ponder.pid) process.kill(-ponder.pid, "SIGKILL"); } catch {}
  c.stop();
  rmSync(dir, { recursive: true, force: true });
}
