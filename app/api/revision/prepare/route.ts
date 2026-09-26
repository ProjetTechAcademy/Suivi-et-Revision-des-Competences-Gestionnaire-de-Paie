import { NextRequest, NextResponse } from "next/server";
import {
  failSliceAnalysis,
  fetchNextPendingSlice,
  fetchResourceByCode,
  markSliceAnalysisProcessing,
  resetEmptySliceAnalyses,
  resourceSliceAnalysisStatus,
  saveSliceAnalysis,
} from "@/lib/db";
import {
  beginRevisionGroup,
  completeRevisionGroup,
  failRevisionGroup,
  nextRevisionGroup,
  prepareRevisionGroups,
  revisionGroupStatus,
} from "@/lib/revision-groups";
import { analyzeSourceSliceWithGroq, generateRevisionPartWithGroq, mergeSliceAnalysesWithGroq } from "@/lib/groq";
import {
  beginRevisionPart,
  completeRevisionPart,
  failRevisionPart,
  nextRevisionPart,
  prepareRevisionParts,
  revisionPartStatus,
} from "@/lib/revision-parts";

export const runtime = "nodejs";
export const maxDuration = 120;

type Locale = "fr" | "en";

export async function POST(request: NextRequest) {
  let body: { resourceCode?: string; locale?: Locale };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const resourceCode = String(body.resourceCode || "").trim().slice(0, 256);
  const locale: Locale = body.locale === "en" ? "en" : "fr";
  if (!resourceCode) {
    return NextResponse.json({ error: "Code ressource obligatoire" }, { status: 400 });
  }

  const resource = await fetchResourceByCode(resourceCode);
  if (!resource) {
    return NextResponse.json({ error: "Ressource introuvable" }, { status: 404 });
  }

  await resetEmptySliceAnalyses(resourceCode);
  let slices = await resourceSliceAnalysisStatus(resourceCode);

  if (!slices.total) {
    return NextResponse.json({
      error: locale === "en" ? "No prepared text slices." : "Aucune tranche de texte préparée.",
      code: "SLICES_MISSING",
    }, { status: 422 });
  }

  if (slices.done < slices.total) {
    const slice = await fetchNextPendingSlice(resourceCode);
    if (!slice) {
      return NextResponse.json({ stage: "slices", ready: false, progress: slices, waitMs: 8000 });
    }

    await markSliceAnalysisProcessing(resourceCode, slice.slice_index);
    try {
      const analysis = await analyzeSourceSliceWithGroq({
        resourceCode,
        sliceIndex: slice.slice_index,
        totalSlices: slices.total,
        sliceText: slice.slice_text,
        locale,
      });
      await saveSliceAnalysis(resourceCode, slice.slice_index, analysis);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      console.error("PAÏA slice analysis retry", { resourceCode, sliceIndex: slice.slice_index, message });
      await failSliceAnalysis(resourceCode, slice.slice_index, message);
      return NextResponse.json({
        error: locale === "en"
          ? "The analysis engine is temporarily saturated."
          : "Le moteur d’analyse est momentanément saturé. La tranche sera reprise automatiquement.",
        code: "SLICE_ANALYSIS_RETRY",
        stage: "slices",
        waitMs: 35000,
      }, { status: 503 });
    }

    slices = await resourceSliceAnalysisStatus(resourceCode);
    return NextResponse.json({
      stage: "slices",
      ready: false,
      progress: slices,
      waitMs: 32000,
    });
  }

  await prepareRevisionGroups(resourceCode, 5);
  let groups = await revisionGroupStatus(resourceCode);

  if (groups.done < groups.total) {
    const group = await nextRevisionGroup(resourceCode, 5);
    if (!group) {
      return NextResponse.json({ stage: "groups", ready: false, progress: groups, waitMs: 8000 });
    }

    await beginRevisionGroup(resourceCode, group.group_index);
    try {
      const analysis = await mergeSliceAnalysesWithGroq({
        resourceCode,
        groupIndex: group.group_index,
        analysisText: group.content,
        locale,
      });
      await completeRevisionGroup(resourceCode, group.group_index, analysis);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      console.error("PAÏA group analysis retry", { resourceCode, groupIndex: group.group_index, message });
      await failRevisionGroup(resourceCode, group.group_index, message);
      return NextResponse.json({
        error: locale === "en"
          ? "The consolidation engine is temporarily saturated."
          : "Le moteur de consolidation est momentanément saturé. Le groupe sera repris automatiquement.",
        code: "GROUP_ANALYSIS_RETRY",
        stage: "groups",
        waitMs: 35000,
      }, { status: 503 });
    }

    groups = await revisionGroupStatus(resourceCode);
    return NextResponse.json({
      stage: "groups",
      ready: false,
      progress: groups,
      waitMs: groups.done === groups.total ? 0 : 35000,
    });
  }

  await prepareRevisionParts(resourceCode, 3);
  let parts = await revisionPartStatus(resourceCode);

  if (parts.done < parts.total) {
    const part = await nextRevisionPart(resourceCode, 3);
    if (!part) {
      return NextResponse.json({ stage: "parts", ready: false, progress: parts, waitMs: 8000 });
    }

    await beginRevisionPart(resourceCode, part.part_index);
    try {
      const content = await generateRevisionPartWithGroq({
        resourceCode,
        title: String(resource.title || resourceCode),
        partIndex: part.part_index,
        totalParts: part.totalParts,
        source: part.source,
        locale,
      });
      await completeRevisionPart(resourceCode, part.part_index, content);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      console.error("PAÏA revision part retry", { resourceCode, partIndex: part.part_index, message });
      await failRevisionPart(resourceCode, part.part_index, message);
      return NextResponse.json({
        error: locale === "en"
          ? "The PAÏA section generator is temporarily saturated."
          : "Le générateur de la partie PAÏA est momentanément saturé. Cette partie sera reprise automatiquement.",
        code: "REVISION_PART_RETRY",
        stage: "parts",
        waitMs: 35000,
      }, { status: 503 });
    }

    parts = await revisionPartStatus(resourceCode);
    return NextResponse.json({
      stage: "parts",
      ready: parts.done === parts.total,
      progress: parts,
      waitMs: parts.done === parts.total ? 0 : 35000,
    });
  }

  return NextResponse.json({
    stage: "ready",
    ready: true,
    progress: parts,
    waitMs: 0,
  });
}
