import { getPool } from "@/lib/db";
import { ensureRevisionGroups, revisionGroupStatus } from "@/lib/revision-groups";

export async function ensureRevisionParts() {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS campus_paia.resource_revision_parts (
      resource_code text NOT NULL REFERENCES campus_paia.resources(resource_code) ON DELETE CASCADE,
      part_index integer NOT NULL,
      group_start integer NOT NULL,
      group_end integer NOT NULL,
      content text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0,
      last_error text,
      generated_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (resource_code, part_index)
    )
  `);
  await getPool().query(`
    CREATE INDEX IF NOT EXISTS idx_resource_revision_parts_status
    ON campus_paia.resource_revision_parts(resource_code, status, part_index)
  `);
}

export async function prepareRevisionParts(resourceCode: string, groupsPerPart = 3) {
  await ensureRevisionParts();
  await ensureRevisionGroups();
  const groups = await revisionGroupStatus(resourceCode);
  if (!groups.total || groups.done !== groups.total) return { ready: false, groups };

  await getPool().query(
    `
      INSERT INTO campus_paia.resource_revision_parts (
        resource_code, part_index, group_start, group_end, status
      )
      SELECT
        $1,
        ((group_index - 1) / $2)::int + 1,
        min(group_index)::int,
        max(group_index)::int,
        'pending'
      FROM campus_paia.resource_analysis_groups
      WHERE resource_code = $1 AND status = 'done'
      GROUP BY ((group_index - 1) / $2)::int
      ON CONFLICT (resource_code, part_index) DO NOTHING
    `,
    [resourceCode, groupsPerPart],
  );

  return { ready: true, groups };
}

export async function nextRevisionPart(resourceCode: string, groupsPerPart = 3) {
  const prepared = await prepareRevisionParts(resourceCode, groupsPerPart);
  if (!prepared.ready) return null;

  const r = await getPool().query<{
    part_index: number;
    group_start: number;
    group_end: number;
  }>(
    `
      SELECT part_index, group_start, group_end
      FROM campus_paia.resource_revision_parts
      WHERE resource_code = $1
        AND status IN ('pending','error')
        AND attempts < 10
      ORDER BY part_index
      LIMIT 1
    `,
    [resourceCode],
  );
  const part = r.rows[0];
  if (!part) return null;

  const groups = await getPool().query<{ group_index: number; analysis_text: string }>(
    `
      SELECT group_index, analysis_text
      FROM campus_paia.resource_analysis_groups
      WHERE resource_code = $1
        AND group_index BETWEEN $2 AND $3
        AND status = 'done'
      ORDER BY group_index
    `,
    [resourceCode, part.group_start, part.group_end],
  );

  return {
    ...part,
    totalParts: await countRevisionParts(resourceCode),
    source: groups.rows
      .map((row) => `### Groupe ${row.group_index}\n${row.analysis_text}`)
      .join("\n\n"),
  };
}

export async function beginRevisionPart(resourceCode: string, partIndex: number) {
  await ensureRevisionParts();
  await getPool().query(
    `
      UPDATE campus_paia.resource_revision_parts
      SET status='processing', attempts=attempts+1, last_error=NULL, updated_at=now()
      WHERE resource_code=$1 AND part_index=$2
    `,
    [resourceCode, partIndex],
  );
}

export async function completeRevisionPart(resourceCode: string, partIndex: number, content: string) {
  const safe = content.replace(/\u0000/g, "").trim();
  if (!safe) throw new Error("EMPTY_REVISION_PART");
  await ensureRevisionParts();
  await getPool().query(
    `
      UPDATE campus_paia.resource_revision_parts
      SET content=$3, status='done', last_error=NULL, generated_at=now(), updated_at=now()
      WHERE resource_code=$1 AND part_index=$2
    `,
    [resourceCode, partIndex, safe],
  );
}

export async function failRevisionPart(resourceCode: string, partIndex: number, message: string) {
  await ensureRevisionParts();
  await getPool().query(
    `
      UPDATE campus_paia.resource_revision_parts
      SET status='error', last_error=$3, updated_at=now()
      WHERE resource_code=$1 AND part_index=$2
    `,
    [resourceCode, partIndex, message.slice(0, 1000)],
  );
}

export async function revisionPartStatus(resourceCode: string) {
  await ensureRevisionParts();
  const r = await getPool().query<{
    total: number;
    done: number;
    pending: number;
    processing: number;
    error: number;
  }>(
    `
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status='done')::int AS done,
        count(*) FILTER (WHERE status='pending')::int AS pending,
        count(*) FILTER (WHERE status='processing')::int AS processing,
        count(*) FILTER (WHERE status='error')::int AS error
      FROM campus_paia.resource_revision_parts
      WHERE resource_code=$1
    `,
    [resourceCode],
  );
  return r.rows[0] ?? { total: 0, done: 0, pending: 0, processing: 0, error: 0 };
}

export async function completedRevisionParts(resourceCode: string) {
  await ensureRevisionParts();
  const r = await getPool().query<{ part_index: number; content: string }>(
    `
      SELECT part_index, content
      FROM campus_paia.resource_revision_parts
      WHERE resource_code=$1 AND status='done'
      ORDER BY part_index
    `,
    [resourceCode],
  );
  return r.rows;
}

async function countRevisionParts(resourceCode: string) {
  await ensureRevisionParts();
  const r = await getPool().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM campus_paia.resource_revision_parts WHERE resource_code=$1`,
    [resourceCode],
  );
  return r.rows[0]?.count ?? 0;
}
