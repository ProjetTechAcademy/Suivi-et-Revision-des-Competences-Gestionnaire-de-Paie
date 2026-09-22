import type { NextRequest } from "next/server";
import { isCampusSyncAuthorized } from "@/lib/campus-auth";

export function controllerConfiguration(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID || "";
  const syncSecret = process.env.CAMPUS_SYNC_SECRET || "";
  return {
    apiKey,
    vectorStoreId,
    syncSecret,
    configured: Boolean(apiKey && vectorStoreId && syncSecret),
    authorized: Boolean(syncSecret && isCampusSyncAuthorized(request, syncSecret)),
  };
}

export function safeLegacyFilename(key: string) {
  const filename = key.split(/[\\/]/).pop()?.trim() || "document.txt";
  return filename.replace(/[^\p{L}\p{N}._() -]/gu, "_").slice(0, 180) || "document.txt";
}

export function contentTypeFor(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();
  return ({ pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv", json: "application/json", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as Record<string, string>)[extension || ""] || "application/octet-stream";
}
