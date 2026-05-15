import { useState } from "react";
import { generateContent } from "../../api/client";
import type { ProductResult, Sections } from "../../types";
import styles from "./GenerateView.module.css";

interface Props {
  product: ProductResult | null;
  onContentGenerated: (sections: Sections, sectionKeys: string[], summary: string, imageUrl: string) => void;
  onBack: () => void;
}

export function GenerateView({ product, onContentGenerated, onBack }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!product) {
    return (
      <div className={styles.empty}>
        <p>No product selected.</p>
        <button className={styles.backBtn} onClick={onBack}>
          ← Back to Search
        </button>
      </div>
    );
  }

  async function handleGenerate() {
    if (!product) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateContent(product.vector_id, product.sku);
      onContentGenerated(result.sections, result.section_keys, result.product_summary, result.product_image_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <button className={styles.backLink} onClick={onBack}>
          ← Back to Search
        </button>
        <h1 className={styles.title}>Generate Content</h1>
        <p className={styles.subtitle}>
          Claude will generate 9 types of marketing content for this product.
        </p>
      </div>

      <div className={styles.productCard}>
        <div className={styles.productMeta}>
          <span className={styles.productLabel}>Selected product</span>
          <h2 className={styles.productName}>{product.name}</h2>
          <span className={styles.productSku}>{product.sku}</span>
        </div>
      </div>

      <div className={styles.summaryBox}>
        <h3 className={styles.summaryTitle}>Product Data</h3>
        <pre className={styles.summaryText}>{product.summary}</pre>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <span>⚠</span> {error}
        </div>
      )}

      <button
        className={styles.generateBtn}
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            Generating with Claude…
          </>
        ) : (
          "Generate All Content →"
        )}
      </button>

      {loading && (
        <p className={styles.loadingNote}>
          This usually takes 15–30 seconds. Claude is writing 9 sections of content.
        </p>
      )}
    </div>
  );
}
