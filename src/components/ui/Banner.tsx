import type { ReactNode } from "react";
import styles from "./Banner.module.css";

type Tone = "info" | "success" | "warning" | "danger" | "feature";

interface BannerProps {
  tone?: Tone;
  title?: ReactNode;
  /** Optional supporting copy below the title. */
  children?: ReactNode;
  /** Optional action slot rendered on the right — usually a Button. */
  action?: ReactNode;
  /** ARIA role override — defaults match the tone (alert vs. status). */
  role?: "alert" | "status";
}

const toneClass: Record<Tone, string> = {
  info: "info",
  success: "success",
  warning: "warning",
  danger: "danger",
  feature: "feature",
};

/**
 * Banner — a wide, in-page notice. Tone determines color:
 *  - info        neutral information
 *  - success     completed positively
 *  - warning     attention needed, state drifted
 *  - danger      something failed
 *  - feature     gradient "celebration" — use sparingly, e.g. "results ready"
 */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  role,
}: BannerProps) {
  const ariaRole = role ?? (tone === "danger" ? "alert" : "status");
  return (
    <div
      className={`${styles.banner} ${styles[toneClass[tone]]}`}
      role={ariaRole}
    >
      <div className={styles.text}>
        {title && <div className={styles.title}>{title}</div>}
        {children && <div className={styles.body}>{children}</div>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
