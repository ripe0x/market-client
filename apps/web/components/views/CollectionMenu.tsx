"use client";

import { useState } from "react";
import Link from "next/link";
import type { ApiCollection } from "@market/protocol";
import { useIndexer } from "@/data/hooks";
import { paths } from "@/data/indexer";
import { withParams } from "@/lib/href";
import { isActionsCollection } from "@/lib/deployment";
import styles from "./CollectionMenu.module.css";

// "All collections ▾" — collections with live listings, by volume (PLAN.md §2.1.3). The Actions
// ERC721 is excluded; its tokens are traded through their own action views, not browsed here.
export function CollectionMenu({ selected, sort, view }: { selected?: string; sort?: string; view?: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useIndexer<ApiCollection[]>(paths.collections({ period: "7d" }));
  const cols = (data ?? []).filter((c) => !isActionsCollection(c.address));
  const current = selected ? cols.find((c) => c.address.toLowerCase() === selected.toLowerCase())?.name : null;
  const label = current ?? "All collections";
  const href = (collection?: string) => withParams("/", { collection, sort, view });

  return (
    <span className={styles.menu}>
      <button type="button" className={styles.button} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label} ▾
      </button>
      {open && (
        <div className={styles.list} onClick={() => setOpen(false)}>
          <Link href={href(undefined)} className={styles.opt}>
            All collections
          </Link>
          {cols.map((c) => (
            <Link key={c.address} href={href(c.address)} className={styles.opt}>
              {c.name ?? "Collection"}
            </Link>
          ))}
        </div>
      )}
    </span>
  );
}
