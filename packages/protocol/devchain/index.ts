// Local chains for development and tests: a real Anvil node with the protocol deployed by the
// protocol repo's own Deploy.s.sol (the production deployment path) and real test collections.
// Node only; never imported by the web app.
import { spawn, execFile, type ChildProcess } from "node:child_process";
import { readFileSync,mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  getAddress,
  http,
  parseEther,
  type Address,
  type Hex,
  keccak256,
} from "viem";
import { foundry } from "viem/chains";
import { deploymentFor, MULTICALL3, type Deployment, type ContractName } from "../src/addresses";
import * as A from "./artifacts";

const exec = promisify(execFile);
export const ROOT = resolve(import.meta.dirname, "../../..");

/** Anvil's default unlocked accounts (public test accounts, no keys handled here). */
export const ACCOUNTS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
] as const satisfies readonly Address[];

export async function freePort(): Promise<number> {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.listen(0, () => {
      const a = s.address();
      s.close(() => (typeof a === "object" && a ? ok(a.port) : fail(new Error("no port"))));
    });
  });
}

export type Chain = Awaited<ReturnType<typeof startChain>>;

/**
 * Start Anvil, install Multicall3's real runtime code (copied from mainnet; Anvil lacks it),
 * deploy the protocol with Deploy.s.sol and, unless `collections: false`, the test collections.
 */
export async function startChain(opts: { port?: number; collections?: boolean; blockTime?: number } = {}) {
  const port = opts.port ?? (await freePort());
  const rpcUrl = `http://127.0.0.1:${port}`;
  const args = ["--port", String(port), "--silent", "--chain-id", "31337"];
  if (opts.blockTime) args.push("--block-time", String(opts.blockTime));
  const anvil: ChildProcess = spawn("anvil", args, { stdio: "ignore" });
  const transport = http(rpcUrl);
  const chain = {
    ...foundry,
    rpcUrls: { default: { http: [rpcUrl] } },
    contracts: { multicall3: { address: MULTICALL3, blockCreated: 0 } },
  };
  const pub = createPublicClient({ chain, transport, pollingInterval: 100 });
  const test = createTestClient({ chain, transport, mode: "anvil" });
  for (let i = 0; ; i++) {
    try {
      await pub.getChainId();
      break;
    } catch {
      if (i > 100) throw new Error("anvil did not start");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const wallet = (account: Address) => createWalletClient({ chain, transport, account });

  await test.setCode({ address: MULTICALL3, bytecode: readFileSync(resolve(ROOT, "scripts/multicall3.hex"), "utf8").trim() as Hex });
  const broadcastDir=mkdtempSync(resolve(tmpdir(),"market-client-deploy-"));
  const deploymentRun = await exec(
    "forge",
    ["script", "script/Deploy.s.sol", "--rpc-url", rpcUrl, "--unlocked", "--sender", ACCOUNTS[0], "--broadcast"],
    { cwd: resolve(ROOT, "contracts/market"), maxBuffer: 1 << 24, env:{...process.env,FOUNDRY_BROADCAST:broadcastDir} },
  );
  const names = {market:"Market",orderImplementation:"Order implementation",rightImplementation:"Right implementation",rights:"Rights ERC721",feeConfig:"FeeConfig",nftSale:"NFTSale",nftBid:"NFTBid",coveredNFTPurchase:"CoveredNFTPurchase",fillVerifier:"FillVerifier"} as const;
  const broadcast=JSON.parse(readFileSync(resolve(broadcastDir,"Deploy.s.sol/31337/run-latest.json"),"utf8")) as {receipts:{transactionHash:Hex}[]};
  const deploymentReceipts=await Promise.all(broadcast.receipts.map(r=>pub.getTransactionReceipt({hash:r.transactionHash})));
  const deployedAt=deploymentReceipts.reduce((m,r)=>r.blockNumber<m?r.blockNumber:m,deploymentReceipts[0]!.blockNumber);
  const {stdout:source}=await exec("git",["rev-parse","HEAD"],{cwd:resolve(ROOT,"contracts/market")});
  const actual: Partial<Record<ContractName, Address>> = {};
  for(const [key,label] of Object.entries(names)) {
    const match=deploymentRun.stdout.match(new RegExp(`${label} (0x[0-9a-fA-F]{40})`));
    if(match) actual[key as ContractName]=getAddress(match[1]!);
  }
  if(!actual.market || !actual.rights) throw new Error("Deploy script did not report the rights release identity");
  const codehash:Deployment["codehash"]={};
  for(const [name,address] of Object.entries(actual)) codehash[name as ContractName]=keccak256((await pub.getCode({address}))!);
  const deployment = { ...deploymentFor(31337,"rights-v1"), ...actual, rpcUrl, codehash, startBlock:deployedAt, protocolCommit:source.trim(), status:"deployed" as const, deploymentId:`31337:rights-v1:${actual.market.toLowerCase()}` };
  for (const a of [deployment.market, deployment.feeConfig, deployment.nftSale, deployment.nftBid]) {
    if (!(await pub.getCode({ address: a }))) throw new Error(`protocol not deployed at ${a}`);
  }

  const collections = opts.collections === false ? null : await deployCollections(pub, wallet(ACCOUNTS[0]));

  return {
    rpcUrl,
    port,
    chain,
    pub,
    test,
    wallet,
    deployment,
    deploymentReceipts,
    collections,
    stop: () => anvil.kill(),
  };
}

type Pub = ReturnType<typeof createPublicClient>;
type Wallet = ReturnType<typeof createWalletClient>;

async function deploy(pub: Pub, w: Wallet, art: { abi: readonly unknown[]; bytecode: Hex }, args: unknown[] = []) {
  const hash = await w.deployContract({ abi: art.abi, bytecode: art.bytecode, args, account: w.account!, chain: w.chain } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error("deploy failed");
  return getAddress(r.contractAddress);
}

/** Royalty receiver of the default test collections: account 9. */
export const ROYALTY_TO = ACCOUNTS[9];

async function deployCollections(pub: Pub, w: Wallet) {
  const refusing = await deploy(pub, w, A.RefusingReceiver);
  return {
    /** ERC721 + ERC2981 at 5% to ROYALTY_TO. */
    driftlines: await deploy(pub, w, A.TestNFT, ["Driftlines", "DRFT", ROYALTY_TO, 500n, ""]),
    /** ERC721 + ERC2981 at 2.5%. */
    meridian: await deploy(pub, w, A.TestNFT, ["Meridian", "MRDN", ROYALTY_TO, 250n, ""]),
    /** ERC721 + ERC2981 at 7.5%. */
    tessellate: await deploy(pub, w, A.TestNFT, ["Tessellate", "TSL", ROYALTY_TO, 750n, ""]),
    /** ERC721 without ERC2981. */
    plain: await deploy(pub, w, A.PlainNFT),
    lockable: await deploy(pub, w, A.LockableNFT),
    zeroReceiver: await deploy(pub, w, A.ZeroReceiverRoyaltyNFT),
    /** ERC721 + ERC2981 whose receiver refuses ETH. */
    refusingRoyalty: await deploy(pub, w, A.TestNFT, ["Refusal", "RFSL", refusing, 500n, ""]),
    refusingReceiver: refusing,
    erc1155: await deploy(pub, w, A.Test1155),
    fakeSoldEmitter: await deploy(pub, w, A.FakeSoldEmitter),
    rogueCloneFactory: await deploy(pub, w, A.RogueCloneFactory),
  };
}

/** Mint `count` tokens of a TestNFT/PlainNFT/LockableNFT to `to`; returns the first id. */
export async function mint(c: Chain, nft: Address, to: Address, count = 1n): Promise<bigint> {
  const w = c.wallet(ACCOUNTS[0]);
  const { result, request } = await c.pub.simulateContract({ address: nft, abi: A.TestNFT.abi, functionName: "mint", args: [to, count], account: ACCOUNTS[0] });
  await c.pub.waitForTransactionReceipt({ hash: await w.writeContract(request) });
  return result;
}

export const ETH = (s: string) => parseEther(s);
export { A as artifacts };
export * from "./send";
