import { NextResponse } from "next/server";
import { Pool } from "pg";
import snapshotJson from "@/data/catalogue-snapshot.json";

export const runtime = "nodejs";
export const maxDuration = 300;
export const preferredRegion = "fra1";

const corpusMap: Record<number, string> = {
  14: "Digital",
  15: "Formateur",
  16: "Python",
  17: "RH",
  18: "Paie",
  19: "Divers",
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function GET() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) {
    return NextResponse.json({ error: "DATABASE_URL absente" }, { status: 503 });
  }

  const snapshot = snapshotJson as Array<Record<string, unknown>>;
  const rows = snapshot
    .filter((item) => {
      const type = clean(item.resourceType).toUpperCase();
      return clean(item.resourceCode) && clean(item.title) && item.reserved !== true && type !== "EMPTY";
    })
    .map((item) => {
      const projectNumber = Number(String(item.project ?? "").replace(/\D/g, ""));
      if (!corpusMap[projectNumber]) {
        throw new Error(`Projet invalide: ${String(item.project)} / ${clean(item.resourceCode)}`);
      }
      const keywords = Array.isArray(item.keywords)
        ? item.keywords.map(clean).filter(Boolean)
        : [];

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
        keywords,
        item.regulatory === true,
        false,
        clean(item.platformUrl) || null,
        clean(item.privateDocumentUrl) || null,
        clean(item.sourceUrl) || null,
        (clean(item.privateDocumentUrl) || clean(item.sourceUrl)) ? "metadata_only" : "unknown",
        "not_indexed",
        null,
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

  let synced = 0;

  try {
    for (let start = 0; start < rows.length; start += 100) {
      const batch = rows.slice(start, start + 100);
      const values: unknown[] = [];
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
            last_synced_at = now()
        `,
        values,
      );

      synced += batch.length;
    }

    const count = await pool.query("SELECT count(*)::int AS count FROM campus_paia.resources WHERE reserved = false");
    return NextResponse.json({
      ok: true,
      synced,
      count: count.rows[0]?.count ?? 0,
    });
  } finally {
    await pool.end();
  }
}
