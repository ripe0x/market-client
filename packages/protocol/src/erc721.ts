import { parseAbi } from "viem";

/** The ERC721 / ERC165 / ERC2981 surface the client reads and writes. */
export const erc721Abi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
  "function approve(address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
]);

export const multicall3Abi = parseAbi(["function getEthBalance(address addr) view returns (uint256 balance)"]);

export const INTERFACE = { erc721: "0x80ac58cd", erc1155: "0xd9b67a26", erc2981: "0x2a55205a" } as const;

/** Mainnet CryptoPunks: not ERC721 (NFT_TRADING.md, Compatibility). */
export const KNOWN_INCOMPATIBLE: Record<string, string> = {
  "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb": "punks",
};
