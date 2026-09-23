import type { NextRequest } from "next/server";
import { isCampusSyncAuthorized } from "@/lib/campus-auth";

export function controllerConfiguration(request: NextRequest) {
  const qdrantUrl = process.env.QDRANT_URL || "";
  const qdrantApiKey = process.env.QDRANT_API_KEY || "";
  const groqApiKey = process.env.GROQ_API_KEY || "";
  const syncSecret = process.env.CAMPUS_SYNC_SECRET || "";
  return {
    qdrantUrl,
    qdrantApiKey,
    groqApiKey,
    syncSecret,
    configured: Boolean(qdrantUrl && qdrantApiKey && groqApiKey && syncSecret),
    authorized: Boolean(syncSecret && isCampusSyncAuthorized(request, syncSecret)),
  };
}

export function safeLegacyFilename(key: string) {
  const filename = key.split(/[\\/]/).pop()?.trim() || "document.txt";
  return filename.replace(/[^\p{L}\p{N}._() -]/gu, "_").slice(0, 180) || "document.txt";
}
