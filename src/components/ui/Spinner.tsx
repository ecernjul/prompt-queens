import { useEffect, useRef, useState } from "react";
import styles from "./Spinner.module.css";

type Size = "sm" | "md" | "lg";

interface SpinnerProps {
  size?: Size;
  label?: string;
}

export function Spinner({ size = "md", label }: SpinnerProps) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      role="status"
      aria-label={label || "Loading"}
    />
  );
}

interface LoadingBarProps {
  message: string;
}

/** Inline loading banner — small spinner + a single piece of copy. */
export function LoadingBar({ message }: LoadingBarProps) {
  return (
    <div className={styles.loadingBar} role="status" aria-live="polite">
      <Spinner size="sm" />
      <span>{message}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * RotatingLoadingBar
 *
 * A loading bar whose copy changes as time passes — useful for long-running
 * jobs so the user sees forward motion and knows the system is still working.
 * Each stage fires after its own `afterMs` threshold; the most recently
 * passed stage is shown.
 * ----------------------------------------------------------------------- */

export interface LoadingStage {
  afterMs: number;
  message: string;
}

interface RotatingLoadingBarProps {
  stages: LoadingStage[];
  /** Resets the clock when this key changes (e.g. new request started). */
  runKey?: string | number;
}

export function RotatingLoadingBar({
  stages,
  runKey,
}: RotatingLoadingBarProps) {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      setElapsed(Date.now() - startedAt.current);
    }, 1000);
    return () => window.clearInterval(id);
  }, [runKey]);

  const sorted = [...stages].sort((a, b) => a.afterMs - b.afterMs);
  const current =
    [...sorted].reverse().find((s) => elapsed >= s.afterMs) ?? sorted[0];

  return <LoadingBar message={current?.message ?? "Working…"} />;
}
