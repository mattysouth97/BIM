import { createHash } from "node:crypto";

/** Human-readable slugs can collide after punctuation removal or truncation.
 * Keep established unique IDs; suffix every member of a collision with a
 * stable digest of its source identity. Source references remain on the row.
 */
export function uniqueSourceIds(rows, sourceIdentity = (row) => row.ref) {
  const counts = new Map();
  for (const row of rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  const used = new Set();
  return rows.map((row) => {
    const identity = sourceIdentity(row);
    if (!identity) throw new Error(`Missing source identity for ${row.id}`);
    const id = counts.get(row.id) > 1
      ? `${row.id}-source-${createHash("sha256").update(identity).digest("hex").slice(0, 12)}`
      : row.id;
    if (used.has(id)) throw new Error(`Duplicate source identity for ${id}`);
    used.add(id);
    return id === row.id ? row : { ...row, id };
  });
}
