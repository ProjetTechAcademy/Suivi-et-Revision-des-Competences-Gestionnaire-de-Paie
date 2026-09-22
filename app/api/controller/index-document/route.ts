import { NextRequest, NextResponse } from "next/server";
import { contentTypeFor, controllerConfiguration, safeLegacyFilename } from "@/lib/controller-compat";
import { attachVectorStoreFile, detachVectorStoreFile, findVectorStoreFilesByAttribute, uploadOpenAIFile } from "@/lib/openai";

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

  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return NextResponse.json({ error: "Le corps JSON doit être un objet" }, { status: 400 });
  const payload = raw as LegacyPayload;

  try {
    const key = typeof payload.key === "string" ? payload.key.trim() : "";
    if (!key) return NextResponse.json({ error: "La clé du document est obligatoire" }, { status: 400 });

    const filename = safeLegacyFilename(key);
    let file: File;
    if (typeof payload.text === "string") file = new File([payload.text], filename, { type: "text/plain;charset=utf-8" });
    else if (typeof payload.contentBase64 === "string") file = new File([decodeBase64(payload.contentBase64)], filename, { type: contentTypeFor(filename) });
    else return NextResponse.json({ error: "Le document doit contenir text ou contentBase64" }, { status: 400 });

    const previous = await findVectorStoreFilesByAttribute(config.apiKey, config.vectorStoreId, "legacy_key", key);
    const uploaded = await uploadOpenAIFile(config.apiKey, file);
    const attached = await attachVectorStoreFile(config.apiKey, config.vectorStoreId, uploaded.id, {
      legacy_key: key.slice(0, 256),
      source: "google_apps_script_v2",
    });

    await Promise.all(previous.map((fileId) => detachVectorStoreFile(config.apiKey, config.vectorStoreId, fileId)));

    return NextResponse.json({ ok: true, key, status: attached.status, replaced: previous.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      { error: message === "INVALID_BASE64" ? "Contenu base64 invalide" : "Échec de l’indexation du document" },
      { status: message === "INVALID_BASE64" ? 400 : message.startsWith("OPENAI_") ? 502 : 500 },
    );
  }
}
