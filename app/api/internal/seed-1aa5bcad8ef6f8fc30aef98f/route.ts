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
      const code = clean(item.resourceCode);
      const falseReservedCorrection = code === "C360_B00_M10_L005";
      return code && clean(item.title) && (item.reserved !== true || falseReservedCorrection) && type !== "EMPTY";
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

    let qdrantOverlay = 0;
    const qdrantUrl = (process.env.QDRANT_URL || "").replace(/\/$/, "");
    const qdrantKey = process.env.QDRANT_API_KEY || "";
    const qdrantCollection = process.env.QDRANT_COLLECTION || "campus-paia";

    if (qdrantUrl && qdrantKey) {
      let offset: string | number | null | undefined;
      const overlayRows: Array<{
        resource_code: string;
        has_source_text: boolean;
        platform_url: string;
        private_document_url: string;
        source_url: string;
      }> = [];

      do {
        const response = await fetch(
          `${qdrantUrl}/collections/${encodeURIComponent(qdrantCollection)}/points/scroll`,
          {
            method: "POST",
            headers: {
              "api-key": qdrantKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              limit: 256,
              with_payload: [
                "resource_code",
                "has_source_text",
                "platform_url",
                "private_document_url",
                "source_url",
              ],
              with_vector: false,
              ...(offset !== undefined && offset !== null ? { offset } : {}),
            }),
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(`QDRANT_SCROLL_FAILED:${response.status}`);
        }

        const data = await response.json() as {
          result?: {
            points?: Array<{ payload?: Record<string, unknown> }>;
            next_page_offset?: string | number | null;
          };
        };

        for (const point of data.result?.points ?? []) {
          const payload = point.payload ?? {};
          const code = clean(payload.resource_code);
          if (!code) continue;
          overlayRows.push({
            resource_code: code,
            has_source_text: payload.has_source_text === true,
            platform_url: clean(payload.platform_url),
            private_document_url: clean(payload.private_document_url),
            source_url: clean(payload.source_url),
          });
        }

        offset = data.result?.next_page_offset;
      } while (offset !== undefined && offset !== null);

      for (let start = 0; start < overlayRows.length; start += 500) {
        const batch = overlayRows.slice(start, start + 500);
        await pool.query(
          `
            WITH x AS (
              SELECT *
              FROM jsonb_to_recordset($1::jsonb) AS t(
                resource_code text,
                has_source_text boolean,
                platform_url text,
                private_document_url text,
                source_url text
              )
            )
            UPDATE campus_paia.resources AS r
            SET
              qdrant_status = CASE WHEN x.has_source_text THEN 'indexed_text' ELSE 'indexed_metadata' END,
              source_status = CASE WHEN x.has_source_text THEN 'text_extracted' ELSE 'metadata_only' END,
              platform_url = COALESCE(NULLIF(x.platform_url, ''), r.platform_url),
              private_document_url = COALESCE(NULLIF(x.private_document_url, ''), r.private_document_url),
              source_url = COALESCE(NULLIF(x.source_url, ''), r.source_url),
              last_synced_at = now()
            FROM x
            WHERE r.resource_code = x.resource_code
          `,
          [JSON.stringify(batch)],
        );
      }

      qdrantOverlay = overlayRows.length;
    }

    const count = await pool.query(
      "SELECT count(*)::int AS count FROM campus_paia.resources WHERE reserved = false",
    );
    const statuses = await pool.query(
      `
        SELECT qdrant_status, count(*)::int AS count
        FROM campus_paia.resources
        WHERE reserved = false
        GROUP BY qdrant_status
        ORDER BY qdrant_status
      `,
    );

    return NextResponse.json({
      ok: true,
      synced,
      count: count.rows[0]?.count ?? 0,
      qdrantOverlay,
      statuses: statuses.rows,
    });
  } finally {
    await pool.end();
  }
}
