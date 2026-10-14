import "server-only"
import { asc, eq, ilike } from "drizzle-orm"
import { db } from "./index"
import { companies, employers } from "./schema"

export type CompanyRecord = { id: number; name: string }

export type CompanyWithEmployees = CompanyRecord & {
  employers: { token: string; name: string; status: string }[]
}

/** Placeholder company for employers who registered before this field was required
 * (backfilled, TASK — companies normalization) — a real row in `companies`, not a sentinel
 * value, so it shows up in /editor/companies like any other and can be reassigned later. */
export const UNKNOWN_COMPANY_NAME = "Не определено"

export async function getCompanies(): Promise<CompanyRecord[]> {
  try {
    return await db.select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name))
  } catch {
    return []
  }
}

/** Prefix/substring match for the registration-form autocomplete, newest-typed-first isn't
 * meaningful here — alphabetical, capped so a generic query (e.g. "ООО") doesn't flood the
 * dropdown. */
export async function searchCompanies(query: string): Promise<CompanyRecord[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  const rows = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(ilike(companies.name, `%${trimmed}%`))
    .orderBy(asc(companies.name))
    .limit(10)
  return rows
}

/** Case-insensitive, trimmed find-or-create — the actual de-duplication mechanism: an
 * employer picking a suggestion from the autocomplete reuses the exact existing row, and
 * someone typing a name that only differs by case/whitespace from an existing company still
 * reuses it rather than creating a near-duplicate. Only a genuinely new name creates a row. */
export async function findOrCreateCompanyByName(name: string): Promise<number> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Название компании не может быть пустым")

  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(ilike(companies.name, trimmed))
    .limit(1)
  if (existing[0]) return existing[0].id

  const [created] = await db.insert(companies).values({ name: trimmed }).returning({ id: companies.id })
  return created.id
}

export async function getCompanyById(id: number): Promise<CompanyRecord | null> {
  const rows = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, id)).limit(1)
  return rows[0] ?? null
}

/** Companies with their people, for the /editor/companies expand/collapse list. One query
 * via a left join (not N+1) — companies without any linked employer still appear, with an
 * empty list. */
export async function getCompaniesWithEmployers(): Promise<CompanyWithEmployees[]> {
  const rows = await db
    .select({
      companyId: companies.id,
      companyName: companies.name,
      employerToken: employers.token,
      employerName: employers.name,
      employerStatus: employers.status,
    })
    .from(companies)
    .leftJoin(employers, eq(employers.companyId, companies.id))
    .orderBy(asc(companies.name), asc(employers.name))

  const byId = new Map<number, CompanyWithEmployees>()
  for (const row of rows) {
    let company = byId.get(row.companyId)
    if (!company) {
      company = { id: row.companyId, name: row.companyName, employers: [] }
      byId.set(row.companyId, company)
    }
    if (row.employerToken) {
      company.employers.push({ token: row.employerToken, name: row.employerName ?? "", status: row.employerStatus ?? "" })
    }
  }
  return [...byId.values()]
}
