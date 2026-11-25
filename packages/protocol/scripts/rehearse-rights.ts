import { writeFileSync,mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { startChain } from "../devchain";
import { runRightsRehearsal } from "../devchain/rights-rehearsal";
const c=await startChain();
try {
 const evidence=await runRightsRehearsal(c);
 const dir=resolve(import.meta.dirname,"../evidence");mkdirSync(dir,{recursive:true});
 writeFileSync(resolve(dir,"rights-local.json"),JSON.stringify(evidence,null,2)+"\n");
 console.log(`Verified ${evidence.transactions.length} actual local transactions; evidence: packages/protocol/evidence/rights-local.json`);
} finally { c.stop(); }
