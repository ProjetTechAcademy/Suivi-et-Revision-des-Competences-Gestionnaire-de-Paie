import { NextResponse } from "next/server";
import { getPool, rebuildAllResourceTextSlices, resourceTextSliceStats } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  await getPool().query("DROP TABLE IF EXISTS campus_paia.resource_analysis_groups");
  const rebuilt = await rebuildAllResourceTextSlices();
  const stats = await resourceTextSliceStats();
  return NextResponse.json({ rebuilt, stats });
}
