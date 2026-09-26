import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  const r = await getPool().query(`
    SELECT s.resource_code, count(*)::int AS slices, max(r.title) AS title
    FROM campus_paia.resource_text_slices s
    JOIN campus_paia.resources r ON r.resource_code = s.resource_code
    GROUP BY s.resource_code
    HAVING count(*) BETWEEN 16 AND 24
    ORDER BY count(*) ASC, s.resource_code
    LIMIT 8
  `);
  return NextResponse.json(r.rows);
}
