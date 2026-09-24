import { NextResponse } from "next/server";
import { publicText } from "@/lib/corpus";

type QdrantPayload = Record<string, string | number | boolean>;
type QdrantPoint = { payload?: QdrantPayload };

type CatalogResource = {
  resourceCode: string;
  formation: string;
  blockCode: string;
  blockTitle: string;
  moduleCode: string;
  moduleTitle: string;
  resourceType: string;
  title: string;
  pulse: string;
  hasPrivateDocument: boolean;
  hasSourceText: boolean;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

function publicResource(payload: QdrantPayload): CatalogResource | null {
  const resourceCode = text(payload.resource_code);
  const title = publicText(payload.title);
  const resourceType = publicText(payload.resource_type);
  if (!resourceCode || !title || payload.reserved === true || resourceType.toUpperCase() === "EMPTY") return null;
  return {
    resourceCode,
    formation: publicText(payload.formation) || "Parcours non renseigné",
    blockCode: text(payload.block_code),
    blockTitle: publicText(payload.block_title) || "Bloc non renseigné",
    moduleCode: text(payload.module_code),
    moduleTitle: publicText(payload.module_title) || "Module non renseigné",
    resourceType: resourceType || "Ressource",
    title,
    pulse: text(payload.pulse),
    hasPrivateDocument: Boolean(text(payload.private_document_url)),
    hasSourceText: payload.has_source_text === true,
  };
}

export async function GET() {
  const url = (process.env.QDRANT_URL || "").replace(/\/$/, "");
  const apiKey = process.env.QDRANT_API_KEY || "";
  const collection = process.env.QDRANT_COLLECTION || "campus-paia";
  if (!url || !apiKey) return NextResponse.json({ resources: [], connected: false }, { status: 503 });

  try {
    const resources = new Map<string, CatalogResource>();
    let offset: string | number | null | undefined;
    do {
      const response = await fetch(`${url}/collections/${encodeURIComponent(collection)}/points/scroll`, {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          limit: 256,
          with_payload: [
            "resource_code", "formation", "block_code", "block_title", "module_code", "module_title",
            "resource_type", "title", "pulse", "reserved", "has_source_text", "private_document_url"
          ],
          with_vector: false,
          ...(offset !== undefined && offset !== null ? { offset } : {}),
        }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`CATALOG_SCROLL_FAILED:${response.status}`);
      const data = await response.json() as { result?: { points?: QdrantPoint[]; next_page_offset?: string | number | null } };
      for (const point of data.result?.points ?? []) {
        const resource = publicResource(point.payload ?? {});
        if (resource) resources.set(resource.resourceCode, resource);
      }
      offset = data.result?.next_page_offset;
    } while (offset !== undefined && offset !== null);

    return NextResponse.json({ resources: [...resources.values()], connected: true });
  } catch (error) {
    console.error("Corpus catalog read error", error);
    return NextResponse.json({ resources: [], connected: false }, { status: 502 });
  }
}
