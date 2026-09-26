import { NextRequest, NextResponse } from "next/server";
import { isCampusSyncAuthorized } from "@/lib/campus-auth";
import { buildIndexDocument, normalizeCorpusResource, publicAttributes } from "@/lib/corpus";
import { extractTextFromFile } from "@/lib/file-text";
import { upsertQdrantDocument } from "@/lib/qdrant";
import { upsertCorpusResource } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

class InvalidPayloadError extends Error {}
class DriveSourceError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

async function readPayload(request: NextRequest) {
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const raw = form.get("metadata");
      if (typeof raw !== "string") throw new InvalidPayloadError("metadata est obligatoire");
      const parsed = JSON.parse(raw) as unknown;
      if (!isObject(parsed)) throw new InvalidPayloadError("metadata doit être un objet JSON");
      const fileValue = form.get("file");
      return { metadata: parsed, file: fileValue instanceof File ? fileValue : null };
    }

    const parsed = await request.json() as unknown;
    if (!isObject(parsed)) throw new InvalidPayloadError("Le corps JSON doit être un objet");
    return { metadata: parsed, file: null };
  } catch (error) {
    if (error instanceof InvalidPayloadError) throw error;
    throw new InvalidPayloadError("JSON ou formulaire invalide");
  }
}

type DriveFileMetadata = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string;
  trashed?: boolean;
};

async function driveRequest(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new DriveSourceError(`Google Drive HTTP ${response.status} — ${detail || "réponse vide"}`);
  }
  return response;
}

async function fetchPrivateDriveFile(fileId: string, accessToken: string): Promise<File | null> {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    throw new InvalidPayloadError("driveFileId invalide");
  }
  if (accessToken.length < 20) {
    throw new InvalidPayloadError("googleAccessToken invalide");
  }

  const encodedId = encodeURIComponent(fileId);
  const metaResponse = await driveRequest(
    `https://www.googleapis.com/drive/v3/files/${encodedId}?fields=id,name,mimeType,size,trashed&supportsAllDrives=true`,
    accessToken
  );
  const meta = await metaResponse.json() as DriveFileMetadata;
  if (meta.trashed) throw new DriveSourceError("Le fichier Drive est dans la corbeille.");

  const mimeType = clean(meta.mimeType);
  const name = clean(meta.name) || `${fileId}.bin`;

  let downloadUrl = "";
  let outputMimeType = mimeType || "application/octet-stream";

  if (mimeType === "application/vnd.google-apps.document") {
    outputMimeType = "text/plain";
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodedId}/export?mimeType=${encodeURIComponent(outputMimeType)}`;
  } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
    outputMimeType = "text/csv";
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodedId}/export?mimeType=${encodeURIComponent(outputMimeType)}`;
  } else if (
    mimeType === "application/vnd.google-apps.presentation" ||
    mimeType === "application/vnd.google-apps.drawing"
  ) {
    outputMimeType = "application/pdf";
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodedId}/export?mimeType=${encodeURIComponent(outputMimeType)}`;
  } else if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml"
  ) {
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodedId}?alt=media&supportsAllDrives=true`;
  } else {
    // Vidéos, audio, images et raccourcis restent indexés par leurs métadonnées
    // tant qu'une transcription ou un texte exploitable n'est pas disponible.
    return null;
  }

  const fileResponse = await driveRequest(downloadUrl, accessToken);
  const bytes = await fileResponse.arrayBuffer();
  if (!bytes.byteLength) return null;

  // Garde-fou mémoire : les documents de cours usuels restent très en dessous.
  if (bytes.byteLength > 60 * 1024 * 1024) {
    throw new DriveSourceError("Fichier Drive trop volumineux pour l'extraction directe (> 60 Mo).");
  }

  return new File([bytes], name, { type: outputMimeType });
}

export async function POST(request: NextRequest) {
  const syncSecret = process.env.CAMPUS_SYNC_SECRET;
  if (!syncSecret || !isCampusSyncAuthorized(request, syncSecret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!process.env.QDRANT_URL || !process.env.QDRANT_API_KEY) {
    return NextResponse.json({ error: "Index Campus PAÏA non configuré" }, { status: 503 });
  }

  try {
    const { metadata, file: uploadedFile } = await readPayload(request);

    const driveFileId = clean(metadata.driveFileId);
    const googleAccessToken = clean(metadata.googleAccessToken);
    const safeMetadata = { ...metadata };
    delete safeMetadata.driveFileId;
    delete safeMetadata.googleAccessToken;

    const { resource, warnings } = normalizeCorpusResource(safeMetadata);
    const incomplete = warnings.some((warning) => warning.endsWith("_MISSING"));
    const journal = {
      resourceCode: resource.resourceCode || null,
      status: incomplete ? "metadata_incomplete" : "accepted",
      warnings,
    };
    if (incomplete) return NextResponse.json(journal, { status: 422 });

    let extractedText = resource.extractedText;
    let file = uploadedFile;

    if (!file && !extractedText && driveFileId && googleAccessToken) {
      file = await fetchPrivateDriveFile(driveFileId, googleAccessToken);
    }
    if (!extractedText && file) {
      extractedText = await extractTextFromFile(file);
    }

    const indexable = buildIndexDocument({ ...resource, extractedText });
    const attributes = publicAttributes({ ...resource, extractedText });

    const indexedChunks = await upsertQdrantDocument(resource.resourceCode, indexable, {
      ...attributes,
      source: "campus_catalogue",
    });

    try {
      await upsertCorpusResource(
        { ...resource, extractedText },
        {
          sourceStatus: extractedText ? "text_extracted" : "metadata_only",
          qdrantStatus: extractedText ? "indexed_text" : "indexed_metadata",
        },
      );
    } catch (dbError) {
      console.error("Campus PAÏA Neon sync error", dbError instanceof Error ? dbError.message : "unknown");
    }

    return NextResponse.json({
      ...journal,
      status: "indexed",
      indexedChunks,
      sourceText: Boolean(extractedText),
      sourceMode: driveFileId ? "private_drive" : (uploadedFile ? "upload" : "metadata"),
    });
  } catch (error) {
    if (error instanceof InvalidPayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DriveSourceError) {
      return NextResponse.json({ error: error.message, code: "DRIVE_SOURCE_ERROR" }, { status: 424 });
    }
    console.error("Campus PAÏA indexing error", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Échec de l’indexation" }, { status: 502 });
  }
}
