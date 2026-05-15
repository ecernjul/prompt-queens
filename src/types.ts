/** Represents a single product result from search */
export interface ProductResult {
  vector_id: string;  // real Pinecone record ID — used for server-side fetch
  score: number;
  sku: string;        // Product_Code from Salsify metadata — display only
  name: string;
  summary: string;
}

/** Generated content sections keyed by section name */
export type Sections = Record<string, string>;

/** The current view / step in the app */
export type ViewKey = "search" | "generate" | "content" | "batch";
