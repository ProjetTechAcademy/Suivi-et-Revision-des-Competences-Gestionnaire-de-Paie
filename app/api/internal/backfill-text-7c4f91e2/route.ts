import { NextResponse } from "next/server";
import {
  countMissingResourceTextCache,
  listMissingResourceTextCacheCodes,
  resourceTextCacheStats,
  upsertResourceTextCache,
} from "@/lib/db";
import { reconstructQdrantResourceText } from "@/lib/qdrant";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const before = await countMissingResourceTextCache();
  const codes = await listMissingResourceTextCacheCodes(40);
  let stored = 0;
  const failures: Array<{ code: string; error: string }> = [];

  for (let start = 0; start < codes.length; start += 4) {
    const batch = codes.slice(start, start + 4);
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
    before,
    attempted: codes.length,
    stored,
    failures,
    remaining: await countMissingResourceTextCache(),
    stats: await resourceTextCacheStats(),
  });
}
