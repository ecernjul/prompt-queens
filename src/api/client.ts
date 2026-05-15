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
  id: string;
  score: number;
  sku: string;
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
}

export async function generateContent(sku: string): Promise<GenerateResult> {
  // Only the SKU is sent — the server re-fetches product data from Pinecone
  // to prevent prompt injection via client-supplied product_summary.
  const res = await apiFetch("/api/generate", {
    method: "POST",
    body: JSON.stringify({ sku }),
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

export async function runBatch(items: BatchItem[]): Promise<Blob> {
  const res = await apiFetch("/api/batch", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
  return res.blob();
}
