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
import { analyzeSourceSliceWithGroq, mergeSliceAnalysesWithGroq } from "@/lib/groq";

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
      await failSliceAnalysis(resourceCode, slice.slice_index, message);
      return NextResponse.json({
        error: locale === "en"
          ? "The analysis engine is temporarily saturated."
          : "Le moteur d’analyse est momentanément saturé. La tranche sera reprise automatiquement.",
        code: "SLICE_ANALYSIS_RETRY",
        stage: "slices",
      }, { status: 503 });
    }

    slices = await resourceSliceAnalysisStatus(resourceCode);
    return NextResponse.json({
      stage: "slices",
      ready: false,
      progress: slices,
      waitMs: slices.done === slices.total ? 0 : 32000,
    });
  }

  await prepareRevisionGroups(resourceCode, 10);
  let groups = await revisionGroupStatus(resourceCode);

  if (groups.done < groups.total) {
    const group = await nextRevisionGroup(resourceCode, 10);
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
      await failRevisionGroup(resourceCode, group.group_index, message);
      return NextResponse.json({
        error: locale === "en"
          ? "The consolidation engine is temporarily saturated."
          : "Le moteur de consolidation est momentanément saturé. Le groupe sera repris automatiquement.",
        code: "GROUP_ANALYSIS_RETRY",
        stage: "groups",
      }, { status: 503 });
    }

    groups = await revisionGroupStatus(resourceCode);
    return NextResponse.json({
      stage: "groups",
      ready: groups.done === groups.total,
      progress: groups,
      waitMs: groups.done === groups.total ? 32000 : 32000,
    });
  }

  return NextResponse.json({
    stage: "ready",
    ready: true,
    progress: groups,
    waitMs: 0,
  });
}
