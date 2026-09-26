import { NextResponse } from "next/server";
import snapshotJson from "@/data/catalogue-snapshot.json";
import { fetchCatalogFromDb } from "@/lib/db";
import { getResourceLinks } from "@/lib/resource-links";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

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
  platformUrl: string;
  hasPrivateDocument: boolean;
  hasSourceText: boolean;
};

const snapshot = snapshotJson as SnapshotResource[];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const publicText = (value: unknown) => text(value)
  .replace(/\b(?:studi|mba|bachelor|graduate)\b/gi, "")
  .replace(/\s{2,}/g, " ")
  .replace(/\s+([:;,])/g, "$1")
  .trim();

function corpusName(project: unknown, fallback: unknown) {
  const names: Record<string, string> = {
    "14": "Digital",
    "15": "Formateur",
    "16": "Python",
    "17": "RH",
    "18": "Paie",
    "19": "Divers",
  };
  return names[text(project)] || publicText(fallback) || "Corpus non renseigné";
}

function neutralBlock(code: string, title: unknown) {
  if (/^B0{1,2}$/i.test(code)) return "Introduction";
  return publicText(title) || "Bloc non renseigné";
}

function snapshotResource(item: SnapshotResource): CatalogResource | null {
  const falseReservedCorrection = item.resourceCode === "C360_B00_M10_L005";
  if (!item.resourceCode || !item.title || (item.reserved && !falseReservedCorrection) || item.resourceType.toUpperCase() === "EMPTY") return null;
  const links = getResourceLinks(item.resourceCode);
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
    platformUrl: item.platformUrl || links.platform || "",
    hasPrivateDocument: Boolean(item.privateDocumentUrl || links.drive),
    hasSourceText: false,
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
  try {
    const rows = await fetchCatalogFromDb();
    if (rows.length) {
      const resources: CatalogResource[] = rows.map((row) => ({
        resourceCode: row.resource_code,
        formation: row.corpus_name,
        blockCode: row.block_code || "",
        blockTitle: neutralBlock(row.block_code || "", row.block_title),
        moduleCode: row.module_code || "",
        moduleTitle: publicText(row.module_title) || "Module non renseigné",
        resourceType: publicText(row.resource_type) || "Ressource",
        title: publicText(row.title),
        pulse: row.pulse || "",
        platformUrl: row.platform_url || "",
        hasPrivateDocument: Boolean(row.private_document_url),
        hasSourceText: row.source_status === "text_extracted" || row.qdrant_status === "indexed_text",
      })).sort(sortResources);

      return NextResponse.json({
        resources,
        connected: true,
        catalogueResources: resources.length,
        catalogueSource: "neon_postgres",
      });
    }
  } catch (error) {
    console.error("Neon catalogue read error", error);
  }

  const resources = snapshot
    .map(snapshotResource)
    .filter((item): item is CatalogResource => Boolean(item))
    .sort(sortResources);

  return NextResponse.json({
    resources,
    connected: false,
    catalogueResources: resources.length,
    catalogueSource: "sheet_snapshot_fallback",
  });
}
