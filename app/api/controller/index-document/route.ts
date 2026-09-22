import { NextRequest, NextResponse } from "next/server";
import { contentTypeFor, controllerConfiguration, safeLegacyFilename } from "@/lib/controller-compat";
import { attachVectorStoreFile, detachVectorStoreFile, listVectorStoreFiles, uploadOpenAIFile } from "@/lib/openai";

export const runtime = "nodejs";

type LegacyPayload = { key?: unknown; text?: unknown; contentBase64?: unknown };

function decodeBase64(value: string) {
  const compact = value.replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw new Error("INVALID_BASE64");
  return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
}

export async function POST(request: NextRequest) {
  const config = controllerConfiguration(request);
  if (!config.authorized) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (!config.apiKey || !config.vectorStoreId) return NextResponse.json({ error: "Index Campus PAÏA non configuré" }, { status: 503 });

  try {
    const payload = await request.json() as LegacyPayload;
    const key = typeof payload.key === "string" ? payload.key.trim() : "";
    if (!key) return NextResponse.json({ error: "La clé du document est obligatoire" }, { status: 400 });
    const filename = safeLegacyFilename(key);
    let file: File;
    if (typeof payload.text === "string") {
      file = new File([payload.text], filename, { type: "text/plain;charset=utf-8" });
    } else if (typeof payload.contentBase64 === "string") {
      const bytes = decodeBase64(payload.contentBase64);
      file = new File([bytes], filename, { type: contentTypeFor(filename) });
    } else {
      return NextResponse.json({ error: "Le document doit contenir text ou contentBase64" }, { status: 400 });
    }

    // Backward-compatible idempotence: detach earlier entries carrying the same key.
    const existing = await listVectorStoreFiles(config.apiKey, config.vectorStoreId);
    const duplicates = existing.filter((item) => item.attributes?.legacy_key === key);
    await Promise.all(duplicates.map((item) => detachVectorStoreFile(config.apiKey, config.vectorStoreId, item.id)));

    const uploaded = await uploadOpenAIFile(config.apiKey, file);
    const attached = await attachVectorStoreFile(config.apiKey, config.vectorStoreId, uploaded.id, { legacy_key: key.slice(0, 256), source: "google_apps_script_v2" });
    console.info(JSON.stringify({ event: "campus_legacy_index", key, replaced: duplicates.length, vectorFileId: attached.id }));
    return NextResponse.json({ ok: true, key, status: attached.status, replaced: duplicates.length });
  } catch (error) {
    console.error(JSON.stringify({ event: "campus_legacy_index_error", message: error instanceof Error ? error.message : "UNKNOWN" }));
    return NextResponse.json({ error: "Échec de l’indexation du document" }, { status: 500 });
  }
}
