import { cx } from "@/lib/cx";
import styles from "./Input.module.css";

// 42–44px, 1px #333 border, no fill (STYLE_GUIDE §5).
export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(styles.input, className)} {...rest} />;
}
