import type { ReactNode } from "react";
import styles from "./Table.module.css";

interface TableProps {
  /** When true, wraps the table in a horizontally scrollable container. */
  scrollX?: boolean;
  children: ReactNode;
}

/**
 * Table — styled wrapper providing the rounded card + horizontal-scroll
 * pattern. Combine with the `<table>`, `<thead>`, etc. you'd write normally,
 * then apply `tableStyles.th` / `.td` / `.row` for typography.
 */
export function Table({ scrollX = false, children }: TableProps) {
  return (
    <div className={styles.tableWrap}>
      <div className={scrollX ? styles.scrollX : undefined}>{children}</div>
    </div>
  );
}

export { styles as tableStyles };
