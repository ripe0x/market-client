import Link from "next/link";
import { cx } from "@/lib/cx";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "text";
type Size = "inline" | "mobile" | "desktop";

type Common = {
  variant?: Variant;
  /** 40 (inline) / 58 (mobile CTA) / 64 (desktop CTA). STYLE_GUIDE §5. */
  size?: Size;
  /** Full width (for CTAs). */
  block?: boolean;
  /** Underline marks the current page (text variant). */
  active?: boolean;
  className?: string;
  children: React.ReactNode;
};

type AsButton = Common & { href?: undefined } & React.ButtonHTMLAttributes<HTMLButtonElement>;
type AsLink = Common & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">;

export function Button(props: AsButton | AsLink) {
  const { variant = "primary", size = "inline", block, active, className, children } = props;
  const cls = cx(
    styles.btn,
    styles[variant],
    styles[size],
    block && styles.block,
    active && styles.active,
    className,
  );
  if ("href" in props && props.href !== undefined) {
    const { href, variant: _v, size: _s, block: _b, active: _a, className: _c, children: _ch, ...rest } = props;
    return (
      <Link href={href} className={cls} data-interactive {...rest}>
        {children}
      </Link>
    );
  }
  const { variant: _v, size: _s, block: _b, active: _a, className: _c, children: _ch, ...rest } =
    props as AsButton;
  return (
    <button className={cls} data-interactive {...rest}>
      {children}
    </button>
  );
}
