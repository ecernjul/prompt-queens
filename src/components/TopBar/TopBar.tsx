import type { ReactNode } from "react";
import styles from "./TopBar.module.css";

interface TopBarProps {
  /** Big wordmark — usually your company name. */
  wordmark: string;
  /** Optional product name displayed after the wordmark. */
  productName?: string;
  /** Right-aligned slot — typically <Breadcrumbs/> or user-menu actions. */
  trailing?: ReactNode;
}

/**
 * TopBar — sticky, blurred-glass header. The wordmark on the left uses a
 * "dot" accent color (e.g. `ubique.`); the trailing slot is where step
 * navigation, search, or user controls live.
 */
export function TopBar({ wordmark, productName, trailing }: TopBarProps) {
  return (
    <header className={styles.topBar}>
      <div className={styles.brand}>
        <span className={styles.wordmark}>
          {wordmark}
          <span className={styles.wordmarkDot}>.</span>
        </span>
        {productName && (
          <span className={styles.productName}>{productName}</span>
        )}
      </div>
      <div className={styles.spacer} />
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </header>
  );
}
