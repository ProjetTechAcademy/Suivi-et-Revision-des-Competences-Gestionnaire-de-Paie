import { Pool } from "pg";
import type { CorpusResource } from "@/lib/corpus";

type GlobalDb = typeof globalThis & { __campusPaiaPool?: Pool };

function getPool() {
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
}
