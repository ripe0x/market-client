import { beforeAll,afterAll,test,expect } from "vitest";
import { decodeEventLog,parseEther,createPublicClient,http, type Address, type Hex } from "viem";
import { startChain,mint,ACCOUNTS,artifacts, type Chain } from "../devchain";
import { send,warp } from "../devchain/send";
import { runRightsRehearsal } from "../devchain/rights-rehearsal";
import { deploymentFor } from "../src/addresses";
import { marketAbi,rightAbi,rightsAbi } from "../src/abis";
import { readRight,encodeCoveredConfig,decodeCoveredConfig,verifyRightDeposit,verifyRightTrade } from "../src/rights";
import * as rt from "../src/rightsTx";
import * as tx from "../src/tx";
import { fixedSchedule } from "../src/schedule";
import { configHash } from "../src/config";
const E=parseEther;
const [,issuer,buyer,other]=ACCOUNTS;
let c:Chain;
beforeAll(async()=>{c=await startChain();},300_000);
afterAll(()=>c?.stop());
async function issue(nft=c.collections!.driftlines,proceedsTo:Address=issuer,activate=true) {
 const id=await mint(c,nft,issuer),deadline=(await c.pub.getBlock()).timestamp+7200n;
 const config={nft,tokenId:id,price:E("1"),proceedsTo,maxRoyaltyBps:1000},bytes=encodeCoveredConfig(config),salt=tx.randomSalt();
 const {receipt}=await send(c,issuer,rt.createRight(c.deployment,config,deadline,issuer,salt));
 const event=receipt.logs.map(l=>{try{return decodeEventLog({abi:marketAbi,...l});}catch{return null;}}).find(x=>x?.eventName==="RightCreated");
 const account=(event!.args as {account:Address}).account;
 await verifyRightDeposit(c.pub,c.deployment,account,issuer,config,deadline);
 await send(c,issuer,tx.depositNft(nft,issuer,account,id));
 if(activate)await send(c,issuer,rt.activateRight(account,bytes));
 return {account,id,deadline,config,bytes};
}
test("legacy identity is preserved and undeployed rights candidate has no legacy start block",()=>{
 const old=deploymentFor(11155111),next=deploymentFor(11155111,"rights-v1");
 expect(old.releaseId).toBe("legacy-v1");expect(old.startBlock).toBe(12150229n);expect(old.market.toLowerCase()).toBe("0x7c91e34703ae3e32812bad1f7251cd0976a31fd4");
 expect(next.startBlock).toBe(null);expect(next.status).toBe("candidate");expect(next.deploymentId).not.toBe(old.deploymentId);expect(next.market).not.toBe(old.market);
});
test("covered codecs preserve token IDs beyond JS safe integer",()=>{
 const cfg={nft:issuer,tokenId:BigInt("0xffffffffffffffffffffffffffffffffffffffff"),price:123456789123456789n,proceedsTo:buyer,maxRoyaltyBps:500};
 expect(decodeCoveredConfig(encodeCoveredConfig(cfg))).toEqual(cfg);
});
test("full signed RPC lifecycle and genuine atomic rollback",async()=>{
 const report=await runRightsRehearsal(c);expect(report.transactions.length).toBeGreaterThan(30);
 expect(report.transactions.at(-1)?.status).toBe("reverted");
},300_000);
test("canonical event config, direct holder changes and malformed supplied config",async()=>{
 const r=await issue();let view=await readRight(c.pub,c.deployment,r.account);
 expect(view.config).toBe(r.bytes);expect(view.price).toBe(E("1"));expect(view.tokenId).toBeGreaterThan(BigInt(Number.MAX_SAFE_INTEGER));
 await send(c,issuer,{address:c.deployment.rights!,abi:rightsAbi,functionName:"transferFrom",args:[issuer,buyer,view.tokenId]});
 view=await readRight(c.pub,c.deployment,r.account);expect(view.holder).toBe(buyer);
 const bad=await readRight(c.pub,c.deployment,r.account,{config:"0x1234"});expect(bad.configError).toMatch(/match/);expect(bad.config).toBe(null);
 await expect(readRight(c.pub,c.deployment,issuer)).rejects.toThrow(/not created/);
});
test("authenticated supplied config avoids log discovery and rejects a wrong commitment",async()=>{
 const id=await mint(c,c.collections!.plain,issuer),deadline=(await c.pub.getBlock()).timestamp+7200n;
 const config={nft:c.collections!.plain,tokenId:id,price:E("1"),proceedsTo:issuer,maxRoyaltyBps:0},bytes=encodeCoveredConfig(config);
 const {receipt}=await send(c,issuer,rt.createRight(c.deployment,config,deadline,issuer,tx.randomSalt()));
 const event=receipt.logs.map(l=>{try{return decodeEventLog({abi:marketAbi,...l});}catch{return null;}}).find(x=>x?.eventName==="RightCreated");
 const account=(event!.args as {account:Address}).account;
 let logCalls=0;
 const tracking={...c.pub,getLogs:(...args:Parameters<typeof c.pub.getLogs>)=>{logCalls++;return c.pub.getLogs(...args);}} as typeof c.pub;
 const wrong=await readRight(tracking,c.deployment,account,{config:encodeCoveredConfig({...config,price:E("2")})});
 expect(wrong.config).toBe(null);expect(wrong.configError).toMatch(/match/);expect(wrong.price).toBe(null);
 const verified=await readRight(tracking,c.deployment,account,{config:bytes});
 expect(verified.configError).toBe(null);expect(verified.config).toBe(bytes);expect(verified.price).toBe(E("1"));
 expect((await readRight(tracking,c.deployment,account)).config).toBe(bytes);
 expect(logCalls).toBe(0);
});
test("indexed config keeps a seven day right usable beyond bounded log discovery",async()=>{
 const id=await mint(c,c.collections!.plain,issuer),deadline=(await c.pub.getBlock()).timestamp+604800n;
 const config={nft:c.collections!.plain,tokenId:id,price:E("1"),proceedsTo:issuer,maxRoyaltyBps:0},bytes=encodeCoveredConfig(config);
 const {receipt}=await send(c,issuer,rt.createRight(c.deployment,config,deadline,issuer,tx.randomSalt()));
 const event=receipt.logs.map(l=>{try{return decodeEventLog({abi:marketAbi,...l});}catch{return null;}}).find(x=>x?.eventName==="RightCreated");
 const account=(event!.args as {account:Address}).account;
 await send(c,issuer,tx.depositNft(config.nft,issuer,account,id));
 await send(c,issuer,rt.activateRight(account,bytes));
 await c.test.mine({blocks:16_001,interval:1});
 const fresh=createPublicClient({transport:http(c.rpcUrl)});
 let logCalls=0;
 const tracking={...fresh,getLogs:(...args:Parameters<typeof fresh.getLogs>)=>{logCalls++;return fresh.getLogs(...args);}} as typeof fresh;
 const unavailable=await readRight(tracking,c.deployment,account);
 expect(logCalls).toBe(8);expect(unavailable.config).toBe(null);expect(unavailable.configError).toMatch(/unavailable/);
 const verified=await readRight(tracking,c.deployment,account,{config:bytes});
 expect(verified.config).toBe(bytes);expect(verified.stateCode).toBe(1);expect(verified.effectiveExpired).toBe(false);expect(verified.backed).toBe(true);
 const tradable=await verifyRightTrade(tracking,c.deployment,c.deployment.rights!,BigInt(account),deadline-3600n,bytes);
 expect(tradable?.config).toBe(bytes);expect(logCalls).toBe(8);
 await send(c,issuer,rt.exerciseRight(account,bytes,buyer,E("1")));
 const exercised=await readRight(tracking,c.deployment,account,{config:bytes});
 expect(exercised.stateCode).toBe(2);expect(exercised.holder).toBe(null);expect(exercised.totalCredits).toBe(E("1"));
 expect(exercised.credits).toEqual([{beneficiary:issuer,amount:E("1")}]);expect(exercised.backed).toBe(false);
});
test("known payment beneficiaries remain readable after burn with unavailable valid config",async()=>{
 const r=await issue(c.collections!.plain,buyer);
 await send(c,issuer,rt.exerciseRight(r.account,r.bytes,issuer,E("1")));
 const view=await readRight(c.pub,c.deployment,r.account,{config:"0x1234",beneficiaries:[buyer,buyer]});
 expect(view.config).toBe(null);expect(view.configError).toMatch(/match/);expect(view.nft).toBe(null);
 expect(view.stateCode).toBe(2);expect(view.holder).toBe(null);expect(view.totalCredits).toBe(E("1"));
 expect(view.credits).toEqual([{beneficiary:buyer,amount:E("1")}]);
 const before=await c.pub.getBalance({address:buyer});
 await send(c,other,rt.releaseRightCredit(r.account,buyer));
 expect(await c.pub.getBalance({address:buyer})).toBe(before+E("1"));
 const released=await readRight(c.pub,c.deployment,r.account,{config:"0x1234",beneficiaries:[buyer]});
 expect(released.totalCredits).toBe(0n);expect(released.credits[0]?.amount).toBe(0n);
});
test("pending deposit checks reject mismatched asset or deadline before another transfer",async()=>{
 const r=await issue(c.collections!.plain,issuer,false);
 await expect(verifyRightDeposit(c.pub,c.deployment,r.account,issuer,{...r.config,tokenId:r.id+1n},r.deadline)).rejects.toThrow();
 await expect(verifyRightDeposit(c.pub,c.deployment,r.account,issuer,r.config,r.deadline+1n)).rejects.toThrow();
});
test("effective expiry applies before finalization and collection-wide canonical bids fail",async()=>{
 const r=await issue();const v=await readRight(c.pub,c.deployment,r.account);
 expect(()=>tx.createOffer(c.deployment,{nft:c.deployment.rights!,tokenId:0n,anyToken:true,schedule:fixedSchedule(E("0.1")),recipient:buyer,maxFills:1n},tx.randomSalt(),E("0.1"))).toThrow(/one token|specific/);
 await warp(c,r.deadline);
 const expired=await readRight(c.pub,c.deployment,r.account);expect(expired.state).toBe("active");expect(expired.effectiveExpired).toBe(true);
 await expect(verifyRightTrade(c.pub,c.deployment,c.deployment.rights!,v.tokenId)).rejects.toThrow(/not a live/);
});
test("accepting passive royalty receiver collects after burn, with proceeds aggregation",async()=>{
 const h=await c.wallet(issuer).deployContract({abi:artifacts.PassiveReceiver.abi,bytecode:artifacts.PassiveReceiver.bytecode,account:issuer,chain:c.chain});
 const payee=(await c.pub.waitForTransactionReceipt({hash:h})).contractAddress!;
 const nh=await c.wallet(issuer).deployContract({abi:artifacts.TestNFT.abi,bytecode:artifacts.TestNFT.bytecode,args:["Passive","PASS",payee,500n,""],account:issuer,chain:c.chain});
 const nft=(await c.pub.waitForTransactionReceipt({hash:nh})).contractAddress!;
 const r=await issue(nft,payee);await send(c,issuer,rt.exerciseRight(r.account,r.bytes,issuer,E("1")));
 const v=await readRight(c.pub,c.deployment,r.account);expect(v.holder).toBe(null);expect(v.credits).toHaveLength(1);expect(v.credits[0]!.beneficiary.toLowerCase()).toBe(payee.toLowerCase());expect(v.credits[0]!.amount).toBe(E("1"));
 await send(c,other,rt.releaseRightCredit(r.account,payee));expect(await c.pub.getBalance({address:payee})).toBe(E("1"));
});
test("refusing payment cannot veto exercise or steal proceeds; failed payout remains reserved",async()=>{
 const r=await issue(c.collections!.refusingRoyalty);await send(c,issuer,rt.exerciseRight(r.account,r.bytes,issuer,E("1")));
 const v=await readRight(c.pub,c.deployment,r.account);expect(v.state).toBe("exercised");expect(v.royaltyAmount).toBe(E("0.05"));
 await expect(send(c,other,rt.releaseRightCredit(r.account,v.royaltyTo!))).rejects.toThrow();
 await send(c,issuer,rt.withdrawRightCredit(r.account,issuer));const after=await readRight(c.pub,c.deployment,r.account);expect(after.totalCredits).toBe(E("0.05"));expect(after.balance).toBe(E("0.05"));
});
test("unknown exercise handlers and malformed creation config never gain a covered exercise form",async()=>{
 const end=(await c.pub.getBlock()).timestamp+7200n;
 const create=async(handler:Address,config:Hex)=>{
  const {receipt}=await send(c,issuer,{address:c.deployment.market,abi:marketAbi,functionName:"createRight",args:[handler,config,end,issuer,tx.randomSalt()]});
  const log=receipt.logs.map(l=>{try{return decodeEventLog({abi:marketAbi,...l});}catch{return null;}}).find(x=>x?.eventName==="RightCreated");
  return (log!.args as {account:Address}).account;
 };
 const unknown=await readRight(c.pub,c.deployment,await create(c.deployment.nftSale,"0x"));
 expect(unknown.supported).toBe(false);expect(unknown.price).toBe(null);expect(unknown.holder).toBe(null);
 const malformed=await readRight(c.pub,c.deployment,await create(c.deployment.coveredNFTPurchase!,"0x1234"));
 expect(malformed.supported).toBe(true);expect(malformed.config).toBe(null);expect(malformed.configError).toBeTruthy();
});
test("cached identity cannot be reused for another Market under the same release label",async()=>{
 const r=await issue();await readRight(c.pub,c.deployment,r.account);
 const counterfeit={...c.deployment,market:c.deployment.nftSale};
 await expect(readRight(c.pub,counterfeit,r.account)).rejects.toThrow(/deployment identity/);
});

test("deployment and right reads work with a public client without a chain object",async()=>{
 const r=await issue();const pub=createPublicClient({transport:http(c.rpcUrl)});
 expect((await readRight(pub,c.deployment,r.account)).stateCode).toBe(1);
});
