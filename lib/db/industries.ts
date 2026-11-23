import "server-only"
import { asc, eq, ilike } from "drizzle-orm"
import { db } from "./index"
import { industries } from "./schema"

export type IndustryRecord = { id: number; name: string }

/** Active list for the employer-registration form's industry picker — alphabetical, same
 * convention as getStreams()/getCompanies(). Seeded at migration time from the Industry-type
 * streams that existed then, but intentionally independent going forward (see schema.ts). */
export async function getIndustries(): Promise<IndustryRecord[]> {
  try {
    return await db.select({ id: industries.id, name: industries.name }).from(industries).orderBy(asc(industries.name))
  } catch {
    return []
  }
}

/** Case-insensitive find-or-create — same de-duplication shape as findOrCreateCompanyByName(),
 * used by the "also add to industries" checkbox on /editor/streams (components/streams-table.tsx). */
export async function addIndustry(name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  const existing = await db.select({ id: industries.id }).from(industries).where(ilike(industries.name, trimmed)).limit(1)
  if (existing[0]) return
  await db.insert(industries).values({ name: trimmed }).onConflictDoNothing()
}

export async function updateIndustry(id: number, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db.update(industries).set({ name: trimmed }).where(eq(industries.id, id))
}

/** No "is this industry in use" guard — employers.industry is a soft text reference (same as
 * employers.streams/candidates.stream), not an FK; deleting a reference row never touches
 * already-saved employer rows, only removes it from future registration forms. */
export async function deleteIndustry(id: number): Promise<void> {
  await db.delete(industries).where(eq(industries.id, id))
}
