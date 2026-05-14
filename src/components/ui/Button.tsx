import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "accent" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: ReactNode;
}

const sizeClass: Record<Size, string | undefined> = {
  sm: styles.sm,
  md: undefined,
  lg: styles.lg,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    leadingIcon,
    children,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const classes = [styles.button, styles[variant], sizeClass[size], className]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={classes}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.loader} aria-hidden /> : leadingIcon}
      {children}
    </button>
  );
});
