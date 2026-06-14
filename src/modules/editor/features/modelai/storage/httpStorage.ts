// @ts-nocheck
import type { IStorage } from "@modelai/core/storage";
import { Logger } from "@modelai/core";

/**
 * Remote {@link IStorage} backed by HTTP (REST-shaped URLs).
 *
 * URL layout (relative to {@link baseUrl}):
 * - GET    `${base}/documents/${database}/${table}/${id}`
 * - PUT    same body JSON
 * - DELETE same
 * - GET    `${base}/documents/${database}/${table}?page=&limit=`
 *
 * Configure via constructor or `import.meta.env.VITE_MODELAI_STORAGE_API_BASE`.
 */
export class HttpStorage implements IStorage {
  readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = (
      baseUrl ??
      import.meta.env.VITE_MODELAI_STORAGE_API_BASE ??
      "https://api.example.com/modelai-storage"
    ).replace(/\/$/, "");
  }

  async createDBIfNeeded(_database: string, _tables: string[]): Promise<void> {
    // Server-managed; optional health check could go here.
  }

  private resourceUrl(database: string, table: string, id: string) {
    return `${this.baseUrl}/documents/${encodeURIComponent(database)}/${encodeURIComponent(table)}/${encodeURIComponent(id)}`;
  }

  private collectionUrl(
    database: string,
    table: string,
    query: URLSearchParams
  ) {
    const qs = query.toString();
    return `${this.baseUrl}/documents/${encodeURIComponent(database)}/${encodeURIComponent(table)}${qs ? `?${qs}` : ""}`;
  }

  async get(database: string, table: string, id: string): Promise<any> {
    const url = this.resourceUrl(database, table, id);
    const res = await fetch(url, { method: "GET", headers: acceptJson });
    if (!res.ok) {
      Logger.warn(`HttpStorage get failed: ${res.status} ${url}`);
      throw new Error(`HttpStorage get ${res.status}`);
    }
    return res.json();
  }

  async put(
    database: string,
    table: string,
    id: string,
    value: any
  ): Promise<boolean> {
    const url = this.resourceUrl(database, table, id);
    const res = await fetch(url, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(value ?? null)
    });
    if (!res.ok) {
      Logger.warn(`HttpStorage put failed: ${res.status} ${url}`);
      throw new Error(`HttpStorage put ${res.status}`);
    }
    return true;
  }

  async delete(database: string, table: string, id: string): Promise<boolean> {
    const url = this.resourceUrl(database, table, id);
    const res = await fetch(url, { method: "DELETE", headers: acceptJson });
    if (!res.ok) {
      Logger.warn(`HttpStorage delete failed: ${res.status} ${url}`);
      throw new Error(`HttpStorage delete ${res.status}`);
    }
    return true;
  }

  async page(database: string, table: string, page: number): Promise<any[]> {
    const limit = 20;
    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    });
    const url = this.collectionUrl(database, table, query);
    const res = await fetch(url, { method: "GET", headers: acceptJson });
    if (!res.ok) {
      Logger.warn(`HttpStorage page failed: ${res.status} ${url}`);
      throw new Error(`HttpStorage page ${res.status}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }
}

const acceptJson = { Accept: "application/json" } as const;
const jsonHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json"
} as const;
