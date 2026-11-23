import "server-only"
import { asc, eq } from "drizzle-orm"
import { db } from "./index"
import { companySizes } from "./schema"

export type CompanySizeRecord = { id: number; label: string; rangeHint: string }

/** Ordered by id (insertion order), not alphabetically — unlike industries/companies, these have
 * a meaningful small-to-large sequence that must be preserved in the registration form. */
export async function getCompanySizes(): Promise<CompanySizeRecord[]> {
  try {
    return await db
      .select({ id: companySizes.id, label: companySizes.label, rangeHint: companySizes.rangeHint })
      .from(companySizes)
      .orderBy(asc(companySizes.id))
  } catch {
    return []
  }
}

export async function addCompanySize(label: string, rangeHint: string): Promise<void> {
  const trimmed = label.trim()
  if (!trimmed) return
  await db.insert(companySizes).values({ label: trimmed, rangeHint: rangeHint.trim() }).onConflictDoNothing()
}

export async function updateCompanySize(id: number, data: { label: string; rangeHint: string }): Promise<void> {
  const trimmed = data.label.trim()
  if (!trimmed) return
  await db.update(companySizes).set({ label: trimmed, rangeHint: data.rangeHint.trim() }).where(eq(companySizes.id, id))
}

/** No "is this size in use" guard — same reasoning as deleteIndustry() (lib/db/industries.ts):
 * employers.companySize is a soft text reference, not an FK. */
export async function deleteCompanySize(id: number): Promise<void> {
  await db.delete(companySizes).where(eq(companySizes.id, id))
}
