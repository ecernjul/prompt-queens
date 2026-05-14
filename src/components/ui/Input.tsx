import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  help?: ReactNode;
  /** Render a wrapper around a row of inputs/buttons. Default true if label is given. */
  block?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, help, block = true, className, id, ...rest },
  ref,
) {
  // We need a stable id when a label is provided so they can be associated.
  // If the caller didn't pass one, fall back to a derived label-id; this is
  // fine for most cases since we're not in a server-rendering pipeline.
  const inputId = id ?? (label ? `input-${slug(label)}` : undefined);
  const input = (
    <input
      ref={ref}
      id={inputId}
      className={[styles.input, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );

  if (!label && !help) return input;

  return (
    <div className={block ? styles.field : styles.inline}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      {help && <div className={styles.help}>{help}</div>}
      {input}
    </div>
  );
});

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
