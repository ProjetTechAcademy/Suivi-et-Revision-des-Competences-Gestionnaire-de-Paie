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

export async function ensureResourceTextSlices() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS campus_paia.resource_text_slices (
      resource_code text NOT NULL REFERENCES campus_paia.resources(resource_code) ON DELETE CASCADE,
      slice_index integer NOT NULL,
      char_start integer NOT NULL,
      char_end integer NOT NULL,
      slice_chars integer NOT NULL,
      slice_text text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (resource_code, slice_index)
    )
  `);
  await getPool().query(`
    CREATE INDEX IF NOT EXISTS idx_resource_text_slices_resource
    ON campus_paia.resource_text_slices(resource_code, slice_index)
  `);
}

async function clearDerivedResourceAnalysis(resourceCode: string) {
  const tables = [
    "resource_revision_parts",
    "resource_analysis_groups",
    "resource_slice_analysis",
  ] as const;

  for (const table of tables) {
    try {
      await getPool().query(
        `DELETE FROM campus_paia.${table} WHERE resource_code = $1`,
        [resourceCode],
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "42P01") throw error;
    }
  }
}

async function clearAllDerivedResourceAnalysis() {
  const tables = [
    "resource_revision_parts",
    "resource_analysis_groups",
    "resource_slice_analysis",
  ] as const;

  for (const table of tables) {
    try {
      await getPool().query(`TRUNCATE TABLE campus_paia.${table}`);
    } catch (error) {
      if ((error as { code?: string }).code !== "42P01") throw error;
    }
  }
}

export async function rebuildResourceTextSlices(resourceCode: string) {
  await ensureResourceTextSlices();
  await clearDerivedResourceAnalysis(resourceCode);
  await getPool().query(
    `DELETE FROM campus_paia.resource_text_slices WHERE resource_code = $1`,
    [resourceCode],
  );

  const result = await getPool().query<{ count: number }>(
    `
      WITH source AS (
        SELECT resource_code, full_text, length(full_text) AS total_chars
        FROM campus_paia.resource_text_cache
        WHERE resource_code = $1
          AND text_status = 'text_extracted'
          AND length(full_text) > 0
      ),
      starts AS (
        SELECT
          source.resource_code,
          source.full_text,
          source.total_chars,
          gs AS slice_index,
          1 + ((gs - 1) * 4000) AS char_start
        FROM source
        CROSS JOIN LATERAL generate_series(
          1,
          GREATEST(1, CEIL((source.total_chars - 500)::numeric / 4000)::int)
        ) AS gs
      ),
      inserted AS (
        INSERT INTO campus_paia.resource_text_slices (
          resource_code, slice_index, char_start, char_end, slice_chars, slice_text
        )
        SELECT
          resource_code,
          slice_index,
          char_start,
          LEAST(total_chars, char_start + 4499),
          length(substring(full_text FROM char_start FOR 4500)),
          substring(full_text FROM char_start FOR 4500)
        FROM starts
        RETURNING 1
      )
      SELECT count(*)::int AS count FROM inserted
    `,
    [resourceCode],
  );

  return result.rows[0]?.count ?? 0;
}

export async function rebuildAllResourceTextSlices() {
  await ensureResourceTextSlices();
  await clearAllDerivedResourceAnalysis();
  await getPool().query(`TRUNCATE TABLE campus_paia.resource_text_slices`);

  const result = await getPool().query<{ resources: number; slices: number }>(`
    WITH source AS (
      SELECT resource_code, full_text, length(full_text) AS total_chars
      FROM campus_paia.resource_text_cache
      WHERE text_status = 'text_extracted'
        AND length(full_text) > 0
    ),
    starts AS (
      SELECT
        source.resource_code,
        source.full_text,
        source.total_chars,
        gs AS slice_index,
        1 + ((gs - 1) * 4000) AS char_start
      FROM source
      CROSS JOIN LATERAL generate_series(
        1,
        GREATEST(1, CEIL((source.total_chars - 500)::numeric / 4000)::int)
      ) AS gs
    ),
    inserted AS (
      INSERT INTO campus_paia.resource_text_slices (
        resource_code, slice_index, char_start, char_end, slice_chars, slice_text
      )
      SELECT
        resource_code,
        slice_index,
        char_start,
        LEAST(total_chars, char_start + 4499),
        length(substring(full_text FROM char_start FOR 4500)),
        substring(full_text FROM char_start FOR 4500)
      FROM starts
      RETURNING resource_code
    )
    SELECT
      count(DISTINCT resource_code)::int AS resources,
      count(*)::int AS slices
    FROM inserted
  `);

  return result.rows[0] ?? { resources: 0, slices: 0 };
}

export async function resourceTextSliceStats() {
  await ensureResourceTextSlices();
  const result = await getPool().query<{
    resources: number;
    slices: number;
    min_slices: number;
    max_slices: number;
    avg_slices: string;
  }>(`
    WITH per_resource AS (
      SELECT resource_code, count(*)::int AS slice_count
      FROM campus_paia.resource_text_slices
      GROUP BY resource_code
    )
    SELECT
      count(*)::int AS resources,
      COALESCE(sum(slice_count), 0)::int AS slices,
      COALESCE(min(slice_count), 0)::int AS min_slices,
      COALESCE(max(slice_count), 0)::int AS max_slices,
      COALESCE(round(avg(slice_count)::numeric, 2), 0)::text AS avg_slices
    FROM per_resource
  `);
  return result.rows[0];
}

export type ResourceSliceRow = {
  resource_code: string;
  slice_index: number;
  char_start: number;
  char_end: number;
  slice_chars: number;
  slice_text: string;
};

export async function fetchResourceTextSlices(resourceCode: string) {
  await ensureResourceTextSlices();
  const result = await getPool().query<ResourceSliceRow>(
    `
      SELECT resource_code, slice_index, char_start, char_end, slice_chars, slice_text
      FROM campus_paia.resource_text_slices
      WHERE resource_code = $1
      ORDER BY slice_index
    `,
    [resourceCode],
  );
  return result.rows;
}

export async function ensureResourceSliceAnalysis() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS campus_paia.resource_slice_analysis (
      resource_code text NOT NULL,
      slice_index integer NOT NULL,
      analysis_text text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      analyzed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (resource_code, slice_index),
      FOREIGN KEY (resource_code, slice_index)
        REFERENCES campus_paia.resource_text_slices(resource_code, slice_index)
        ON DELETE CASCADE
    )
  `);
  await getPool().query(`
    CREATE INDEX IF NOT EXISTS idx_resource_slice_analysis_status
    ON campus_paia.resource_slice_analysis(resource_code, status, slice_index)
  `);
}

export async function prepareResourceSliceAnalysis(resourceCode: string) {
  await ensureResourceSliceAnalysis();
  await getPool().query(
    `
      INSERT INTO campus_paia.resource_slice_analysis (resource_code, slice_index, status)
      SELECT s.resource_code, s.slice_index, 'pending'
      FROM campus_paia.resource_text_slices s
      WHERE s.resource_code = $1
      ON CONFLICT (resource_code, slice_index) DO NOTHING
    `,
    [resourceCode],
  );
}

export async function fetchNextPendingSlice(resourceCode: string) {
  await prepareResourceSliceAnalysis(resourceCode);
  const result = await getPool().query<ResourceSliceRow>(
    `
      SELECT s.resource_code, s.slice_index, s.char_start, s.char_end, s.slice_chars, s.slice_text
      FROM campus_paia.resource_text_slices s
      JOIN campus_paia.resource_slice_analysis a
        ON a.resource_code = s.resource_code
       AND a.slice_index = s.slice_index
      WHERE s.resource_code = $1
        AND a.status IN ('pending','error')
        AND a.attempts < 8
      ORDER BY s.slice_index
      LIMIT 1
    `,
    [resourceCode],
  );
  return result.rows[0] ?? null;
}

export async function markSliceAnalysisProcessing(resourceCode: string, sliceIndex: number) {
  await ensureResourceSliceAnalysis();
  await getPool().query(
    `
      UPDATE campus_paia.resource_slice_analysis
      SET status = 'processing', attempts = attempts + 1, last_error = NULL, updated_at = now()
      WHERE resource_code = $1 AND slice_index = $2
    `,
    [resourceCode, sliceIndex],
  );
}

export async function saveSliceAnalysis(resourceCode: string, sliceIndex: number, analysisText: string) {
  await ensureResourceSliceAnalysis();
  await getPool().query(
    `
      UPDATE campus_paia.resource_slice_analysis
      SET analysis_text = $3, status = 'done', last_error = NULL, analyzed_at = now(), updated_at = now()
      WHERE resource_code = $1 AND slice_index = $2
    `,
    [resourceCode, sliceIndex, analysisText.replace(/\u0000/g, "")],
  );
}

export async function failSliceAnalysis(resourceCode: string, sliceIndex: number, error: string) {
  await ensureResourceSliceAnalysis();
  await getPool().query(
    `
      UPDATE campus_paia.resource_slice_analysis
      SET status = 'error', last_error = $3, updated_at = now()
      WHERE resource_code = $1 AND slice_index = $2
    `,
    [resourceCode, sliceIndex, error.slice(0, 1000)],
  );
}

export async function resetEmptySliceAnalyses(resourceCode: string) {
  await ensureResourceSliceAnalysis();
  await getPool().query(
    `
      UPDATE campus_paia.resource_slice_analysis
      SET status = 'pending', analysis_text = '', last_error = NULL, updated_at = now()
      WHERE resource_code = $1
        AND status = 'done'
        AND length(btrim(analysis_text)) = 0
    `,
    [resourceCode],
  );
}

export async function resourceSliceAnalysisStatus(resourceCode: string) {
  await prepareResourceSliceAnalysis(resourceCode);
  const result = await getPool().query<{
    total: number;
    done: number;
    pending: number;
    processing: number;
    error: number;
  }>(
    `
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'done')::int AS done,
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'processing')::int AS processing,
        count(*) FILTER (WHERE status = 'error')::int AS error
      FROM campus_paia.resource_slice_analysis
      WHERE resource_code = $1
    `,
    [resourceCode],
  );
  return result.rows[0] ?? { total: 0, done: 0, pending: 0, processing: 0, error: 0 };
}

export async function fetchCompletedSliceAnalyses(resourceCode: string) {
  await ensureResourceSliceAnalysis();
  const result = await getPool().query<{ slice_index: number; analysis_text: string }>(
    `
      SELECT slice_index, analysis_text
      FROM campus_paia.resource_slice_analysis
      WHERE resource_code = $1 AND status = 'done'
      ORDER BY slice_index
    `,
    [resourceCode],
  );
  return result.rows;
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

  await rebuildResourceTextSlices(input.resourceCode);
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
