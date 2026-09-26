import { Pool } from "pg";
import type { CorpusResource } from "@/lib/corpus";

type GlobalDb = typeof globalThis & { __campusPaiaPool?: Pool };

export function getPool() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) throw new Error("DATABASE_URL_NOT_CONFIGURED");

  const globalDb = globalThis as GlobalDb;
  if (!globalDb.__campusPaiaPool) {
    globalDb.__campusPaiaPool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return globalDb.__campusPaiaPool;
}

export type CatalogDbRow = {
  resource_code: string;
  project_number: number;
  corpus_name: string;
  formation_name: string | null;
  block_code: string | null;
  block_title: string | null;
  module_code: string | null;
  module_title: string | null;
  resource_type: string | null;
  title: string;
  pulse: string | null;
  platform_url: string | null;
  private_document_url: string | null;
  source_status: string;
  qdrant_status: string;
};

export async function fetchCatalogFromDb() {
  const result = await getPool().query<CatalogDbRow>(`
    SELECT
      resource_code,
      project_number,
      corpus_name,
      formation_name,
      block_code,
      block_title,
      module_code,
      module_title,
      resource_type,
      title,
      pulse,
      platform_url,
      private_document_url,
      source_status,
      qdrant_status
    FROM campus_paia.resources
    WHERE reserved = false
    ORDER BY corpus_name, block_code, module_code, title
  `);
  return result.rows;
}

export async function upsertCorpusResource(
  resource: CorpusResource,
  statuses?: { sourceStatus?: string; qdrantStatus?: string },
) {
  const projectNumber = Number(String(resource.project).replace(/\D/g, ""));
  if (!Number.isInteger(projectNumber) || projectNumber < 14 || projectNumber > 19) {
    throw new Error(`INVALID_PROJECT_NUMBER:${resource.project}`);
  }

  const corpusMap: Record<number, string> = {
    14: "Digital",
    15: "Formateur",
    16: "Python",
    17: "RH",
    18: "Paie",
    19: "Divers",
  };

  await getPool().query(
    `
      INSERT INTO campus_paia.resources (
        resource_code, project_number, corpus_name, formation_name,
        block_code, block_title, module_code, module_title,
        resource_type, title, pulse, subdomain, keywords, regulatory, reserved,
        platform_url, private_document_url, source_url,
        source_status, qdrant_status, source_updated_at, last_synced_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now()
      )
      ON CONFLICT (resource_code) DO UPDATE SET
        project_number = EXCLUDED.project_number,
        corpus_name = EXCLUDED.corpus_name,
        formation_name = EXCLUDED.formation_name,
        block_code = EXCLUDED.block_code,
        block_title = EXCLUDED.block_title,
        module_code = EXCLUDED.module_code,
        module_title = EXCLUDED.module_title,
        resource_type = EXCLUDED.resource_type,
        title = EXCLUDED.title,
        pulse = EXCLUDED.pulse,
        subdomain = EXCLUDED.subdomain,
        keywords = EXCLUDED.keywords,
        regulatory = EXCLUDED.regulatory,
        reserved = EXCLUDED.reserved,
        platform_url = EXCLUDED.platform_url,
        private_document_url = EXCLUDED.private_document_url,
        source_url = EXCLUDED.source_url,
        source_status = EXCLUDED.source_status,
        qdrant_status = EXCLUDED.qdrant_status,
        source_updated_at = EXCLUDED.source_updated_at,
        last_synced_at = now()
    `,
    [
      resource.resourceCode,
      projectNumber,
      corpusMap[projectNumber],
      resource.formation || null,
      resource.blockCode || null,
      resource.blockTitle || null,
      resource.moduleCode || null,
      resource.moduleTitle || null,
      resource.resourceType || null,
      resource.title,
      resource.pulse || null,
      resource.subdomain || null,
      resource.keywords,
      resource.regulatory,
      resource.reserved,
      resource.platformUrl || null,
      resource.privateDocumentUrl || null,
      resource.sourceUrl || null,
      statuses?.sourceStatus || (resource.extractedText ? "text_extracted" : "metadata_only"),
      statuses?.qdrantStatus || (resource.extractedText ? "indexed_text" : "indexed_metadata"),
      resource.updatedAt || null,
    ],
  );

  await upsertResourceTextCache({
    resourceCode: resource.resourceCode,
    fullText: resource.extractedText || "",
    textStatus: resource.extractedText ? "text_extracted" : "metadata_only",
    sourceKind: resource.extractedText ? "index_pipeline" : "metadata",
  });
}


export type ResourceTextCacheRow = {
  resource_code: string;
  full_text: string;
  text_status: string;
  source_kind: string;
  chunk_count: number;
  source_hash: string | null;
  updated_at: string;
};

export async function ensureResourceTextCache() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS campus_paia.resource_text_cache (
      resource_code text PRIMARY KEY REFERENCES campus_paia.resources(resource_code) ON DELETE CASCADE,
      full_text text NOT NULL DEFAULT '',
      text_status text NOT NULL DEFAULT 'metadata_only',
      source_kind text NOT NULL DEFAULT 'unknown',
      chunk_count integer NOT NULL DEFAULT 0,
      source_hash text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await getPool().query(`
    CREATE INDEX IF NOT EXISTS idx_resource_text_cache_status
    ON campus_paia.resource_text_cache(text_status)
  `);
}

export async function upsertResourceTextCache(input: {
  resourceCode: string;
  fullText: string;
  textStatus?: string;
  sourceKind?: string;
  chunkCount?: number;
  sourceHash?: string | null;
}) {
  await ensureResourceTextCache();
  const safeFullText = (input.fullText || "").replace(/\u0000/g, "");
  await getPool().query(
    `
      INSERT INTO campus_paia.resource_text_cache (
        resource_code, full_text, text_status, source_kind, chunk_count, source_hash, updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,now())
      ON CONFLICT (resource_code) DO UPDATE SET
        full_text = EXCLUDED.full_text,
        text_status = EXCLUDED.text_status,
        source_kind = EXCLUDED.source_kind,
        chunk_count = EXCLUDED.chunk_count,
        source_hash = EXCLUDED.source_hash,
        updated_at = now()
    `,
    [
      input.resourceCode,
      safeFullText,
      input.textStatus || (safeFullText ? "text_extracted" : "metadata_only"),
      input.sourceKind || "unknown",
      input.chunkCount || 0,
      input.sourceHash || null,
    ],
  );
}

export async function fetchResourceTextCache(resourceCode: string) {
  await ensureResourceTextCache();
  const result = await getPool().query<ResourceTextCacheRow>(
    `
      SELECT resource_code, full_text, text_status, source_kind, chunk_count, source_hash, updated_at
      FROM campus_paia.resource_text_cache
      WHERE resource_code = $1
      LIMIT 1
    `,
    [resourceCode],
  );
  return result.rows[0] ?? null;
}

export async function fetchResourceByCode(resourceCode: string) {
  const result = await getPool().query(
    `
      SELECT
        resource_code,
        project_number,
        corpus_name,
        formation_name,
        block_code,
        block_title,
        module_code,
        module_title,
        resource_type,
        title,
        pulse,
        subdomain,
        keywords,
        regulatory,
        platform_url,
        private_document_url,
        source_url,
        source_status,
        qdrant_status
      FROM campus_paia.resources
      WHERE resource_code = $1
        AND reserved = false
      LIMIT 1
    `,
    [resourceCode],
  );
  return result.rows[0] ?? null;
}

export async function listIndexedResourceCodes(limit: number, offset: number) {
  const result = await getPool().query<{ resource_code: string }>(
    `
      SELECT resource_code
      FROM campus_paia.resources
      WHERE reserved = false
        AND qdrant_status = 'indexed_text'
      ORDER BY resource_code
      LIMIT $1 OFFSET $2
    `,
    [limit, offset],
  );
  return result.rows.map((row) => row.resource_code);
}

export async function resourceTextCacheStats() {
  await ensureResourceTextCache();
  const result = await getPool().query<{ text_status: string; count: number }>(
    `
      SELECT text_status, count(*)::int AS count
      FROM campus_paia.resource_text_cache
      GROUP BY text_status
      ORDER BY text_status
    `
  );
  return result.rows;
}


export async function listMissingResourceTextCacheCodes(limit = 40) {
  await ensureResourceTextCache();
  const result = await getPool().query<{ resource_code: string }>(
    `
      SELECT r.resource_code
      FROM campus_paia.resources r
      LEFT JOIN campus_paia.resource_text_cache c
        ON c.resource_code = r.resource_code
       AND c.text_status = 'text_extracted'
       AND length(c.full_text) > 0
      WHERE r.reserved = false
        AND r.qdrant_status = 'indexed_text'
        AND c.resource_code IS NULL
      ORDER BY r.resource_code
      LIMIT $1
    `,
    [limit],
  );
  return result.rows.map((row) => row.resource_code);
}

export async function countMissingResourceTextCache() {
  await ensureResourceTextCache();
  const result = await getPool().query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM campus_paia.resources r
      LEFT JOIN campus_paia.resource_text_cache c
        ON c.resource_code = r.resource_code
       AND c.text_status = 'text_extracted'
       AND length(c.full_text) > 0
      WHERE r.reserved = false
        AND r.qdrant_status = 'indexed_text'
        AND c.resource_code IS NULL
    `
  );
  return result.rows[0]?.count ?? 0;
}
