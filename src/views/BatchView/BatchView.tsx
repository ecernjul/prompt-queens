import { useRef, useState } from "react";
import { runBatch, type BatchItem } from "../../api/client";
import styles from "./BatchView.module.css";

type Status = "idle" | "running" | "done" | "error";

export function BatchView() {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStatus("idle");
    setError(null);
    setItems([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      parseCsv(text);
    };
    reader.readAsText(file);
  }

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      setError("CSV must have a header row and at least one data row.");
      return;
    }
    const headers = lines[0].split(",").map((h) => h.trim());
    const colIdx = headers.findIndex((h) =>
      ["sku", "query", "search"].includes(h.toLowerCase()),
    );
    if (colIdx === -1) {
      setError("CSV must have a column named `SKU` or `Query`.");
      return;
    }
    const isSkuCol = headers[colIdx].toUpperCase() === "SKU";
    const parsed: BatchItem[] = lines
      .slice(1)
      .map((line) => line.split(",")[colIdx]?.trim())
      .filter(Boolean)
      .map((q) => ({ query: q, sku_mode: isSkuCol }));
    setItems(parsed);
  }

  async function handleGenerate() {
    if (items.length === 0) return;
    setStatus("running");
    setError(null);
    setProgress(0);

    // Simulate progress ticks while awaiting
    const interval = window.setInterval(() => {
      setProgress((p) => Math.min(p + 5, 90));
    }, 1500);

    try {
      const blob = await runBatch(items);
      clearInterval(interval);
      setProgress(100);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      a.download = `content_batch_${ts}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("done");
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Batch failed");
      setStatus("error");
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Batch Generate</h1>
        <p className={styles.subtitle}>
          Upload a CSV with a <code>SKU</code> or <code>Query</code> column. One row per product.
          Claude will generate all 9 content sections and bundle them into a ZIP of Word docs.
        </p>
      </div>

      <div className={styles.uploadArea}>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          onChange={handleFile}
          className={styles.fileInput}
          id="csv-upload"
        />
        <label htmlFor="csv-upload" className={styles.uploadLabel}>
          <span className={styles.uploadIcon}>📄</span>
          <span>
            {fileName ? fileName : "Click to upload CSV"}
          </span>
          {!fileName && (
            <span className={styles.uploadHint}>or drag and drop a .csv file</span>
          )}
        </label>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>⚠</span> {error}
        </div>
      )}

      {items.length > 0 && (
        <div className={styles.preview}>
          <p className={styles.previewLabel}>
            <strong>{items.length} product{items.length !== 1 ? "s" : ""}</strong> ready — mode:{" "}
            <span className={styles.modeBadge}>
              {items[0].sku_mode ? "Exact SKU" : "Natural language"}
            </span>
          </p>
          <div className={styles.previewList}>
            {items.slice(0, 8).map((item, i) => (
              <span key={i} className={styles.previewItem}>
                {item.query}
              </span>
            ))}
            {items.length > 8 && (
              <span className={styles.previewMore}>+{items.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {status === "running" && (
        <div className={styles.progressBox}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
          <p className={styles.progressLabel}>
            Generating content… this may take several minutes for large batches.
          </p>
        </div>
      )}

      {status === "done" && (
        <div className={styles.successBanner}>
          ✓ Done! Your ZIP file has been downloaded.
        </div>
      )}

      <button
        className={styles.generateBtn}
        onClick={handleGenerate}
        disabled={items.length === 0 || status === "running"}
      >
        {status === "running" ? "Generating…" : `Generate All (${items.length} products)`}
      </button>

      <div className={styles.formatBox}>
        <h3 className={styles.formatTitle}>CSV Format</h3>
        <pre className={styles.formatCode}>{`SKU\nXU-CH-10110-GG\n20-HA-MC705AF-3-BGE-GG\nABL-LE3-200-6`}</pre>
        <p className={styles.formatNote}>Or use a <code>Query</code> column for natural language searches.</p>
      </div>
    </div>
  );
}
