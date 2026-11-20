"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import {
  collectionKind,
  randomSalt,
  royaltyBpsCeil,
  sameAddress,
  type ApiCollection,
  type ApiPositions,
  type CollectionKind,
} from "@market/protocol";
import { CreateListingForm, ErrorNote, Loading, type CreateListingValue, type WalletNft, type SplitFigures, type RoyaltyOption } from "@/components/screens";
import { useHead, useIndexer, useApi } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { LagBanner, useRoyaltyBps } from "@/components/app/Trading";
import { FlowButton, useFlowUi } from "@/components/tx/Flow";
import { escrowListingSteps, depositStep, previewSplits } from "@/data/flows";
import { buildSaleSpec, parseEth } from "@/lib/listingConfig";
import { CHAIN_ID } from "@/lib/env";
import { DEPLOYMENT } from "@/lib/deployment";
import { Button } from "@/components/ui";

type Owned = { nft: Address; tokenId: string; collectionName: string | null; image: string | null };

const DEFAULT: CreateListingValue = { startPrice: "", changeOverTime: false, endPrice: "", duration: "7D", expires: "Never", maxRoyaltyBps: 0 };
const KEY = (wallet: string, nft: string, id: string) => `market:listing:${DEPLOYMENT.deploymentId}:${wallet.toLowerCase()}:${nft.toLowerCase()}:${id}`;

const KIND_COPY: Partial<Record<CollectionKind, string>> = {
  erc1155: "Market trades ERC721 tokens. This collection is ERC1155.",
  punks: "CryptoPunks aren't ERC721. Use a wrapped Punk.",
  unknown: "This doesn't look like an ERC721 collection, so it can't be listed here.",
};

export function SellView({ nft, id }: { nft?: string; id?: string }) {
  const router = useRouter();
  const { address } = useAccount();
  const pub = usePublicClient();
  const head = useHead();

  const collections = useIndexer<ApiCollection[]>(paths.collections({})).data ?? [];
  const colQuery = collections.slice(0, 50).map((c) => `collection=${c.address}`).join("&");
  const holdingsQuery = useApi<Owned[]>(address && colQuery ? `/api/nfts/owned?owner=${address}&${colQuery}` : null);
  const holdings = holdingsQuery.data ?? [];
  const positions = useIndexer<ApiPositions>(address ? paths.positions(address) : null).data;

  const [manual, setManual] = useState<{ nft: Address; tokenId: string } | null>(null);
  const [manualNft, setManualNft] = useState("");
  const [manualId, setManualId] = useState("");

  // Grid: holdings (listable) + the user's open listings shown as "Listed" (disabled).
  const openListings = (positions?.listings ?? []).filter((l) => !l.withdrawable && l.status !== "sold" && l.status !== "cancelled");
  const walletNfts: WalletNft[] = useMemo(() => {
    const held: WalletNft[] = holdings.map((h) => ({ nft: h.nft, tokenId: h.tokenId, collectionName: h.collectionName, mediaSrc: h.image, listed: false }));
    const listed: WalletNft[] = openListings
      .filter((l) => l.nft && l.tokenId && !held.some((h) => sameAddress(h.nft, l.nft!) && h.tokenId === l.tokenId))
      .map((l) => ({ nft: l.nft!, tokenId: l.tokenId!, collectionName: l.collectionName ?? null, listed: true }));
    const all = [...held, ...listed];
    if (manual && !all.some((n) => sameAddress(n.nft, manual.nft) && n.tokenId === manual.tokenId))
      all.unshift({ nft: manual.nft, tokenId: manual.tokenId, collectionName: null, listed: false });
    return all;
  }, [holdings, positions, manual]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedId, setSelectedId] = useState<string | undefined>(id ?? (nft && id ? id : undefined));
  const selected = walletNfts.find((n) => n.tokenId === selectedId && (!nft || sameAddress(n.nft, nft as Address))) ?? walletNfts.find((n) => !n.listed);
  const selNft = selected?.nft as Address | undefined;
  const selId = selected?.tokenId;
  const tok = selId ? `#${selId}` : "#—";

  const [value, setValue] = useState<CreateListingValue>(DEFAULT);
  const [salt, setSalt] = useState<Hex | undefined>();
  const [anchor, setAnchor] = useState<bigint>();
  const royaltyTouched = useRef(false);

  // On token change: restore any saved draft (resume) or start fresh, anchoring the schedule to now.
  useEffect(() => {
    if (!address || !selNft || !selId) return;
    royaltyTouched.current = false;
    let restored: { value?: CreateListingValue; salt?: Hex; anchor?: string } = {};
    try {
      const raw = localStorage.getItem(KEY(address!, selNft, selId));
      if (raw) restored = JSON.parse(raw);
    } catch {}
    setValue(restored.value ?? DEFAULT);
    setSalt(restored.salt ?? randomSalt());
    setAnchor(restored.anchor ? BigInt(restored.anchor) : head);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, selNft, selId]);

  // Persist the draft so a reload resumes step 2.
  useEffect(() => {
    if (!address || !selNft || !selId || !salt) return;
    try {
      localStorage.setItem(KEY(address!, selNft, selId), JSON.stringify({ value, salt, anchor: anchor?.toString() }));
    } catch {}
  }, [address, selNft, selId, value, salt, anchor]);

  // Collection royalty: default the limit (DECISIONS D3) and label the menu.
  const askedBps = useRoyaltyBps(selNft, selId);
  useEffect(() => {
    if (askedBps === undefined || royaltyTouched.current) return;
    setValue((v) => ({ ...v, maxRoyaltyBps: askedBps ?? 0 }));
  }, [askedBps]);

  // Refine the default to the ceil at both prices once we have live royalty reads.
  useEffect(() => {
    if (!pub || !selNft || !selId || royaltyTouched.current) return;
    const start = parseEth(value.startPrice);
    const end = value.changeOverTime ? parseEth(value.endPrice) : start;
    if (start === 0n) return;
    let live = true;
    (async () => {
      const [a, b] = await previewSplits(pub, selNft, BigInt(selId), [start, end]).catch(() => null) ?? [null];
      if (live && a) {
        const bps = Math.max(Number(royaltyBpsCeil(a.royaltyAsked, start)), b ? Number(royaltyBpsCeil(b.royaltyAsked, end)) : 0);
        if (!royaltyTouched.current) setValue((v) => ({ ...v, maxRoyaltyBps: bps }));
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub, selNft, selId]);

  const onChange = (next: CreateListingValue) => {
    if (next.maxRoyaltyBps !== value.maxRoyaltyBps) royaltyTouched.current = true;
    setValue(next);
  };

  // Compatibility check for a manually entered (or any selected) collection.
  const [kind, setKind] = useState<CollectionKind | null>(null);
  useEffect(() => {
    if (!pub || !selNft) return setKind(null);
    let live = true;
    collectionKind(pub, selNft).then((k) => live && setKind(k));
    return () => {
      live = false;
    };
  }, [pub, selNft]);

  // Breakdown via previewSplits (fee from newOrderFeeBps, never hardcoded).
  const [breakdown, setBreakdown] = useState<{ atStart: SplitFigures; atEnd?: SplitFigures }>({ atStart: { salePrice: 0n, royalty: 0n, royaltyBps: 0, fee: 0n, receive: 0n } });
  useEffect(() => {
    if (!pub || !selNft || !selId) return;
    const start = parseEth(value.startPrice);
    const end = value.changeOverTime ? parseEth(value.endPrice) : start;
    if (start === 0n) return;
    let live = true;
    (async () => {
      const prices = value.changeOverTime ? [start, end] : [start];
      const rows = await previewSplits(pub, selNft, BigInt(selId), prices).catch(() => null);
      if (!live || !rows) return;
      const fig = (r: (typeof rows)[number]): SplitFigures => ({ salePrice: r.price, royalty: r.royalty, royaltyBps: askedBps ?? 0, fee: r.fee, receive: r.proceeds });
      setBreakdown(value.changeOverTime && rows[1] ? { atStart: fig(rows[0]!), atEnd: fig(rows[1]) } : { atStart: fig(rows[0]!) });
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pub, selNft, selId, value.startPrice, value.endPrice, value.changeOverTime, askedBps]);

  const royaltyOptions: RoyaltyOption[] = [
    { label: askedBps ? `Collection asks ${askedBps / 100}%` : "Collection asks none", bps: askedBps ?? 0 },
    { label: "0%", bps: 0 },
    { label: "2.5%", bps: 250 },
    { label: "5%", bps: 500 },
    { label: "7.5%", bps: 750 },
    { label: "10%", bps: 1000 },
    { label: "No limit", bps: 10000 },
  ];

  // Flow: resume an awaiting_nft listing with just the deposit, else create + deposit.
  const awaiting = positions?.listings.find((l) => selNft && sameAddress(l.nft, selNft) && l.tokenId === selId && l.status === "awaiting_nft");
  const spec = anchor && selNft && selId && address ? buildSaleSpec(DEPLOYMENT, value, { nft: selNft, tokenId: BigInt(selId), proceedsTo: address }, anchor) : null;
  const flowSteps = awaiting ? depositStep(awaiting, tok) : spec && salt && selNft && selId ? escrowListingSteps(spec, salt, { nft: selNft, tokenId: BigInt(selId), kind: "sale" }, tok) : [];
  const { flow, uiSteps } = useFlowUi(flowSteps, { kind: "sale", token: tok });

  // A changing price starts at `anchor` and the expiry counts from it, so keep it at the current
  // block until the listing is created: a page left open must not create a listing that is
  // already part-way down its price curve. Frozen while a flow runs and once step 1 is done, so
  // step 2 still targets the predicted order address.
  useEffect(() => {
    if (anchor === undefined || flow.running || flow.states[0] === "done") return;
    if (head - anchor > 30n) setAnchor(head);
  }, [head, anchor, flow.running, flow.states]);

  if (!address) return <ErrorNote>Connect your wallet to list a token.</ErrorNote>;
  if (!positions && !holdings.length && collections.length === 0) return <Loading />;

  const startOk = parseEth(value.startPrice) > 0n;
  const endOk = !value.changeOverTime || parseEth(value.endPrice) > 0n;
  const kindError = kind && kind !== "erc721" ? KIND_COPY[kind] : null;
  const canList = !!selected && !selected.listed && startOk && endOk && !kindError && !!flowSteps.length;

  return (
    <>
      <LagBanner />
      <CreateListingForm
        now={head}
        walletNfts={walletNfts}
        selectedTokenId={selId}
        onSelectToken={setSelectedId}
        value={value}
        onChange={onChange}
        breakdown={breakdown}
        royaltyOptions={royaltyOptions}
        collectionRoyaltyBps={askedBps}
        steps={uiSteps}
        cta={
          <>
            {kindError && <ErrorNote emphasis>{kindError}</ErrorNote>}
            {holdingsQuery.isError && (
              <ErrorNote>{"Couldn't load the NFTs in your wallet. Reload to try again, or enter a contract address and token ID below."}</ErrorNote>
            )}
            <ManualEntry
              nft={manualNft}
              id={manualId}
              onNft={setManualNft}
              onId={setManualId}
              onUse={() => {
                if (isAddress(manualNft) && /^\d+$/.test(manualId)) {
                  setManual({ nft: getAddress(manualNft), tokenId: manualId });
                  setSelectedId(manualId);
                }
              }}
            />
            {selNft && DEPLOYMENT.rights && sameAddress(selNft, DEPLOYMENT.rights) ? <><p>This token is an execution right. Open its terms to list a premium with time left for exercise.</p><Button href={selId && BigInt(selId) < 2n ** 160n ? `/rights/0x${BigInt(selId).toString(16).padStart(40, "0")}` : "/rights"}>Open right terms</Button></> : <FlowButton
              flow={flow}
              label={awaiting ? `Move ${tok} into it` : `List ${tok}`}
              disabled={!canList}
              onDone={() => {
                try {
                  if (selNft && selId) localStorage.removeItem(KEY(address!, selNft, selId));
                } catch {}
                if (selNft && selId) router.push(`/c/${selNft}/${selId}`);
              }}
            />}
          </>
        }
      />
    </>
  );
}

function ManualEntry({ nft, id, onNft, onId, onUse }: { nft: string; id: string; onNft: (v: string) => void; onId: (v: string) => void; onUse: () => void }) {
  return (
    <details style={{ fontSize: 13, color: "var(--ink-3)" }}>
      <summary style={{ cursor: "pointer", padding: "4px 0" }}>List a token from another collection</summary>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input placeholder="Contract address" value={nft} onChange={(e) => onNft(e.target.value)} style={{ flex: 2, height: 36, background: "transparent", border: "1px solid var(--line-control)", color: "var(--ink)", padding: "0 10px", fontSize: 13 }} />
        <input placeholder="Token ID" value={id} onChange={(e) => onId(e.target.value)} style={{ flex: 1, height: 36, background: "transparent", border: "1px solid var(--line-control)", color: "var(--ink)", padding: "0 10px", fontSize: 13 }} />
        <button type="button" onClick={onUse} style={{ height: 36, padding: "0 14px", border: "1px solid var(--line-control)", color: "var(--ink)", fontSize: 13 }}>
          Use
        </button>
      </div>
    </details>
  );
}
