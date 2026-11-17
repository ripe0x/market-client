/** Build a path with merged query params; empty/undefined values are dropped. */
export function withParams(base: string, params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}
