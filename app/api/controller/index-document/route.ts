import { NextRequest, NextResponse } from "next/server";
import { controllerConfiguration, safeLegacyFilename } from "@/lib/controller-compat";
import { extractTextFromFile } from "@/lib/file-text";
import { upsertQdrantDocument } from "@/lib/qdrant";

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
  if (!config.configured) return NextResponse.json({ error: "Index Campus PAÏA non configuré" }, { status: 503 });

  let raw: unknown;
  try { raw = await request.json(); }
  catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Le corps JSON doit être un objet" }, { status: 400 });
  }
  const payload = raw as LegacyPayload;

  try {
    const key = typeof payload.key === "string" ? payload.key.trim() : "";
    if (!key) return NextResponse.json({ error: "La clé du document est obligatoire" }, { status: 400 });

    let text = "";
    if (typeof payload.text === "string") {
      text = payload.text;
    } else if (typeof payload.contentBase64 === "string") {
      const filename = safeLegacyFilename(key);
      const bytes = decodeBase64(payload.contentBase64);
      const file = new File([bytes], filename, {
        type: filename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      });
      text = await extractTextFromFile(file);
    } else {
      return NextResponse.json({ error: "Le document doit contenir text ou contentBase64" }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "Aucun texte indexable n’a été extrait du document" }, { status: 422 });
    }

    const indexedChunks = await upsertQdrantDocument(key, text, {
      resource_code: key.slice(0, 256),
      title: key.slice(0, 256),
      resource_type: "legacy",
      source: "google_apps_script_v2",
    });

    return NextResponse.json({ ok: true, key, status: "indexed", indexedChunks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN";
    return NextResponse.json(
      { error: message === "INVALID_BASE64" ? "Contenu base64 invalide" : "Échec de l’indexation du document" },
      { status: message === "INVALID_BASE64" ? 400 : 502 },
    );
  }
}
