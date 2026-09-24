import { NextRequest, NextResponse } from "next/server";
import { getQdrantResource } from "@/lib/qdrant";
import { getResourceLinks } from "@/lib/resource-links";

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest) {
  let body: { resourceCode?: string; ownerKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const resourceCode = String(body.resourceCode || "").trim().slice(0, 256);
  if (!resourceCode) {
    return NextResponse.json({ error: "Code ressource obligatoire" }, { status: 400 });
  }

  const expected = process.env.CAMPUS_OWNER_ACCESS_KEY || "";
  const supplied = String(body.ownerKey || "");

  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({
      error: "Ce document privé nécessite l’accès propriétaire.",
      code: "SOURCE_RESTRICTED",
    }, { status: 403 });
  }

  const links = getResourceLinks(resourceCode);
  let documentUrl = links.drive || "";

  try {
    const point = await getQdrantResource(resourceCode);
    const indexedUrl = text(point?.payload?.private_document_url);
    if (indexedUrl) documentUrl = indexedUrl;
  } catch {
    // Le fichier historique reste disponible via resource-links pendant la transition.
  }

  if (!documentUrl) {
    return NextResponse.json({
      error: "Aucun document Drive n’est encore associé à cette ressource.",
    }, { status: 404 });
  }

  return NextResponse.json({ documentUrl });
}
