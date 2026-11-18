"use client";
import { DEPLOYMENT } from "@/lib/deployment";
import type { ApiStatus } from "@market/protocol";
import { useQuery } from "@tanstack/react-query";
import { useBlock } from "wagmi";
import { indexer, paths } from "./indexer";

/**
 * Chain time of the latest block, refreshed every block (PLAN.md §5.4). Prices shown are
 * `priceAt(schedule, head)`: "payable at the current block". Falls back to wall clock until the
 * first block arrives.
 */
export function useHead(): bigint {
  const { data } = useBlock({ watch: true, query: { refetchInterval: 4_000 } });
  return data?.timestamp ?? BigInt(Math.floor(Date.now() / 1000));
}

export function useHeadBlock(): bigint | undefined {
  return useBlock({ watch: true }).data?.number;
}

/** An indexer path as a query; refetched every 12 s and after every confirmed write. */
export function useIndexer<T>(path: string | null, opts: { refetch?: number } = {}) {
  return useQuery({
    queryKey: ["indexer", DEPLOYMENT.deploymentId, path],
    queryFn: () => indexer<T>(path!),
    enabled: !!path,
    refetchInterval: opts.refetch ?? 12_000,
  });
}

/** Seconds the indexer is behind the chain head, or null when unknown. */
export function useIndexerLag(): number | null {
  const head = useBlock({ watch: true }).data;
  const st = useIndexer<ApiStatus>(paths.status(), { refetch: 6_000 }).data;
  if (!head || !st?.ready) return null;
  return Math.max(0, Number(head.timestamp) - st.timestamp);
}

/** JSON fetch of the app's own NFT routes. */
export function useApi<T>(path: string | null) {
  return useQuery({
    queryKey: ["api", DEPLOYMENT.deploymentId, path],
    queryFn: async () => {
      const r = await fetch(path!);
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as T;
    },
    enabled: !!path,
    staleTime: 15_000,
  });
}
