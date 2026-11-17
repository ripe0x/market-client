"use client";

import { useState } from "react";
import { cx } from "@/lib/cx";
import styles from "./TokenMedia.module.css";

// Square media, #111 placeholder. Renders an image URL via a plain <img> only — never inline
// SVG/HTML from token metadata (PLAN.md §8: an <img> SVG cannot run script). The lead passes URLs
// already routed through the server media proxy.
export function TokenMedia({
  src,
  alt,
  size,
  className,
}: {
  src?: string | null;
  alt?: string;
  /** Fixed px square; omit to fill a square parent via aspect-ratio. */
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <span
      className={cx(styles.media, size ? undefined : styles.fill, className)}
      style={size ? { width: size, height: size } : undefined}
    >
      {show && (
        <img
          className={styles.img}
          src={src}
          alt={alt ?? ""}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
