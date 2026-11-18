import { decodeAbiParameters, encodeAbiParameters, getAddress, getAbiItem, isAddressEqual, keccak256, type Address, type Hex, type PublicClient } from "viem";
import { marketAbi, rightAbi, rightsAbi } from "./abis";
import { MULTICALL3, type Deployment } from "./addresses";
import { erc721Abi } from "./erc721";
import { verifyDeployment, sameAddress, OrderCheckError } from "./orders";

export const RIGHT_STATES = ["pending", "active", "exercised", "expired", "surrendered", "canceled"] as const;
export type RightState = typeof RIGHT_STATES[number];
export type CoveredNFTConfig = { nft: Address; tokenId: bigint; price: bigint; proceedsTo: Address; maxRoyaltyBps: number };
const coveredParam = { type: "tuple", components: [{name:"nft",type:"address"},{name:"tokenId",type:"uint256"},{name:"price",type:"uint256"},{name:"proceedsTo",type:"address"},{name:"maxRoyaltyBps",type:"uint16"}] } as const;
export const encodeCoveredConfig = (config: CoveredNFTConfig): Hex => encodeAbiParameters([coveredParam], [config]);
export const decodeCoveredConfig = (config: Hex): CoveredNFTConfig => decodeAbiParameters([coveredParam], config)[0];
export const encodeExerciseInput = (recipient: Address): Hex => encodeAbiParameters([{type:"address"}], [recipient]);
export const MIN_EXERCISE_WINDOW = 3600n;
export class RightCheckError extends Error {}
export type RightView = {
  deploymentId: string; account: Address; tokenId: bigint; issuer: Address; holder: Address | null; residual: Address; handler: Address;
  config: Hex | null; configError: string | null; supported: boolean; state: RightState; stateCode: number; deadline: bigint; effectiveExpired: boolean;
  nft: Address | null; assetId: bigint | null; price: bigint | null; proceedsTo: Address | null;
  royaltyTo: Address | null; royaltyAmount: bigint; activationTerms: Hex; backed: boolean;
  credits: { beneficiary: Address; amount: bigint }[]; totalCredits: bigint; balance: bigint;
};

export function requireRights(d: Deployment) {
  if (!d.rights || !d.rightImplementation || !d.coveredNFTPurchase) throw new RightCheckError("This deployment does not support execution rights.");
  return { rights: d.rights, implementation: d.rightImplementation, purchase: d.coveredNFTPurchase };
}

const creationCache = new Map<string, Hex>();
async function creationConfig(pub: PublicClient, d: Deployment, account: Address): Promise<Hex | null> {
  const key = `${d.chainId}:${d.market.toLowerCase()}:${account.toLowerCase()}`;
  const cached = creationCache.get(key);
  if (cached) return cached;
  const head = await pub.getBlockNumber({ cacheTime: 0 });
  const first = d.startBlock ?? head;
  const event = getAbiItem({ abi: marketAbi, name: "RightCreated" });
  // Public RPC logs are bounded; only the selected Market and indexed account can supply config.
  for (let to = head, requests = 0; to >= first && requests < 8; requests++) {
    const from = to > first + 1999n ? to - 1999n : first;
    const logs = await pub.getLogs({ address: d.market, event, args: { account }, fromBlock: from, toBlock: to, strict: true });
    const config = logs[0]?.args.config;
    if (config) { creationCache.set(key, config); return config; }
    if (from === first) break;
    to = from - 1n;
    if (d.chainId !== 31337) await new Promise(resolve => setTimeout(resolve, 250));
  }
  return null;
}

/** Canonical identity and live terms, independent of indexer claims. No handler-supplied UI. */
export async function readRight(pub: PublicClient, d: Deployment, account: Address, opts: { config?: Hex; beneficiaries?: Address[] } = {}): Promise<RightView> {
  const r = requireRights(d);
  if (d.startBlock === null || d.status !== "deployed") throw new RightCheckError("This rights release is not deployed.");
  if ((await pub.getChainId()) !== d.chainId || (await verifyDeployment(pub,d)).length !== 0) throw new RightCheckError("The selected deployment identity does not match the chain.");
  const genuine = await pub.readContract({ address: d.market, abi: marketAbi, functionName: "isRight", args: [account] });
  if (!genuine) throw new RightCheckError("This account was not created by the selected Market.");
  const tokenId = BigInt(account);
  const calls = ["issuer", "residual", "handler", "handlerCodehash", "configHash", "deadline", "state", "activationTerms", "totalCredits", "market", "rights"] as const;
  const values = await pub.multicall({ multicallAddress:MULTICALL3,allowFailure: false, contracts: calls.map(functionName => ({address:account,abi:rightAbi,functionName})) });
  const [issuer,residual,handler,handlerCodehash,hash,deadline,stateCode,activationTerms,totalCredits,market,rights] = values as [Address,Address,Address,Hex,Hex,bigint,number,Hex,bigint,Address,Address];
  if (!sameAddress(market,d.market) || !sameAddress(rights,r.rights) || !sameAddress(await pub.readContract({address:r.rights,abi:rightsAbi,functionName:"accountOf",args:[tokenId]}),account)) throw new RightCheckError("The right token mapping does not match its backing account.");
  if (!RIGHT_STATES[stateCode]) throw new RightCheckError("Unknown right lifecycle state.");
  const [block,balance,holder] = await Promise.all([
    pub.getBlock(), pub.getBalance({address:account}),
    pub.readContract({address:r.rights,abi:rightsAbi,functionName:"ownerOf",args:[tokenId]}).catch(()=>null),
  ]);
  if ((stateCode === 1) !== (holder !== null)) throw new RightCheckError("The token ownership lifecycle is inconsistent.");
  const supported = sameAddress(handler,r.purchase);
  let config: Hex | null = null, configError: string | null = null, c: CoveredNFTConfig | null = null;
  try {
    // Indexers recover creation bytes from this Market. They are still untrusted until the
    // authenticated account's immutable commitment matches, so they need no unbounded log scan.
    config = opts.config ?? await creationConfig(pub,d,account);
    if (!config) throw new Error("The creation config is unavailable. Actions requiring it are disabled.");
    if (keccak256(config) !== hash || (opts.config && keccak256(opts.config) !== hash)) throw new Error("The creation config does not match the committed terms.");
    creationCache.set(`${d.chainId}:${d.market.toLowerCase()}:${account.toLowerCase()}`, config);
    if (supported) {
      const code = await pub.getCode({address:handler});
      if (!code || keccak256(code) !== handlerCodehash) throw new Error("The committed handler code does not match.");
      c = decodeCoveredConfig(config);
      if (!sameAddress(residual,issuer) || c.proceedsTo === "0x0000000000000000000000000000000000000000") throw new Error("The covered purchase terms are invalid.");
    }
  } catch(e) { configError=e instanceof Error?e.message:"The config could not be verified."; config=null; }
  let royaltyTo: Address | null=null, royaltyAmount=0n;
  if (supported && c && activationTerms !== "0x") {
    try { [royaltyTo,royaltyAmount]=decodeAbiParameters([{type:"address"},{type:"uint256"}],activationTerms); }
    catch { configError="The committed activation terms are invalid."; }
  }
  const beneficiaries=[...new Set([c?.proceedsTo,royaltyTo,...(opts.beneficiaries ?? []).slice(0,32)].filter((x):x is Address=>!!x && x!=="0x0000000000000000000000000000000000000000").map(x=>getAddress(x)))];
  const credits=await Promise.all(beneficiaries.map(async beneficiary=>({beneficiary,amount:await pub.readContract({address:account,abi:rightAbi,functionName:"creditOf",args:[beneficiary]})})));
  const nftOwner=c?await pub.readContract({address:c.nft,abi:erc721Abi,functionName:"ownerOf",args:[c.tokenId]}).catch(()=>null):null;
  return {deploymentId:d.deploymentId,account:getAddress(account),tokenId,issuer,holder,residual,handler,config,configError,supported,state:RIGHT_STATES[stateCode]!,stateCode,deadline,effectiveExpired:deadline!==0n&&block.timestamp>=deadline,
    nft:c?.nft??null,assetId:c?.tokenId??null,price:c?.price??null,proceedsTo:c?.proceedsTo??null,royaltyTo,royaltyAmount,activationTerms,backed:sameAddress(nftOwner,account),credits,totalCredits,balance};
}

/** Pending deposits are a separate irreversible transaction unless the wallet truly batches. */
export async function verifyRightDeposit(pub: PublicClient,d:Deployment,account:Address,issuer:Address,config:CoveredNFTConfig,deadline:bigint):Promise<RightView> {
  const v=await readRight(pub,d,account,{config:encodeCoveredConfig(config)});
  if (!v.supported || v.configError || v.state!=="pending" || v.effectiveExpired || !sameAddress(v.issuer,issuer) || !sameAddress(v.residual,issuer) || v.deadline!==deadline || !sameAddress(v.nft,config.nft) || v.assetId!==config.tokenId || v.price!==config.price) throw new RightCheckError("The pending account does not match this issuance. Do not deposit.");
  const owner=await pub.readContract({address:config.nft,abi:erc721Abi,functionName:"ownerOf",args:[config.tokenId]});
  if (!sameAddress(owner,issuer)&&!sameAddress(owner,account)) throw new RightCheckError("The signing account no longer owns this nft.");
  return v;
}

export async function verifyRightTrade(pub:PublicClient,d:Deployment,nft:Address,tokenId:bigint,listingExpiry?:bigint,config?:Hex) {
  if (!d.rights || !sameAddress(nft,d.rights)) return;
  if (tokenId>BigInt("0xffffffffffffffffffffffffffffffffffffffff")) throw new RightCheckError("Invalid right token ID.");
  const v=await readRight(pub,d,getAddress(`0x${tokenId.toString(16).padStart(40,"0")}`),{config});
  if(v.configError||!v.supported||v.state!=="active"||v.effectiveExpired||!v.backed) throw new RightCheckError("This right is not a live covered purchase entitlement.");
  const now=(await pub.getBlock()).timestamp;
  if(v.deadline!==0n && v.deadline-now<MIN_EXERCISE_WINDOW) throw new RightCheckError("Less than one hour remains to exercise this right.");
  if(listingExpiry!==undefined && v.deadline!==0n && (listingExpiry===0n||listingExpiry>v.deadline-MIN_EXERCISE_WINDOW)) throw new RightCheckError("The listing must end at least one hour before exercise expires.");
  return v;
}
