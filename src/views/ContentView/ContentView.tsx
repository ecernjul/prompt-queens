import { useState } from "react";
import { downloadDoc, generateImage } from "../../api/client";
import type { ProductResult, Sections } from "../../types";
import styles from "./ContentView.module.css";

interface Props {
  product: ProductResult;
  sections: Sections;
  sectionKeys: string[];
  productSummary: string;
  onBack: () => void;
}

export function ContentView({ product, sections, sectionKeys, productSummary, onBack }: Props) {
  const [activeKey, setActiveKey] = useState(sectionKeys[0] ?? "");
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await downloadDoc(product.sku, product.name, productSummary, sections);
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

  const isCreativeBrief = activeKey === "Creative Brief";
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
            isCreativeBrief ? (
              <CreativeBriefPanel
                text={activeText}
                productName={product.name}
              />
            ) : (
              <div className={styles.content}>
                <FormattedContent text={activeText} />
              </div>
            )
          ) : (
            <p className={styles.empty}>No content generated for this section.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Creative Brief panel with per-concept image generation ────────────────────

interface Concept {
  number: number;
  title: string;
  description: string;
}

function parseConcepts(text: string): Concept[] {
  const concepts: Concept[] = [];
  // Match **Concept N: Title** (bold) or plain "Concept N: Title"
  const pattern = /\*{0,2}Concept\s+(\d+)[:\s–-]+([^\n*]+)\*{0,2}([\s\S]*?)(?=\*{0,2}Concept\s+\d+|$)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const number = parseInt(match[1], 10);
    const title = match[2].trim();
    const description = match[3].trim();
    if (title) {
      concepts.push({ number, title, description });
    }
  }
  return concepts;
}

interface ConceptCardProps {
  concept: Concept;
  productName: string;
}

function ConceptCard({ concept, productName }: ConceptCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const url = await generateImage(
        concept.title,
        concept.description,
        productName,
      );
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image generation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadImage() {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `concept-${concept.number}-${concept.title.toLowerCase().replace(/\s+/g, "-")}.jpg`;
    a.target = "_blank";
    a.click();
  }

  return (
    <div className={styles.conceptCard}>
      <div className={styles.conceptHeader}>
        <div>
          <span className={styles.conceptNumber}>Concept {concept.number}</span>
          <h3 className={styles.conceptTitle}>{concept.title}</h3>
        </div>
        <button
          className={styles.generateImageBtn}
          onClick={handleGenerate}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Generating…
            </>
          ) : imageUrl ? (
            "Regenerate Image"
          ) : (
            "✦ Generate Image"
          )}
        </button>
      </div>

      <p className={styles.conceptDescription}>{concept.description}</p>

      {error && (
        <div className={styles.imageError}>⚠ {error}</div>
      )}

      {loading && (
        <div className={styles.imagePlaceholder}>
          <span className={styles.loadingDots}>Generating with Higgsfield<span>.</span><span>.</span><span>.</span></span>
          <p className={styles.loadingNote}>This typically takes 15–40 seconds</p>
        </div>
      )}

      {imageUrl && !loading && (
        <div className={styles.imageResult}>
          <img
            src={imageUrl}
            alt={`Generated image for ${concept.title}`}
            className={styles.generatedImage}
          />
          <button className={styles.downloadImageBtn} onClick={handleDownloadImage}>
            ↓ Download Image
          </button>
        </div>
      )}
    </div>
  );
}

interface CreativeBriefPanelProps {
  text: string;
  productName: string;
}

function CreativeBriefPanel({ text, productName }: CreativeBriefPanelProps) {
  const concepts = parseConcepts(text);

  if (concepts.length === 0) {
    // Fallback: render as plain text if parsing fails
    return (
      <div className={styles.content}>
        <FormattedContent text={text} />
      </div>
    );
  }

  return (
    <div className={styles.conceptList}>
      {concepts.map((concept) => (
        <ConceptCard
          key={concept.number}
          concept={concept}
          productName={productName}
        />
      ))}
    </div>
  );
}

// ── Generic formatted content renderer ───────────────────────────────────────

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
