import { NextResponse } from "next/server";
import {
  beginRevisionGroup,
  completeRevisionGroup,
  failRevisionGroup,
  nextRevisionGroup,
  prepareRevisionGroups,
  revisionGroupStatus,
} from "@/lib/revision-groups";
import { mergeSliceAnalysesWithGroq } from "@/lib/groq";

export const runtime = "nodejs";
export const maxDuration = 120;

const RESOURCE_CODE = "CD0_B1_M03_F001";

export async function GET() {
  await prepareRevisionGroups(RESOURCE_CODE, 10);
  const before = await revisionGroupStatus(RESOURCE_CODE);
  const group = await nextRevisionGroup(RESOURCE_CODE, 10);

  if (!group) {
    return NextResponse.json({
      resourceCode: RESOURCE_CODE,
      before,
      after: before,
      complete: before.total > 0 && before.done === before.total,
    });
  }

  await beginRevisionGroup(RESOURCE_CODE, group.group_index);

  try {
    const analysis = await mergeSliceAnalysesWithGroq({
      resourceCode: RESOURCE_CODE,
      groupIndex: group.group_index,
      analysisText: group.content,
      locale: "fr",
    });

    await completeRevisionGroup(RESOURCE_CODE, group.group_index, analysis);
    const after = await revisionGroupStatus(RESOURCE_CODE);

    return NextResponse.json({
      resourceCode: RESOURCE_CODE,
      groupIndex: group.group_index,
      sliceStart: group.slice_start,
      sliceEnd: group.slice_end,
      analysisChars: analysis.length,
      after,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    await failRevisionGroup(RESOURCE_CODE, group.group_index, message);
    const after = await revisionGroupStatus(RESOURCE_CODE);
    return NextResponse.json({ resourceCode: RESOURCE_CODE, error: message, after }, { status: 502 });
  }
}
