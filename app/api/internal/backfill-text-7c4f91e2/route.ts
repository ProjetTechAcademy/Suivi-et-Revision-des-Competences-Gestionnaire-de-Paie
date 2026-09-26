import { NextRequest, NextResponse } from "next/server";
import { listIndexedResourceCodes, resourceTextCacheStats, upsertResourceTextCache } from "@/lib/db";
import { reconstructQdrantResourceText } from "@/lib/qdrant";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const requested = Math.max(1, Number(url.searchParams.get("limit") || 80));
  const limit = Math.min(120, requested);
  const codes = await listIndexedResourceCodes(limit, offset);
  let stored = 0;
  const failures: Array<{ code: string; error: string }> = [];

  for (let start = 0; start < codes.length; start += 8) {
    const batch = codes.slice(start, start + 8);
    await Promise.all(batch.map(async (resourceCode) => {
      try {
        const rebuilt = await reconstructQdrantResourceText(resourceCode);
        await upsertResourceTextCache({
          resourceCode,
          fullText: rebuilt.text,
          textStatus: rebuilt.text ? "text_extracted" : "metadata_only",
          sourceKind: "qdrant_backfill",
          chunkCount: rebuilt.chunkCount,
        });
        if (rebuilt.text) stored += 1;
      } catch (error) {
        failures.push({
          code: resourceCode,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }));
  }

  return NextResponse.json({
    offset,
    requested: codes.length,
    stored,
    failures,
    nextOffset: codes.length ? offset + codes.length : null,
    stats: await resourceTextCacheStats(),
  });
}
