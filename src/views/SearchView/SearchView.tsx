import { useState, type FormEvent } from "react";
import { searchProducts, type SearchResult } from "../../api/client";
import type { ProductResult } from "../../types";
import styles from "./SearchView.module.css";

interface Props {
  onProductSelected: (p: ProductResult) => void;
}

export function SearchView({ onProductSelected }: Props) {
  const [query, setQuery] = useState("");
  const [skuMode, setSkuMode] = useState(false);
  const [topK, setTopK] = useState(3);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await searchProducts(query.trim(), skuMode, skuMode ? 1 : topK);
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Search Catalog</h1>
        <p className={styles.subtitle}>
          Find a product by natural language or exact SKU, then generate content.
        </p>
      </div>

      <form onSubmit={handleSearch} className={styles.form}>
        <div className={styles.inputRow}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={skuMode ? 'Enter SKU, e.g. XU-CH-10110-GG' : 'e.g. "folding chair", "blue bar stool"'}
            className={styles.input}
            required
          />
          <button type="submit" className={styles.searchBtn} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        <div className={styles.controls}>
          <label className={styles.modeToggle}>
            <input
              type="checkbox"
              checked={skuMode}
              onChange={(e) => setSkuMode(e.target.checked)}
              className={styles.checkbox}
            />
            <span>Exact SKU match</span>
          </label>

          {!skuMode && (
            <label className={styles.sliderLabel}>
              Results: <strong>{topK}</strong>
              <input
                type="range"
                min={1}
                max={10}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className={styles.slider}
              />
            </label>
          )}
        </div>
      </form>

      {error && (
        <div className={styles.errorBanner}>
          <span>⚠</span> {error}
        </div>
      )}

      {results !== null && results.length === 0 && (
        <div className={styles.emptyBanner}>
          {skuMode
            ? `No product found for SKU "${query}". Check the SKU and try again.`
            : "No results found. Try a different search term."}
        </div>
      )}

      {results && results.length > 0 && (
        <div className={styles.results}>
          <p className={styles.resultsLabel}>
            <strong>{results.length} result{results.length !== 1 ? "s" : ""}</strong> — select a product to generate content
          </p>
          <div className={styles.cards}>
            {results.map((r) => (
              <div key={r.vector_id} className={styles.card}>
                <div className={styles.cardBody}>
                  <p className={styles.cardName}>{r.name}</p>
                  <p className={styles.cardMeta}>
                    <span className={styles.sku}>{r.sku}</span>
                    <span className={styles.score}>{r.score.toFixed(4)}</span>
                  </p>
                </div>
                <button
                  className={styles.selectBtn}
                  onClick={() => onProductSelected(r)}
                >
                  Select →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
