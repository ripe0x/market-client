import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startChain } from "../devchain";
import { runActionsRehearsal } from "../devchain/actions-rehearsal";
const c = await startChain();
try {
  const evidence = await runActionsRehearsal(c);
  const dir = resolve(import.meta.dirname, "../evidence");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "actions-local.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(`Verified ${evidence.transactions.length} signed local transactions across ${evidence.flows.length} flows and ${evidence.reverts.length} reverts; evidence: packages/protocol/evidence/actions-local.json`);
} finally {
  c.stop();
}
