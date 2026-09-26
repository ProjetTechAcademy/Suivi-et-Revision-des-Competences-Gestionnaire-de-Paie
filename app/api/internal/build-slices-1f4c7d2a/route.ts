import { NextResponse } from "next/server";
import { rebuildAllResourceTextSlices, resourceTextSliceStats } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const rebuilt = await rebuildAllResourceTextSlices();
  const stats = await resourceTextSliceStats();
  return NextResponse.json({ rebuilt, stats });
}
