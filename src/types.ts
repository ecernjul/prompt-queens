/** Represents a single product result from search */
export interface ProductResult {
  id: string;
  score: number;
  sku: string;
  name: string;
  summary: string;
}

/** Generated content sections keyed by section name */
export type Sections = Record<string, string>;

/** The current view / step in the app */
export type ViewKey = "search" | "generate" | "content" | "batch";
