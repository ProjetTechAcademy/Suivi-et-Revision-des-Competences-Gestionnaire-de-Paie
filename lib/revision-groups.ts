import { getPool, resourceSliceAnalysisStatus, ensureResourceSliceAnalysis } from "@/lib/db";

export async function ensureRevisionGroups() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS campus_paia.resource_analysis_groups (
      resource_code text NOT NULL REFERENCES campus_paia.resources(resource_code) ON DELETE CASCADE,
      group_index integer NOT NULL,
      slice_start integer NOT NULL,
      slice_end integer NOT NULL,
      analysis_text text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      analyzed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (resource_code, group_index)
    )
  `);
}

export async function prepareRevisionGroups(resourceCode: string, groupSize = 10) {
  await ensureRevisionGroups();
  await ensureResourceSliceAnalysis();
  const sliceStatus = await resourceSliceAnalysisStatus(resourceCode);
  if (!sliceStatus.total || sliceStatus.done !== sliceStatus.total) {
    return { ready: false, sliceStatus };
  }

  await getPool().query(
    `
      INSERT INTO campus_paia.resource_analysis_groups (
        resource_code, group_index, slice_start, slice_end, status
      )
      SELECT
        $1,
        ((slice_index - 1) / $2)::int + 1,
        min(slice_index)::int,
        max(slice_index)::int,
        'pending'
      FROM campus_paia.resource_slice_analysis
      WHERE resource_code = $1 AND status = 'done'
      GROUP BY ((slice_index - 1) / $2)::int
      ON CONFLICT (resource_code, group_index) DO NOTHING
    `,
    [resourceCode, groupSize],
  );

  return { ready: true, sliceStatus };
}

export async function nextRevisionGroup(resourceCode: string, groupSize = 10) {
  const prepared = await prepareRevisionGroups(resourceCode, groupSize);
  if (!prepared.ready) return null;

  const g = await getPool().query<{ group_index: number; slice_start: number; slice_end: number }>(
    `
      SELECT group_index, slice_start, slice_end
      FROM campus_paia.resource_analysis_groups
      WHERE resource_code = $1
        AND status IN ('pending','error')
        AND attempts < 8
      ORDER BY group_index
      LIMIT 1
    `,
    [resourceCode],
  );
  const group = g.rows[0];
  if (!group) return null;

  const parts = await getPool().query<{ slice_index: number; analysis_text: string }>(
    `
      SELECT slice_index, analysis_text
      FROM campus_paia.resource_slice_analysis
      WHERE resource_code = $1
        AND slice_index BETWEEN $2 AND $3
        AND status = 'done'
      ORDER BY slice_index
    `,
    [resourceCode, group.slice_start, group.slice_end],
  );

  return {
    ...group,
    content: parts.rows.map((row) => `### Tranche ${row.slice_index}\n${row.analysis_text}`).join("\n\n"),
  };
}

export async function beginRevisionGroup(resourceCode: string, groupIndex: number) {
  await ensureRevisionGroups();
  await getPool().query(
    `
      UPDATE campus_paia.resource_analysis_groups
      SET status='processing', attempts=attempts+1, last_error=NULL, updated_at=now()
      WHERE resource_code=$1 AND group_index=$2
    `,
    [resourceCode, groupIndex],
  );
}

export async function completeRevisionGroup(resourceCode: string, groupIndex: number, analysisText: string) {
  const safe = analysisText.replace(/\u0000/g, "").trim();
  if (!safe) throw new Error("EMPTY_GROUP_ANALYSIS");
  await ensureRevisionGroups();
  await getPool().query(
    `
      UPDATE campus_paia.resource_analysis_groups
      SET analysis_text=$3, status='done', last_error=NULL, analyzed_at=now(), updated_at=now()
      WHERE resource_code=$1 AND group_index=$2
    `,
    [resourceCode, groupIndex, safe],
  );
}

export async function failRevisionGroup(resourceCode: string, groupIndex: number, message: string) {
  await ensureRevisionGroups();
  await getPool().query(
    `
      UPDATE campus_paia.resource_analysis_groups
      SET status='error', last_error=$3, updated_at=now()
      WHERE resource_code=$1 AND group_index=$2
    `,
    [resourceCode, groupIndex, message.slice(0, 1000)],
  );
}

export async function revisionGroupStatus(resourceCode: string) {
  await ensureRevisionGroups();
  const r = await getPool().query<{ total: number; done: number; pending: number; processing: number; error: number }>(
    `
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status='done')::int AS done,
        count(*) FILTER (WHERE status='pending')::int AS pending,
        count(*) FILTER (WHERE status='processing')::int AS processing,
        count(*) FILTER (WHERE status='error')::int AS error
      FROM campus_paia.resource_analysis_groups
      WHERE resource_code=$1
    `,
    [resourceCode],
  );
  return r.rows[0] ?? { total: 0, done: 0, pending: 0, processing: 0, error: 0 };
}

export async function completedRevisionGroups(resourceCode: string) {
  await ensureRevisionGroups();
  const r = await getPool().query<{ group_index: number; analysis_text: string }>(
    `
      SELECT group_index, analysis_text
      FROM campus_paia.resource_analysis_groups
      WHERE resource_code=$1 AND status='done'
      ORDER BY group_index
    `,
    [resourceCode],
  );
  return r.rows;
}
