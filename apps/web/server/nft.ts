// Server only: imported by route handlers, never by client components.
// NFT data the protocol does not hold (DECISIONS D2, D30): token metadata and media, which
// tokens a wallet holds, and Items / Owners counts. Alchemy's NFT API when ALCHEMY_API_KEY is set
// (not RPC: chain reads stay on Tenderly's public gateway, D31); otherwise read from the chain
// (tokenURI, Transfer logs, totalSupply), which is complete on local chains and best-effort
// elsewhere.
import { deploymentFor, erc721Abi } from "@market/protocol";
import { createPublicClient, getAddress, http, parseAbiItem, type Address } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const rpcUrl = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? deploymentFor(chainId).rpcUrl;
export const client = createPublicClient({ transport: http(rpcUrl, { batch: true }) });

const ALCHEMY_NETWORK: Record<number, string> = { 1: "eth-mainnet", 11155111: "eth-sepolia" };
const alchemyBase = () => {
  const key = process.env.ALCHEMY_API_KEY;
  const net = ALCHEMY_NETWORK[chainId];
  return key && net ? `https://${net}.g.alchemy.com/nft/v3/${key}` : null;
};

export type TokenMeta = { name: string | null; image: string | null };
export type OwnedToken = { nft: Address; tokenId: string; name: string | null; collectionName: string | null; image: string | null };

const IPFS_GATEWAY = "https://ipfs.io/ipfs/";
/** ipfs:// and ar:// to https; data: and http(s) kept; anything else dropped. */
export function normalizeUri(u: string | null | undefined): string | null {
  if (!u) return null;
  const s = u.trim();
  if (s.startsWith("ipfs://")) return IPFS_GATEWAY + s.slice(7).replace(/^ipfs\//, "");
  if (s.startsWith("ar://")) return `https://arweave.net/${s.slice(5)}`;
  if (/^(https?:|data:)/i.test(s)) return s;
  return null;
}

async function fetchJson(url: string): Promise<unknown> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const head = url.slice(5, comma);
    const body = url.slice(comma + 1);
    return JSON.parse(head.endsWith(";base64") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body));
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(8_000), next: { revalidate: 3600 } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

/** Text from untrusted metadata, trimmed to a sane length. Rendered as text only. */
const text = (v: unknown, max = 120) => (typeof v === "string" ? v.slice(0, max) : null);

export async function tokenMeta(nft: Address, tokenId: bigint): Promise<TokenMeta> {
  const base = alchemyBase();
  if (base) {
    try {
      const r = await fetch(`${base}/getNFTMetadata?contractAddress=${nft}&tokenId=${tokenId}`, { next: { revalidate: 3600 } });
      if (r.ok) {
        const j = (await r.json()) as { name?: string; image?: { cachedUrl?: string; originalUrl?: string } };
        return { name: text(j.name), image: normalizeUri(j.image?.cachedUrl ?? j.image?.originalUrl) };
      }
    } catch {}
  }
  try {
    const uri = normalizeUri(await client.readContract({ address: nft, abi: erc721Abi, functionName: "tokenURI", args: [tokenId] }));
    if (!uri) return { name: null, image: null };
    const j = (await fetchJson(uri)) as { name?: unknown; image?: unknown; image_url?: unknown };
    return { name: text(j.name), image: normalizeUri(text(j.image, 100_000) ?? text(j.image_url, 100_000)) };
  } catch {
    return { name: null, image: null };
  }
}

const transfer = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");

/**
 * ERC721 tokens `owner` holds, limited to `collections` when given. Tokens escrowed in a listing
 * belong to their order, so they never appear here (handoff README: listed NFTs are not in the
 * seller's wallet).
 */
export async function ownedTokens(owner: Address, collections: Address[]): Promise<OwnedToken[]> {
  const base = alchemyBase();
  if (base) {
    const q = new URLSearchParams({ owner, withMetadata: "true", pageSize: "100" });
    for (const c of collections) q.append("contractAddresses[]", c);
    const r = await fetch(`${base}/getNFTsForOwner?${q}`, { next: { revalidate: 30 } });
    if (r.ok) {
      const j = (await r.json()) as {
        ownedNfts: { contract: { address: string; name?: string; tokenType?: string }; tokenId: string; name?: string; image?: { cachedUrl?: string } }[];
      };
      return j.ownedNfts
        .filter((n) => n.contract.tokenType === "ERC721")
        .map((n) => ({
          nft: getAddress(n.contract.address),
          tokenId: n.tokenId,
          name: text(n.name),
          collectionName: text(n.contract.name),
          image: normalizeUri(n.image?.cachedUrl),
        }));
    }
  }
  // Chain fallback: tokens transferred to `owner` in known collections that it still owns.
  const out: OwnedToken[] = [];
  for (const nft of collections) {
    const logs = await client.getLogs({ address: nft, event: transfer, args: { to: owner }, fromBlock: 0n }).catch(() => []);
    const ids = [...new Set(logs.map((l) => l.args.tokenId!))];
    const owners = await Promise.all(
      ids.map((id) => client.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [id] }).catch(() => null)),
    );
    const name = await client.readContract({ address: nft, abi: erc721Abi, functionName: "name" }).catch(() => null);
    for (const [i, id] of ids.entries()) {
      if (owners[i] && getAddress(owners[i]!) === getAddress(owner)) {
        const m = await tokenMeta(nft, id);
        out.push({ nft, tokenId: id.toString(), name: m.name, collectionName: name, image: m.image });
      }
    }
  }
  return out;
}

/** Items and Owners for the collection header and table; null when unknown. */
export async function collectionCounts(nft: Address): Promise<{ items: number | null; owners: number | null }> {
  const base = alchemyBase();
  if (base) {
    try {
      const [meta, owners] = await Promise.all([
        fetch(`${base}/getContractMetadata?contractAddress=${nft}`, { next: { revalidate: 3600 } }).then((r) => r.json()),
        fetch(`${base}/getOwnersForContract?contractAddress=${nft}`, { next: { revalidate: 3600 } }).then((r) => r.json()),
      ]);
      const supply = Number((meta as { totalSupply?: string }).totalSupply);
      return { items: Number.isFinite(supply) ? supply : null, owners: (owners as { owners?: unknown[] }).owners?.length ?? null };
    } catch {}
  }
  const supply = await client.readContract({ address: nft, abi: erc721Abi, functionName: "totalSupply" }).catch(() => null);
  return { items: supply == null ? null : Number(supply), owners: null };
}
