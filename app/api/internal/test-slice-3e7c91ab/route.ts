import { NextResponse } from "next/server";
import {
  failSliceAnalysis,
  fetchNextPendingSlice,
  markSliceAnalysisProcessing,
  resourceSliceAnalysisStatus,
  saveSliceAnalysis,
} from "@/lib/db";
import { analyzeSourceSliceWithGroq } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 120;

const RESOURCE_CODE = "CD0_B1_M03_F001";

export async function GET() {
  const before = await resourceSliceAnalysisStatus(RESOURCE_CODE);
  const slice = await fetchNextPendingSlice(RESOURCE_CODE);

  if (!slice) {
    return NextResponse.json({ resourceCode: RESOURCE_CODE, before, after: before, complete: before.total > 0 && before.done === before.total });
  }

  await markSliceAnalysisProcessing(RESOURCE_CODE, slice.slice_index);

  try {
    const analysis = await analyzeSourceSliceWithGroq({
      resourceCode: RESOURCE_CODE,
      sliceIndex: slice.slice_index,
      totalSlices: before.total,
      sliceText: slice.slice_text,
      locale: "fr",
    });
    await saveSliceAnalysis(RESOURCE_CODE, slice.slice_index, analysis);
    const after = await resourceSliceAnalysisStatus(RESOURCE_CODE);
    return NextResponse.json({
      resourceCode: RESOURCE_CODE,
      processedSlice: slice.slice_index,
      sourceChars: slice.slice_chars,
      analysisChars: analysis.length,
      after,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    await failSliceAnalysis(RESOURCE_CODE, slice.slice_index, message);
    const after = await resourceSliceAnalysisStatus(RESOURCE_CODE);
    return NextResponse.json({ resourceCode: RESOURCE_CODE, processedSlice: slice.slice_index, error: message, after }, { status: 502 });
  }
}
