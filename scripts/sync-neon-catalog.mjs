import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || "";

if (!connectionString) {
  console.log("[neon-sync] DATABASE_URL absente — synchronisation ignorée.");
  process.exit(0);
}

const raw = await readFile(new URL("../data/catalogue-snapshot.json", import.meta.url), "utf8");
const snapshot = JSON.parse(raw);

const corpusMap = {
  14: "Digital",
  15: "Formateur",
  16: "Python",
  17: "RH",
  18: "Paie",
  19: "Divers",
};

const clean = (value) => typeof value === "string" ? value.trim() : "";
const realResources = snapshot.filter((item) => {
  const type = clean(item.resourceType).toUpperCase();
  return clean(item.resourceCode) && clean(item.title) && !item.reserved && type !== "EMPTY";
});

const rows = realResources.map((item) => {
  const projectNumber = Number(String(item.project ?? "").replace(/\D/g, ""));
  if (!corpusMap[projectNumber]) {
    throw new Error(`Projet invalide pour ${item.resourceCode}: ${item.project}`);
  }

  return [
    clean(item.resourceCode),
    projectNumber,
    corpusMap[projectNumber],
    clean(item.formation) || null,
    clean(item.blockCode) || null,
    clean(item.blockTitle) || null,
    clean(item.moduleCode) || null,
    clean(item.moduleTitle) || null,
    clean(item.resourceType) || null,
    clean(item.title),
    clean(item.pulse) || null,
    clean(item.subdomain) || null,
    Array.isArray(item.keywords) ? item.keywords.map(clean).filter(Boolean) : [],
    item.regulatory === true,
    false,
    clean(item.platformUrl) || null,
    clean(item.privateDocumentUrl) || null,
    clean(item.sourceUrl) || null,
    (clean(item.privateDocumentUrl) || clean(item.sourceUrl)) ? "metadata_only" : "unknown",
    "not_indexed",
    clean(item.updatedAt) || null,
  ];
});

const pool = new Pool({
  connectionString,
  max: 1,
  idleTimeoutMillis: 5_000,
  connectionTimeoutMillis: 10_000,
});

const columns = [
  "resource_code", "project_number", "corpus_name", "formation_name",
  "block_code", "block_title", "module_code", "module_title",
  "resource_type", "title", "pulse", "subdomain", "keywords",
  "regulatory", "reserved", "platform_url", "private_document_url",
  "source_url", "source_status", "qdrant_status", "source_updated_at",
];

const batchSize = 100;
let synced = 0;

try {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const values = [];
    const placeholders = batch.map((row, rowIndex) => {
      const base = rowIndex * columns.length;
      values.push(...row);
      return "(" + row.map((_, colIndex) => "$" + (base + colIndex + 1)).join(",") + ")";
    });

    await pool.query(
      `
        INSERT INTO campus_paia.resources (${columns.join(",")})
        VALUES ${placeholders.join(",")}
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
          source_updated_at = EXCLUDED.source_updated_at,
          last_synced_at = now()
      `,
      values,
    );

    synced += batch.length;
  }

  const countResult = await pool.query(
    "SELECT count(*)::int AS count FROM campus_paia.resources WHERE reserved = false",
  );
  console.log(`[neon-sync] ${synced} ressources synchronisées ; ${countResult.rows[0]?.count ?? 0} présentes dans Neon.`);
} finally {
  await pool.end();
}
