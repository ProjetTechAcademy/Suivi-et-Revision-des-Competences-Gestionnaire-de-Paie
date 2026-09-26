import { NextRequest, NextResponse } from "next/server";
import {
  countMissingResourceTextCache,
  listMissingResourceTextCacheCodes,
  resourceTextCacheStats,
  upsertResourceTextCache,
} from "@/lib/db";
import { getQdrantResourceChunks } from "@/lib/qdrant";

export const runtime = "nodejs";
export const maxDuration = 300;

function mergeOverlappingChunks(parts: string[]) {
  const chunks = parts.map((item) => item.trim()).filter(Boolean);
  if (!chunks.length) return "";
  let merged = chunks[0];

  for (let i = 1; i < chunks.length; i += 1) {
    const next = chunks[i];
    const maxOverlap = Math.min(900, merged.length, next.length);
    let overlap = 0;

    for (let size = maxOverlap; size >= 40; size -= 1) {
      if (merged.slice(-size) === next.slice(0, size)) {
        overlap = size;
        break;
      }
    }

    merged += overlap ? next.slice(overlap) : `\n\n${next}`;
  }

  const marker = "Contenu indexable:";
  const markerIndex = merged.indexOf(marker);
  return (markerIndex >= 0 ? merged.slice(markerIndex + marker.length) : merged)
    .replace(/\u0000/g, "")
    .trim();
}

export async function POST(request: NextRequest) {
  const expected = process.env.CAMPUS_SYNC_SECRET || "";
  const supplied = request.headers.get("x-campus-sync-secret") || "";
  if (!expected || supplied !== expected) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { limit?: number };
  const limit = Math.max(1, Math.min(Number(body.limit) || 40, 80));
  const codes = await listMissingResourceTextCacheCodes(limit);
  const results: Array<{ code: string; ok: boolean; chars?: number; chunks?: number; error?: string }> = [];

  for (const code of codes) {
    try {
      const hits = await getQdrantResourceChunks(code, 250);
      const parts = hits.map((hit) => String(hit.payload?.content ?? "")).filter(Boolean);
      const fullText = mergeOverlappingChunks(parts);

      if (!fullText) {
        results.push({ code, ok: false, error: "Aucun texte reconstruit" });
        continue;
      }

      await upsertResourceTextCache({
        resourceCode: code,
        fullText,
        textStatus: "text_extracted",
        sourceKind: "qdrant_backfill",
        chunkCount: parts.length,
      });

      results.push({ code, ok: true, chars: fullText.length, chunks: parts.length });
    } catch (error) {
      results.push({
        code,
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 160) : "Erreur inconnue",
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    success: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    remaining: await countMissingResourceTextCache(),
    stats: await resourceTextCacheStats(),
    results,
  });
}
