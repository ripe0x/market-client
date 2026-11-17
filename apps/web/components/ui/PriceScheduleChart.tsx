import { priceAt, type Schedule } from "@market/protocol";
import styles from "./PriceScheduleChart.module.css";

// Exact two-segment shape of a Schedule: linear ramp start→end, then a flat hold at endPrice
// (STYLE_GUIDE §5 charts). No gridlines, no fills. 1.5px stroke.
// - variant "live": past solid #b5b5b5, future dashed #444, split at `now` with a 4px #fff dot.
// - variant "preview": ramp solid #7a7a7a, hold dashed #444, no dot (Create / form preview).
export function PriceScheduleChart({
  schedule,
  now,
  variant = "live",
  width = 424,
  height = 48,
  leftLabel,
  rightLabel,
}: {
  schedule: Schedule;
  now: bigint;
  variant?: "live" | "preview";
  width?: number;
  height?: number;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const s = schedule;
  const startTime = s.startTime;
  const endRamp = s.endTime;
  // Degenerate (fixed / zero-length) schedule: nothing to ramp.
  if (endRamp <= startTime) return null;

  const padL = 4,
    padR = 4,
    padT = 6,
    padB = height <= 40 ? 10 : 8;

  // x domain: ramp, plus a hold tail so the flat segment is visible.
  const tail =
    variant === "preview"
      ? (endRamp - startTime) / 7n
      : now > endRamp
        ? now - endRamp
        : 0n;
  const t0 = startTime;
  const t1 = endRamp + tail;
  const tSplit = variant === "preview" ? endRamp : clamp(now, t0, t1);

  const pMin = s.endPrice < s.startPrice ? s.endPrice : s.startPrice;
  const pMax = s.endPrice < s.startPrice ? s.startPrice : s.endPrice;
  const span = pMax - pMin;

  const px = (t: bigint) =>
    padL + Number(((t - t0) * BigInt(Math.round((width - padL - padR) * 1000))) / (t1 - t0)) / 1000;
  const py = (p: bigint) => {
    const frac = span === 0n ? 0.5 : Number(((pMax - p) * 100000n) / span) / 100000;
    return padT + frac * (height - padT - padB);
  };

  // Schedule vertices in time order.
  const verts: Array<[bigint, bigint]> = [
    [t0, s.startPrice],
    [endRamp, s.endPrice],
  ];
  if (t1 > endRamp) verts.push([t1, s.endPrice]);

  const splitPrice = priceAt(s, tSplit);
  const splitPt: [number, number] = [px(tSplit), py(splitPrice)];

  const solid = verts.filter(([t]) => t <= tSplit).map((v) => point(px(v[0]), py(v[1])));
  solid.push(splitPt);
  const dashed = [splitPt, ...verts.filter(([t]) => t > tSplit).map((v): [number, number] => [px(v[0]), py(v[1])])];

  const solidColor = variant === "preview" ? "#7a7a7a" : "#b5b5b5";

  return (
    <div className={styles.wrap}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={styles.svg} aria-hidden="true">
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="#262626" strokeWidth="1" />
        <polyline points={toPoints(solid)} fill="none" stroke={solidColor} strokeWidth="1.5" />
        {dashed.length > 1 && (
          <polyline points={toPoints(dashed)} fill="none" stroke="#444" strokeWidth="1.5" strokeDasharray="3 4" />
        )}
        {variant === "live" && <circle cx={splitPt[0]} cy={splitPt[1]} r="4" fill="#fff" />}
      </svg>
      {(leftLabel || rightLabel) && (
        <div className={styles.labels} style={{ width }}>
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

const clamp = (v: bigint, lo: bigint, hi: bigint) => (v < lo ? lo : v > hi ? hi : v);
const point = (x: number, y: number): [number, number] => [x, y];
const toPoints = (pts: Array<[number, number]>) => pts.map(([x, y]) => `${x},${y}`).join(" ");
