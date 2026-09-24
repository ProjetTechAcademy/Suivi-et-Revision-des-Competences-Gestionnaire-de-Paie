import { NextRequest, NextResponse } from "next/server";
import { getQdrantResource } from "@/lib/qdrant";

export async function POST(request: NextRequest) {
  let body: { resourceCode?: string; ownerKey?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }

  const resourceCode = String(body.resourceCode || "").trim().slice(0, 256);
  if (!resourceCode) return NextResponse.json({ error: "Code ressource obligatoire" }, { status: 400 });

  try {
    const hit = await getQdrantResource(resourceCode);
    if (!hit) return NextResponse.json({ error: "Ressource introuvable" }, { status: 404 });
    const payload = hit.payload ?? {};
    const platformUrl = String(payload.platform_url ?? "");
    const expected = process.env.CAMPUS_OWNER_ACCESS_KEY || "";
    const supplied = String(body.ownerKey || "");

    if (!expected || !supplied || supplied !== expected) {
      return NextResponse.json({
        error: "Pour des raisons de droit d’auteur, le document source n’est pas accessible depuis cet espace.",
        code: "SOURCE_RESTRICTED",
        platformUrl,
      }, { status: 403 });
    }

    const documentUrl = String(payload.private_document_url ?? payload.source_url ?? "");
    if (!documentUrl) {
      return NextResponse.json({ error: "Aucun document source ouvrable n’est associé à cette ressource.", platformUrl }, { status: 404 });
    }

    return NextResponse.json({ documentUrl, platformUrl });
  } catch (error) {
    console.error("Resource access error", error);
    return NextResponse.json({ error: "Accès au document momentanément indisponible." }, { status: 502 });
  }
}
