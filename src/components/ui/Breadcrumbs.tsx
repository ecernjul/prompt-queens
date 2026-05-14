import type { ReactNode } from "react";
import styles from "./Breadcrumbs.module.css";

export interface BreadcrumbStep {
  key: string;
  label: ReactNode;
  /** When false the step is greyed out and not clickable. */
  enabled?: boolean;
  /** When true the step is the current location. */
  current?: boolean;
  /** Tooltip shown when a disabled step is hovered. */
  hint?: string;
}

interface BreadcrumbsProps {
  steps: BreadcrumbStep[];
  onSelect: (key: string) => void;
}

/**
 * Breadcrumbs — a clickable trail showing the user's progress through a
 * multi-step flow. Steps can be disabled when prerequisites haven't been met.
 */
export function Breadcrumbs({ steps, onSelect }: BreadcrumbsProps) {
  return (
    <nav aria-label="Steps" className={styles.crumbs}>
      {steps.map((step, i) => {
        const enabled = step.enabled !== false;
        const isCurrent = !!step.current;
        return (
          <span key={step.key} className={styles.crumbRow}>
            <button
              type="button"
              className={[
                styles.crumb,
                isCurrent && styles.crumbCurrent,
                !enabled && styles.crumbDisabled,
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={!enabled || isCurrent}
              aria-current={isCurrent ? "page" : undefined}
              title={!enabled ? step.hint : undefined}
              onClick={() => enabled && !isCurrent && onSelect(step.key)}
            >
              <span className={styles.crumbIndex}>{i + 1}</span>
              <span>{step.label}</span>
            </button>
            {i < steps.length - 1 && (
              <span className={styles.separator} aria-hidden>
                ›
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
