import { NextResponse } from "next/server";
import snapshotJson from "@/data/catalogue-snapshot.json";
import { getResourceLinks } from "@/lib/resource-links";
import snapshotJson from "@/data/catalogue-snapshot.json";

type QdrantPayload = Record<string, string | number | boolean>;
type QdrantPoint = { payload?: QdrantPayload };

type SnapshotResource = {
  resourceCode: string;
  project: string;
  formation: string;
  blockCode: string;
  blockTitle: string;
  moduleCode: string;
  moduleTitle: string;
  resourceType: string;
  title: string;
  pulse: string;
  subdomain: string;
  keywords: string[];
  regulatory: boolean;
  updatedAt: string;
  platformUrl: string;
  privateDocumentUrl: string;
  sourceUrl: string;
  reserved: boolean;
};

type SnapshotResource = {
  resourceCode: string;
  project: string;
  formation: string;
  blockCode: string;
  blockTitle: string;
  moduleCode: string;
  moduleTitle: string;
  resourceType: string;
  title: string;
  pulse: string;
  privateDocumentUrl: string;
  reserved: boolean;
};

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

const snapshot = snapshotJson as SnapshotResource[];
const snapshot = snapshotJson as SnapshotResource[];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const publicText = (value: unknown) => text(value)
  .replace(/\b(?:studi|mba|bachelor|graduate)\b/gi, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s+([:;,])/g, "$1")
  .trim();

function corpusName(project: unknown, fallback: unknown) {
  const names: Record<string, string> = {
    "14": "Digital", "15": "Formateur", "16": "Python",
    "17": "RH", "18": "Paie", "19": "Divers",
  };
  return names[text(project)] || publicText(fallback) || "Corpus non renseigné";
}

function neutralBlock(code: string, title: unknown) {
  if (/^B0{1,2}$/i.test(code)) return "Introduction";
  return publicText(title) || "Bloc non renseigné";
}

function snapshotResource(item: SnapshotResource): CatalogResource | null {
  if (!item.resourceCode || !item.title || item.reserved || item.resourceType.toUpperCase() === "EMPTY") return null;
  return {
    resourceCode: item.resourceCode,
    formation: corpusName(item.project, item.formation),
    blockCode: item.blockCode,
    blockTitle: neutralBlock(item.blockCode, item.blockTitle),
    moduleCode: item.moduleCode,
    moduleTitle: publicText(item.moduleTitle) || "Module non renseigné",
    resourceType: publicText(item.resourceType) || "Ressource",
    title: publicText(item.title),
    pulse: item.pulse,
    hasPrivateDocument: Boolean(item.privateDocumentUrl || getResourceLinks(item.resourceCode).drive),
    hasSourceText: false,
  };
}

function qdrantResource(payload: QdrantPayload): CatalogResource | null {
  const resourceCode = text(payload.resource_code);
  const title = publicText(payload.title);
  const resourceType = publicText(payload.resource_type);
  const blockCode = text(payload.block_code);
  if (!resourceCode || !title || payload.reserved === true || resourceType.toUpperCase() === "EMPTY") return null;
  const links = getResourceLinks(resourceCode);
  return {
    resourceCode,
    formation: corpusName(payload.project, payload.formation),
    blockCode,
    blockTitle: neutralBlock(blockCode, payload.block_title),
    moduleCode: text(payload.module_code),
    moduleTitle: publicText(payload.module_title) || "Module non renseigné",
    resourceType: resourceType || "Ressource",
    title,
    pulse: text(payload.pulse),
    hasPrivateDocument: Boolean(text(payload.private_document_url) || links.drive),
    hasSourceText: payload.has_source_text === true,
  };
}

function naturalValue(value: string) {
  return value.replace(/(\d+)/g, (match) => match.padStart(8, "0"));
}

function sortResources(a: CatalogResource, b: CatalogResource) {
  return [
    a.formation.localeCompare(b.formation, "fr", { sensitivity: "base" }),
    naturalValue(a.blockCode).localeCompare(naturalValue(b.blockCode), "fr", { sensitivity: "base" }),
    naturalValue(a.moduleCode).localeCompare(naturalValue(b.moduleCode), "fr", { sensitivity: "base" }),
    a.title.localeCompare(b.title, "fr", { sensitivity: "base" }),
  ].find((value) => value !== 0) || 0;
}

export async function GET() {
  const resources = new Map<string, CatalogResource>();
  for (const item of snapshot) {
    const resource = snapshotResource(item);
    if (resource) resources.set(resource.resourceCode, resource);
  }

  const url = (process.env.QDRANT_URL || "").replace(/\/$/, "");
  const apiKey = process.env.QDRANT_API_KEY || "";
  const collection = process.env.QDRANT_COLLECTION || "campus-paia";
  let connected = false;

  if (url && apiKey) {
    try {
      let offset: string | number | null | undefined;
      do {
        const response = await fetch(`${url}/collections/${encodeURIComponent(collection)}/points/scroll`, {
          method: "POST",
          headers: { "api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            limit: 256,
            with_payload: [
              "resource_code", "project", "formation", "block_code", "block_title", "module_code", "module_title",
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
          const resource = qdrantResource(point.payload ?? {});
          if (resource) resources.set(resource.resourceCode, resource);
        }
        offset = data.result?.next_page_offset;
      } while (offset !== undefined && offset !== null);
      connected = true;
    } catch (error) {
      console.error("Corpus catalog read error", error);
    }
  }

  const list = [...resources.values()].sort(sortResources);
  return NextResponse.json({
    resources: list,
    connected,
    catalogueResources: list.length,
    catalogueSource: "sheet_snapshot_plus_qdrant",
  });
}
