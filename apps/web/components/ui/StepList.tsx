import { cx } from "@/lib/cx";
import styles from "./StepList.module.css";

export type StepState = "todo" | "active" | "done" | "failed";
export type Step = { label: string; state?: StepState };

const RIGHT: Record<StepState, string> = { todo: "", active: "Next", done: "Done", failed: "Failed" };

// Numbered steps with per-step state; the active step resumes after a reload (PLAN.md §6).
// e.g. "1 Create the listing", "2 Move #15 into it".
export function StepList({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cx(styles.list, className)}>
      {steps.map((s, i) => {
        const state = s.state ?? "todo";
        return (
          <li key={i} className={cx(styles.row, styles[state])}>
            <span className={styles.num}>{i + 1}</span>
            <span className={styles.label}>{s.label}</span>
            {RIGHT[state] && <span className={styles.right}>{RIGHT[state]}</span>}
          </li>
        );
      })}
    </ol>
  );
}
