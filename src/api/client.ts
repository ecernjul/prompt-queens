/**
 * API client — thin wrappers around fetch that inject Basic Auth.
 * Credentials are stored in sessionStorage after login.
 */

const BASE = import.meta.env.PROD ? "" : "http://localhost:8000";

function getCredentials(): string {
  const creds = sessionStorage.getItem("pq_creds");
  if (!creds) throw new Error("Not authenticated");
  return creds;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${getCredentials()}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? res.statusText);
  }
  return res;
}

/** Store credentials and verify with server */
export async function login(username: string, password: string): Promise<void> {
  const encoded = btoa(`${username}:${password}`);
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(body.detail ?? "Login failed");
  }
  sessionStorage.setItem("pq_creds", encoded);
}

export function logout(): void {
  sessionStorage.removeItem("pq_creds");
}

export function isAuthenticated(): boolean {
  return !!sessionStorage.getItem("pq_creds");
}

export interface SearchResult {
  vector_id: string;   // real Pinecone record ID — used for server-side fetch
  score: number;
  sku: string;         // Product_Code from metadata — display / label only
  name: string;
  summary: string;
}

export async function searchProducts(
  query: string,
  skuMode: boolean,
  topK: number,
): Promise<SearchResult[]> {
  const res = await apiFetch("/api/search", {
    method: "POST",
    body: JSON.stringify({ query, sku_mode: skuMode, top_k: topK }),
  });
  const data = await res.json();
  return data.results;
}

export interface GenerateResult {
  sections: Record<string, string>;
  section_keys: string[];
  product_summary: string;
  product_name: string;
  product_image_urls: string[];  // [] if not found in metadata
}

export async function generateContent(vectorId: string, sku: string): Promise<GenerateResult> {
  // vector_id is the real Pinecone record ID used to fetch product data server-side.
  // sku is kept for display/logging. Neither is trusted for content — server fetches fresh.
  const res = await apiFetch("/api/generate", {
    method: "POST",
    body: JSON.stringify({ vector_id: vectorId, sku }),
  });
  return res.json();
}

export async function downloadDoc(
  sku: string,
  name: string,
  productSummary: string,
  sections: Record<string, string>,
): Promise<Blob> {
  const res = await apiFetch("/api/download-doc", {
    method: "POST",
    body: JSON.stringify({ sku, name, product_summary: productSummary, sections }),
  });
  return res.blob();
}

export interface BatchItem {
  query: string;
  sku_mode: boolean;
}

export async function generateImage(
  conceptTitle: string,
  conceptDescription: string,
  productName: string,
  productImageUrl: string = "",   // the selected image URL (or "" for text-only)
): Promise<string> {
  const res = await apiFetch("/api/generate-image", {
    method: "POST",
    body: JSON.stringify({
      concept_title: conceptTitle,
      concept_description: conceptDescription,
      product_name: productName,
      product_image_url: productImageUrl,
    }),
  });
  const data = await res.json();
  return data.image_url as string;
}

export async function runBatch(items: BatchItem[]): Promise<Blob> {
  const res = await apiFetch("/api/batch", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  return res.blob();
}
