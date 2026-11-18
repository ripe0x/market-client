// Actual Anvil transactions through the same deployment path as a release. No keys or mocks.
import assert from "node:assert/strict";
import { decodeEventLog, encodeFunctionData, keccak256, parseEther, type Address, type Hex, type TransactionReceipt } from "viem";
import { marketAbi, rightAbi, rightsAbi, feeConfigAbi } from "../src/abis";
import { configHash, encodeSaleConfig } from "../src/config";
import { erc721Abi } from "../src/erc721";
import { fixedSchedule } from "../src/schedule";
import { readRight, encodeCoveredConfig, verifyRightDeposit, verifyRightTrade, type CoveredNFTConfig } from "../src/rights";
import { verifyDeployment } from "../src/orders";
import * as rt from "../src/rightsTx";
import * as tx from "../src/tx";
import { ACCOUNTS, mint, startChain, artifacts, type Chain } from "./index";
import { createdOrder, send, warp } from "./send";

const [, ISSUER, A, B, FINALIZER] = ACCOUNTS;
const E=parseEther;
export type RehearsalTx={label:string;hash:Hex;block:string;gasUsed:string;gasPrice:string;gasCost:string;from:Address;to:Address|null;status:string};
export async function runRightsRehearsal(c:Chain) {
  assert.equal(await c.pub.getChainId(),31337,"local only");
  assert.deepEqual(await verifyDeployment(c.pub,c.deployment),[]);
  const d=c.deployment, nft=c.collections!.driftlines, transactions:RehearsalTx[]=[];
  const record=async(label:string,from:Address,receipt:TransactionReceipt)=>{
    transactions.push({label,hash:receipt.transactionHash,block:String(receipt.blockNumber),gasUsed:String(receipt.gasUsed),gasPrice:String(receipt.effectiveGasPrice),gasCost:String(receipt.gasUsed*receipt.effectiveGasPrice),from,to:receipt.to,status:receipt.status});
    assert.equal(receipt.status,"success",label);assert.ok(receipt.effectiveGasPrice>0n,"receipt records a nonzero gas price");
  };
  const act=async(label:string,from:Address,call:Parameters<typeof send>[2])=>{
    const r=await send(c,from,call);await record(label,from,r.receipt);return r;
  };
  for(const receipt of c.deploymentReceipts) await record("protocol deployment",ACCOUNTS[0],receipt);
  const createdRight=(receipt:TransactionReceipt)=>{
    for(const l of receipt.logs) {try { const e=decodeEventLog({abi:marketAbi,...l});if(e.eventName==="RightCreated"&&l.address.toLowerCase()===d.market.toLowerCase())return e.args.account; }catch{}}
    throw new Error("missing canonical RightCreated");
  };
  const mintTo=async(to:Address)=>{
    const {result}=await c.pub.simulateContract({address:nft,abi:artifacts.TestNFT.abi,functionName:"mint",args:[to,1n],account:ACCOUNTS[0]});
    await act("mint rehearsal collateral",ACCOUNTS[0],{address:nft,abi:artifacts.TestNFT.abi,functionName:"mint",args:[to,1n]});
    return result;
  };
  const issue=async(label:string,activate=true)=>{
    const id=await mintTo(ISSUER);
    const config:CoveredNFTConfig={nft,tokenId:id,price:E("1"),proceedsTo:ISSUER,maxRoyaltyBps:500};
    const bytes=encodeCoveredConfig(config),deadline=(await c.pub.getBlock()).timestamp+86400n;
    const r=await act(`${label}: create`,ISSUER,rt.createRight(d,config,deadline,ISSUER,tx.randomSalt()));
    const account=createdRight(r.receipt);
    await verifyRightDeposit(c.pub,d,account,ISSUER,config,deadline);
    await act(`${label}: deposit`,ISSUER,tx.depositNft(nft,ISSUER,account,id));
    if(activate)await act(`${label}: activate`,ISSUER,rt.activateRight(account,bytes));
    return {account,id,config,bytes,deadline,tokenId:BigInt(account)};
  };
  const list=async(label:string,owner:Address,right:Awaited<ReturnType<typeof issue>>,price:bigint)=>{
    const expiry=right.deadline-3600n;
    await verifyRightTrade(c.pub,d,d.rights!,right.tokenId,expiry);
    const config={nft:d.rights!,tokenId:right.tokenId,schedule:{...fixedSchedule(price),expiry},proceedsTo:owner,maxRoyaltyBps:0};
    const r=await act(`${label}: list`,owner,tx.createListing(d,config,tx.randomSalt()));
    const order=createdOrder(r.receipt);
    await act(`${label}: escrow`,owner,tx.depositNft(d.rights!,owner,order,right.tokenId));
    return {order,bytes:encodeSaleConfig(config)};
  };
  const hold=async(right:Awaited<ReturnType<typeof issue>>)=>assert.equal((await c.pub.readContract({address:nft,abi:erc721Abi,functionName:"ownerOf",args:[right.id]})).toLowerCase(),right.account.toLowerCase());

  const feeTo=await c.pub.readContract({address:d.feeConfig,abi:feeConfigAbi,functionName:"recipient"});
  const feeBefore=await c.pub.getBalance({address:feeTo});
  const right=await issue("purchase");
  const first=await list("primary",ISSUER,right,E("0.2"));
  const primaryBefore={issuer:await c.pub.getBalance({address:ISSUER}),buyer:await c.pub.getBalance({address:A})};
  const primary=await act("A buys entitlement",A,tx.buy(first.order,first.bytes,A,E("0.2")));await hold(right);
  assert.equal((await c.pub.getBalance({address:ISSUER}))-primaryBefore.issuer,E("0.198"));
  assert.equal(primaryBefore.buyer-(await c.pub.getBalance({address:A})),E("0.2")+primary.gas);
  const second=await list("secondary",A,right,E("0.3"));
  const secondaryBefore={seller:await c.pub.getBalance({address:A}),buyer:await c.pub.getBalance({address:B})};
  const secondary=await act("B buys entitlement",B,tx.buy(second.order,second.bytes,B,E("0.3")));await hold(right);
  assert.equal((await c.pub.getBalance({address:A}))-secondaryBefore.seller,E("0.297"));
  assert.equal(secondaryBefore.buyer-(await c.pub.getBalance({address:B})),E("0.3")+secondary.gas);
  assert.equal((await readRight(c.pub,d,right.account)).holder?.toLowerCase(),B.toLowerCase());
  assert.equal((await c.pub.getBalance({address:feeTo}))-feeBefore,E("0.005"));
  const exerciseBefore=await c.pub.getBalance({address:B});
  const exercise=await act("B exercises",B,rt.exerciseRight(right.account,right.bytes,B,E("1")));
  assert.equal(exerciseBefore-(await c.pub.getBalance({address:B})),E("1")+exercise.gas);
  assert.equal((await c.pub.getBalance({address:feeTo}))-feeBefore,E("0.005"),"exercise charges no trading fee");
  let view=await readRight(c.pub,d,right.account);
  assert.equal(view.state,"exercised");assert.equal(view.holder,null);assert.equal(view.totalCredits,E("1"));
  assert.equal((await c.pub.readContract({address:nft,abi:erc721Abi,functionName:"ownerOf",args:[right.id]})).toLowerCase(),B.toLowerCase());
  assert.equal(view.credits.find(x=>x.beneficiary.toLowerCase()===ISSUER.toLowerCase())!.amount,E("0.95"));
  assert.equal(view.royaltyAmount,E("0.05"));
  const receipts:Record<string,string>={};
  for(const credit of view.credits) {
    const before=await c.pub.getBalance({address:credit.beneficiary});
    await act(`release ${credit.beneficiary}`,FINALIZER,rt.releaseRightCredit(right.account,credit.beneficiary));
    const delta=(await c.pub.getBalance({address:credit.beneficiary}))-before;
    assert.equal(delta,credit.amount);receipts[credit.beneficiary]=String(delta);
  }
  assert.equal((await readRight(c.pub,d,right.account)).totalCredits,0n);

  const canceled=await issue("listing cancellation");
  const cancelListing=await list("cancelable premium",ISSUER,canceled,E("0.1"));
  await act("cancel listing only",ISSUER,tx.close(cancelListing.order));
  await act("return right token",ISSUER,tx.withdrawNft(cancelListing.order,d.rights!,ISSUER,canceled.tokenId));
  view=await readRight(c.pub,d,canceled.account);assert.equal(view.state,"active");assert.equal(view.holder?.toLowerCase(),ISSUER.toLowerCase());await hold(canceled);
  await act("issuer surrenders",ISSUER,rt.surrenderRight(canceled.account));
  await act("issuer recovers surrendered collateral",ISSUER,rt.recoverRightNft(canceled.account,nft,canceled.id,ISSUER));

  const expiring=await issue("listed expiry");await list("expiring premium",ISSUER,expiring,E("0.1"));
  await warp(c,expiring.deadline);
  view=await readRight(c.pub,d,expiring.account);assert.equal(view.effectiveExpired,true);assert.equal(view.state,"active");
  await act("anyone finalizes expiry",FINALIZER,rt.finalizeRight(expiring.account));
  await act("issuer recovers expired collateral",ISSUER,rt.recoverRightNft(expiring.account,nft,expiring.id,ISSUER));
  assert.equal((await readRight(c.pub,d,expiring.account)).holder,null);

  const pending=await issue("abandoned setup",false);
  await act("cancel pending",ISSUER,rt.cancelRightSetup(pending.account));
  await act("recover pending deposit",ISSUER,rt.recoverRightNft(pending.account,nft,pending.id,ISSUER));
  assert.equal((await readRight(c.pub,d,pending.account)).state,"canceled");

  // A real account, controlled by the issuer's unlocked EOA, batches all three operations.
  const wh=await c.wallet(ISSUER).deployContract({abi:artifacts.AtomicWallet.abi,bytecode:artifacts.AtomicWallet.bytecode,args:[ISSUER],account:ISSUER,chain:c.chain});
  const wr=await c.pub.waitForTransactionReceipt({hash:wh});await record("deploy atomic wallet",ISSUER,wr);
  const wallet=wr.contractAddress!;assert.ok(wallet);
  const atomicId=await mintTo(wallet);
  const cfg:CoveredNFTConfig={nft,tokenId:atomicId,price:E("1"),proceedsTo:wallet,maxRoyaltyBps:500};
  const cfgBytes=encodeCoveredConfig(cfg),deadline=(await c.pub.getBlock()).timestamp+86400n,salt=tx.randomSalt();
  const predicted=await c.pub.readContract({address:d.market,abi:marketAbi,functionName:"rightAddress",args:[wallet,d.coveredNFTPurchase!,configHash(cfgBytes),deadline,wallet,salt]});
  const raw=(call:{address:Address;abi:readonly unknown[];functionName:string;args?:readonly unknown[];value?:bigint})=>({target:call.address,value:call.value??0n,data:encodeFunctionData(call as never)});
  const calls=[raw(rt.createRight(d,cfg,deadline,wallet,salt)),raw(tx.depositNft(nft,wallet,predicted,atomicId)),raw(rt.activateRight(predicted,cfgBytes))];
  await act("atomic create deposit activate",ISSUER,{address:wallet,abi:artifacts.AtomicWallet.abi,functionName:"executeBatch",args:[calls]});
  assert.equal((await readRight(c.pub,d,predicted)).issuer.toLowerCase(),wallet.toLowerCase());
  const badId=await mintTo(wallet),badConfig={...cfg,tokenId:badId},badBytes=encodeCoveredConfig(badConfig),badSalt=tx.randomSalt();
  const badPredicted=await c.pub.readContract({address:d.market,abi:marketAbi,functionName:"rightAddress",args:[wallet,d.coveredNFTPurchase!,configHash(badBytes),deadline,A,badSalt]});
  const invalidCreate={address:d.market,abi:marketAbi,functionName:"createRight",args:[d.coveredNFTPurchase!,badBytes,deadline,A,badSalt]} as const;
  const badCalls=[raw(invalidCreate),raw(tx.depositNft(nft,wallet,badPredicted,badId)),raw(rt.activateRight(badPredicted,badBytes))];
  // Bypass simulation only to obtain a genuinely reverted transaction receipt for rollback evidence.
  const failedHash=await c.wallet(ISSUER).writeContract({address:wallet,abi:artifacts.AtomicWallet.abi,functionName:"executeBatch",args:[badCalls],gas:3_000_000n,account:ISSUER,chain:c.chain});
  const failed=await c.pub.waitForTransactionReceipt({hash:failedHash});
  assert.equal(failed.status,"reverted");
  transactions.push({label:"failed atomic activation rollback",hash:failedHash,block:String(failed.blockNumber),gasUsed:String(failed.gasUsed),gasPrice:String(failed.effectiveGasPrice),gasCost:String(failed.gasUsed*failed.effectiveGasPrice),from:ISSUER,to:wallet,status:failed.status});
  assert.equal(await c.pub.getCode({address:badPredicted}),undefined);
  assert.equal(await c.pub.readContract({address:d.market,abi:marketAbi,functionName:"isRight",args:[badPredicted]}),false);
  assert.equal((await c.pub.readContract({address:nft,abi:erc721Abi,functionName:"ownerOf",args:[badId]})).toLowerCase(),wallet.toLowerCase());
  const authoritativeState=await Promise.all([right.account,canceled.account,expiring.account,pending.account,predicted].map(async account=>{
    const state=await readRight(c.pub,d,account);
    const backingOwner=state.nft&&state.assetId!==null?await c.pub.readContract({address:state.nft,abi:erc721Abi,functionName:"ownerOf",args:[state.assetId]}):null;
    return {account,tokenId:String(state.tokenId),state:state.state,stateCode:state.stateCode,holder:state.holder,issuer:state.issuer,residual:state.residual,nft:state.nft,assetId:state.assetId===null?null:String(state.assetId),backingOwner,price:state.price===null?null:String(state.price),deadline:String(state.deadline),royaltyTo:state.royaltyTo,royaltyAmount:String(state.royaltyAmount),totalCredits:String(state.totalCredits),accountBalance:String(state.balance),credits:state.credits.map(x=>({beneficiary:x.beneficiary,amount:String(x.amount)}))};
  }));
  return {deploymentId:d.deploymentId,protocolCommit:d.protocolCommit,chainId:31337,contracts:{market:d.market,rightImplementation:d.rightImplementation,rights:d.rights,coveredNFTPurchase:d.coveredNFTPurchase,nft,atomicWallet:wallet},actors:{issuer:ISSUER,buyerA:A,buyerB:B,finalizer:FINALIZER},rights:{exercised:right.account,surrendered:canceled.account,expired:expiring.account,canceled:pending.account,atomic:predicted,rolledBack:badPredicted},premiumReceipts:{primarySeller:String(E("0.198")),secondarySeller:String(E("0.297")),tradingFees:String(E("0.005"))},paymentReceipts:receipts,authoritativeState,atomicRollback:{tx:failedHash,status:failed.status,created:false,deposited:false,nftOwner:wallet},transactions};
}
