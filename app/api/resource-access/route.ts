import { NextRequest, NextResponse } from "next/server";
import { getQdrantResource } from "@/lib/qdrant";

export async function POST(request: NextRequest) {
  let body: { resourceCode?: string; ownerKey?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }

  const resourceCode = String(body.resourceCode || "").trim().slice(0, 256);
  if (!resourceCode) return NextResponse.json({ error: "Code ressource obligatoire" }, { status: 400 });

  const expected = process.env.CAMPUS_OWNER_ACCESS_KEY || "";
  const supplied = String(body.ownerKey || "");

  if (!expected || !supplied || supplied !== expected) {
    return NextResponse.json({
      error: "Pour des raisons de droit d’auteur, le document source n’est pas accessible depuis cet espace.",
      code: "SOURCE_RESTRICTED",
    }, { status: 403 });
  }

  try {
    const point = await getQdrantResource(resourceCode);
    const documentUrl = String(point?.payload?.private_document_url ?? "").trim();

    if (!documentUrl) {
      return NextResponse.json({ error: "Aucun original Drive n’est associé à cette ressource." }, { status: 404 });
    }

    return NextResponse.json({ documentUrl });
  } catch (error) {
    console.error("Corpus resource access error", error);
    return NextResponse.json({ error: "Accès à la ressource momentanément indisponible." }, { status: 502 });
  }
}
