"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain } from "wagmi";
import { royaltyOf, verifyDeployment } from "@market/protocol";
import { DEPLOYMENT, CHAIN_NAME } from "@/lib/deployment";
import { CHAIN_ID } from "@/lib/env";
import { useIndexerLag } from "@/data/hooks";
import { IndexerBehind, WrongNetwork, Empty } from "@/components/screens";

const ONE_ETH = 10n ** 18n;

/** ERC2981 rate (bps) a collection asks at 1 ETH; null/0 → no royalty (PLAN.md §2.1.6, DECISIONS D2).
 * `sampleTokenId` should be a token known to exist (e.g. from a listing); defaults to 1. */
export function useRoyaltyBps(nft?: string, sampleTokenId?: string): number | null | undefined {
  const pub = usePublicClient();
  const [bps, setBps] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!pub || !nft) return;
    let live = true;
    const id = sampleTokenId ? BigInt(sampleTokenId) : 1n;
    royaltyOf(pub, DEPLOYMENT, nft as `0x${string}`, id, ONE_ETH)
      .then(([, royalty]) => live && setBps(royalty > 0n ? Number((royalty * 10_000n) / ONE_ETH) : null))
      .catch(() => live && setBps(null));
    return () => {
      live = false;
    };
  }, [pub, nft, sampleTokenId]);
  return bps;
}

/** Mono banner when the indexer lags more than 60s (PLAN.md §7). */
export function LagBanner() {
  const lag = useIndexerLag();
  if (lag === null || lag <= 60) return null;
  const mins = Math.max(1, Math.round(lag / 60));
  return <IndexerBehind text={`Showing data from ${mins} minute${mins === 1 ? "" : "s"} ago.`} />;
}

type GuardState = "checking" | "ok" | "wrong_network" | "not_deployed" | "mismatch";

/** Gate trading when the deployment is missing or its code hashes don't match, or the wallet is on
 * the wrong network (PLAN.md §8.4, §7). Checked once per session for the code-hash check. */
export function useTradingGuard(): { state: GuardState; switchChain?: () => void; chainName: string } {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const pub = usePublicClient();
  const [verified, setVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!pub || DEPLOYMENT.startBlock === null) return;
    let live = true;
    verifyDeployment(pub, DEPLOYMENT)
      .then((bad) => live && setVerified(bad.length === 0))
      .catch(() => live && setVerified(false));
    return () => {
      live = false;
    };
  }, [pub]);

  let state: GuardState = "ok";
  if (DEPLOYMENT.startBlock === null) state = "not_deployed";
  else if (verified === false) state = "mismatch";
  else if (verified === null) state = "checking";
  else if (isConnected && chainId !== CHAIN_ID) state = "wrong_network";
  return { state, switchChain: () => switchChain({ chainId: CHAIN_ID }), chainName: CHAIN_NAME };
}

/** Renders the blocking state for a bad guard, or `children` when trading is allowed. */
export function TradingGate({ children }: { children: React.ReactNode }) {
  const guard = useTradingGuard();
  if (guard.state === "not_deployed")
    return <Empty title="Not available here" note={`Market isn't deployed on ${guard.chainName} yet.`} />;
  if (guard.state === "mismatch")
    return <Empty title="Trading paused" note="The deployed contracts don't match the expected build, so trading is disabled." />;
  if (guard.state === "wrong_network") return <WrongNetwork chainName={guard.chainName} onSwitch={guard.switchChain} />;
  return <>{children}</>;
}
