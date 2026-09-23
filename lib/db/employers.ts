import "server-only"
import { eq } from "drizzle-orm"
import { db } from "./index"
import { employers } from "./schema"
import type { Profile } from "../sheets"

export type EmployerStatus = "На проверке" | "Подтверждён" | "Отклонён"

export type Employer = {
  token: string
  name: string
  company: string
  email: string
  phone: string
  primaryContact: string
  telegram: string
  linkedin: string
  streams: string[]
  status: EmployerStatus
  country: string
  additionalCountries: string[]
  timestamp: string
}

function toEmployer(row: typeof employers.$inferSelect): Employer {
  return {
    token: row.token,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    primaryContact: row.primaryContact,
    telegram: row.telegram,
    linkedin: row.linkedin,
    streams: row.streams,
    status: row.status as EmployerStatus,
    country: row.country,
    additionalCountries: row.additionalCountries,
    timestamp: row.timestamp.toISOString(),
  }
}

/** Fetch all employers. */
export async function getEmployers(): Promise<Employer[]> {
  try {
    const rows = await db.select().from(employers)
    return rows.map(toEmployer)
  } catch {
    return []
  }
}

/** Find a single employer by their token. Returns undefined if not found. */
export async function getEmployerByToken(token: string): Promise<Employer | undefined> {
  if (!token) return undefined
  const rows = await db.select().from(employers).where(eq(employers.token, token)).limit(1)
  return rows[0] ? toEmployer(rows[0]) : undefined
}

/** Employers subscribed to a given stream. Currently unused, kept for parity with the pre-migration API. */
export async function getEmployersByStream(stream: string): Promise<Employer[]> {
  const all = await getEmployers()
  return all.filter((e) => e.streams.some((s) => s.toLowerCase() === stream.toLowerCase()))
}

/**
 * Confirmed employers subscribed to a given stream — mirrors getCandidatesForStream()
 * (lib/sheets.ts, TASK-27): filters an already-loaded array instead of querying per stream,
 * so a page listing all streams does one fetch instead of one per stream.
 */
export function confirmedEmployersForStream(employers: Employer[], stream: { name: string }): Employer[] {
  const name = stream.name.trim().toLowerCase()
  if (!name) return []
  return employers.filter(
    (e) => e.status === "Подтверждён" && e.streams.some((s) => s.trim().toLowerCase() === name),
  )
}

/**
 * Filter candidates for a specific employer, removing those who have excluded
 * the employer's company or industry from their preferences.
 */
export function filterCandidatesForEmployer(candidates: Profile[], employer: Employer): Profile[] {
  const companyLower = employer.company.trim().toLowerCase()
  const industryLower = employer.streams.map((s) => s.trim().toLowerCase())

  // "Любая" in additionalCountries means employer accepts all countries → skip geo filter
  const anyCountry = employer.additionalCountries.some(
    (c) => c.trim().toLowerCase() === "любая",
  )
  const employerCountries = anyCountry
    ? null
    : new Set(
        [employer.country, ...employer.additionalCountries]
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean),
      )

  return candidates.filter((c) => {
    if (companyLower && c.excludedCompanies.some((ec) => ec.toLowerCase() === companyLower)) {
      return false
    }
    if (industryLower.length && c.excludedIndustries.some((ei) => industryLower.includes(ei.toLowerCase()))) {
      return false
    }
    if (employerCountries !== null) {
      const primary = c.countryPrimary.trim().toLowerCase()
      const desired = c.countryDesired.trim().toLowerCase()
      if (!primary && !desired) return false
      if (!(primary && employerCountries.has(primary)) && !(desired && employerCountries.has(desired))) {
        return false
      }
    }
    return true
  })
}

/** Create a new employer row. `token`/`timestamp` are optional — pass them only to preserve
 * original values during a one-off backfill; normal registrations omit them and get generated ones. */
export async function createEmployer(data: {
  token?: string
  name: string
  company: string
  email: string
  phone: string
  primaryContact: string
  telegram: string
  linkedin: string
  streams: string[]
  status: EmployerStatus
  country: string
  additionalCountries: string[]
  timestamp?: Date
}): Promise<void> {
  await db.insert(employers).values(data)
}

/** Update specific editable fields (including status) of an employer by token. */
export async function updateEmployerFields(
  token: string,
  data: Partial<{
    name: string
    company: string
    email: string
    phone: string
    primaryContact: string
    telegram: string
    linkedin: string
    streams: string[]
    status: EmployerStatus
    country: string
    additionalCountries: string[]
  }>,
): Promise<void> {
  await db.update(employers).set(data).where(eq(employers.token, token))
}

/** Permanently delete an employer. */
export async function deleteEmployer(token: string): Promise<void> {
  await db.delete(employers).where(eq(employers.token, token))
}
