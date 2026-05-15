import { useCallback, useState } from "react";

import { TopBar } from "./components/TopBar/TopBar";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { Breadcrumbs, type BreadcrumbStep } from "./components/ui/Breadcrumbs";
import { LoginGate } from "./auth/LoginGate";
import { isAuthenticated } from "./api/client";

import { SearchView } from "./views/SearchView/SearchView";
import { GenerateView } from "./views/GenerateView/GenerateView";
import { ContentView } from "./views/ContentView/ContentView";
import { BatchView } from "./views/BatchView/BatchView";

import type { ProductResult, Sections, ViewKey } from "./types";
import styles from "./App.module.css";

const SIDEBAR_GROUPS = [
  {
    key: "single",
    label: "Single Product",
    items: [
      { key: "search", label: "Search" },
      { key: "generate", label: "Generate" },
      { key: "content", label: "Content" },
    ],
  },
  {
    key: "batch",
    label: "Batch",
    items: [{ key: "batch", label: "Batch Generate" }],
  },
];

export default function App() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [view, setView] = useState<ViewKey>("search");

  /* -- Selection state ------------------------------------------------- */
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const [sections, setSections] = useState<Sections | null>(null);
  const [sectionKeys, setSectionKeys] = useState<string[]>([]);
  // product_summary is returned by the server after generation (not trusted from client)
  const [serverSummary, setServerSummary] = useState<string>("");
  const [productImageUrls, setProductImageUrls] = useState<string[]>([]);

  /* -- Handlers -------------------------------------------------------- */
  const handleProductSelected = useCallback((p: ProductResult) => {
    setSelectedProduct(p);
    setSections(null);
    setSectionKeys([]);
    setServerSummary("");
    setProductImageUrls([]);
    setView("generate");
  }, []);

  const handleContentGenerated = useCallback(
    (s: Sections, keys: string[], summary: string, imageUrls: string[]) => {
      setSections(s);
      setSectionKeys(keys);
      setServerSummary(summary);
      setProductImageUrls(imageUrls);
      setView("content");
    },
    [],
  );


  /* -- Breadcrumb steps ----------------------------------------------- */
  const steps: BreadcrumbStep[] = [
    { key: "search", label: "Search", current: view === "search", enabled: true },
    {
      key: "generate",
      label: "Generate",
      current: view === "generate",
      enabled: !!selectedProduct,
      hint: "Select a product first",
    },
    {
      key: "content",
      label: "Content",
      current: view === "content",
      enabled: !!sections,
      hint: "Generate content first",
    },
  ];

  if (!authed) {
    return <LoginGate onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className={styles.app}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <TopBar
        wordmark="ubique"
        productName="Prompt Queens"
        trailing={
          view !== "batch" ? (
            <Breadcrumbs steps={steps} onSelect={(k) => setView(k as ViewKey)} />
          ) : undefined
        }
      />
      <div className={styles.body}>
        <Sidebar
          groups={SIDEBAR_GROUPS}
          selectedGroupKey={view === "batch" ? "batch" : "single"}
          selectedItemKey={view}
          onSelect={(_g, item) => {
            if (item) setView(item as ViewKey);
          }}
        />
        <main id="main" className={styles.main} tabIndex={-1}>
          {view === "search" && (
            <SearchView onProductSelected={handleProductSelected} />
          )}
          {view === "generate" && (
            <GenerateView
              product={selectedProduct}
              onContentGenerated={handleContentGenerated}
              onBack={() => setView("search")}
            />
          )}
          {view === "content" && sections && (
            <ContentView
              product={selectedProduct!}
              sections={sections}
              sectionKeys={sectionKeys}
              productSummary={serverSummary}
              productImageUrls={productImageUrls}
              onBack={() => setView("generate")}
            />
          )}
          {view === "batch" && <BatchView />}
        </main>
      </div>
    </div>
  );
}
