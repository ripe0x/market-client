"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApiSearch } from "@market/protocol";
import { useIndexer } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { cx } from "@/lib/cx";
import styles from "./SearchField.module.css";

// 520×42 desktop / full-width 44px mobile, 1px #333 (README). Results dropdown: Collections and
// Tokens groups matching name, symbol, address and `name #id` (DECISIONS D19).
export function SearchField({ mobile }: { mobile?: boolean }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const term = q.trim();
  const { data } = useIndexer<ApiSearch>(term.length >= 2 ? paths.search(term) : null);
  const open = focused && term.length >= 2 && !!data;
  const hasResults = !!data && (data.collections.length > 0 || data.tokens.length > 0);

  return (
    <div className={cx(styles.field, mobile && styles.mobile)}>
      <input
        className={styles.input}
        type="search"
        placeholder="Search collections and tokens"
        aria-label="Search collections and tokens"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {open && (
        <div className={styles.results}>
          {!hasResults && <div className={styles.empty}>No matches</div>}
          {data!.collections.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupLabel}>Collections</div>
              {data!.collections.map((c) => (
                <Link key={c.address} href={`/c/${c.address}`} className={styles.row} onClick={() => setQ("")}>
                  <span className={styles.name}>{c.name ?? "Collection"}</span>
                  {c.symbol && <span className={styles.meta}>{c.symbol}</span>}
                </Link>
              ))}
            </div>
          )}
          {data!.tokens.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupLabel}>Tokens</div>
              {data!.tokens.map((t) => (
                <Link key={`${t.nft}-${t.tokenId}`} href={`/c/${t.nft}/${t.tokenId}`} className={styles.row} onClick={() => setQ("")}>
                  <span className={styles.name}>{t.collectionName ?? "Token"}</span>
                  <span className={styles.meta}>#{t.tokenId}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
