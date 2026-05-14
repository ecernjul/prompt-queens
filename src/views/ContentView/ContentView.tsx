import { useState } from "react";
import { downloadDoc } from "../../api/client";
import type { ProductResult, Sections } from "../../types";
import styles from "./ContentView.module.css";

interface Props {
  product: ProductResult;
  sections: Sections;
  sectionKeys: string[];
  onBack: () => void;
}

export function ContentView({ product, sections, sectionKeys, onBack }: Props) {
  const [activeKey, setActiveKey] = useState(sectionKeys[0] ?? "");
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await downloadDoc(product.sku, product.name, product.summary, sections);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `content_${product.sku.replace(/\//g, "-")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  }

  const activeText = sections[activeKey] ?? "";

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.headerLeft}>
          <button className={styles.backLink} onClick={onBack}>
            ← Back
          </button>
          <div>
            <h1 className={styles.title}>Generated Content</h1>
            <p className={styles.subtitle}>
              {product.name} — <span className={styles.sku}>{product.sku}</span>
            </p>
          </div>
        </div>
        <button
          className={styles.downloadBtn}
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Downloading…" : "↓ Download Word Doc"}
        </button>
      </div>

      <div className={styles.layout}>
        {/* Tab list */}
        <nav className={styles.tabList} aria-label="Content sections">
          {sectionKeys.map((key) => (
            <button
              key={key}
              className={`${styles.tab} ${activeKey === key ? styles.tabActive : ""}`}
              onClick={() => setActiveKey(key)}
            >
              {key}
            </button>
          ))}
        </nav>

        {/* Content panel */}
        <div className={styles.panel}>
          <h2 className={styles.sectionTitle}>{activeKey}</h2>
          {activeText ? (
            <div className={styles.content}>
              <FormattedContent text={activeText} />
            </div>
          ) : (
            <p className={styles.empty}>No content generated for this section.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Render the section text with basic markdown-like formatting */
function FormattedContent({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className={styles.formatted}>
      {lines.map((line, i) => {
        const trimmed = line.trim();

        if (!trimmed) return <br key={i} />;

        // Bold-only line: **text** or **text:**
        if (/^\*\*(.+?)\*\*:?\s*$/.test(trimmed)) {
          const content = trimmed.replace(/^\*\*(.+?)\*\*:?\s*$/, "$1");
          return <p key={i} className={styles.boldLine}>{content}</p>;
        }

        // Bullet
        if (/^[-•]\s+/.test(trimmed)) {
          const content = trimmed.replace(/^[-•]\s+/, "");
          return (
            <li key={i} className={styles.bullet}>
              <InlineMarkdown text={content} />
            </li>
          );
        }

        // Script cues
        if (/^\[(?:VISUAL|VO)[:\s]/i.test(trimmed)) {
          return <p key={i} className={styles.scriptCue}>{trimmed}</p>;
        }

        // Hashtag line
        if (/^#\w/.test(trimmed)) {
          return <p key={i} className={styles.hashtags}>{trimmed}</p>;
        }

        // Regular paragraph
        return (
          <p key={i} className={styles.para}>
            <InlineMarkdown text={trimmed} />
          </p>
        );
      })}
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Convert **bold** → <strong>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\*\*[^*]+\*\*$/.test(part)) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
