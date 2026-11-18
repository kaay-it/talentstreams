import "server-only"
import { and, asc, count, eq, gte, ilike, inArray, lte, ne, or, sql } from "drizzle-orm"
import { db } from "./index"
import { candidates } from "./schema"
import { getSetting, setSetting } from "./settings"

// Not imported from lib/db/mailing-lists.ts (which has the identical isoToRu()) because that
// module needs getActiveCandidates() from this one — importing back would create a module cycle.
function isoToRu(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

export type CandidateStatus = "На проверке" | "Активный" | "Отклонён" | "Не публиковать"

export type Candidate = {
  id: string
  name: string
  title: string
  email: string
  phone: string
  stream: string[]
  level: string
  countryPrimary: string
  countryDesired: string
  summary: string
  excludedCompanies: string[]
  excludedStreams: string[]
  status: CandidateStatus
  /** ru-RU text, e.g. "21.07.2026" — "" means not set (candidate always passes the availability
   * filter). Stored in Postgres as a native nullable date; converted at this module's boundary
   * so the rest of the app (toISODate/toRuDate in candidate-form-modal.tsx, approveCandidate(),
   * the pure filter helpers below) keeps working with the same ru-RU string it always has. */
  activeSince: string
  timestamp: string
  coverLetter: string
}

/** ru-RU "21.07.2026" -> ISO "2026-07-21"; "" or unparsable -> null. Inverse of isoToRu(). */
function ruToIso(ru: string): string | null {
  const m = ru.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}

function toCandidate(row: typeof candidates.$inferSelect): Candidate {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    email: row.email ?? "",
    phone: row.phone ?? "",
    stream: row.stream,
    level: row.level,
    countryPrimary: row.countryPrimary,
    countryDesired: row.countryDesired,
    summary: row.summary,
    excludedCompanies: row.excludedCompanies,
    excludedStreams: row.excludedStreams,
    status: row.status as CandidateStatus,
    activeSince: row.activeSince ? isoToRu(row.activeSince) : "",
    timestamp: row.registrationTimestamp.toISOString(),
    coverLetter: row.coverLetter,
  }
}

/** Every candidate, any status — editor moderation (was getCandidates() in lib/sheets.ts). */
export async function getCandidates(): Promise<Candidate[]> {
  try {
    const rows = await db.select().from(candidates).orderBy(asc(candidates.registrationTimestamp))
    return rows.map(toCandidate)
  } catch {
    return []
  }
}

/** Only "Активный" candidates — the public side (was getProfiles() in lib/sheets.ts). */
export async function getActiveCandidates(): Promise<Candidate[]> {
  try {
    const rows = await db.select().from(candidates).where(eq(candidates.status, "Активный"))
    return rows.map(toCandidate)
  } catch {
    return []
  }
}

/** "Активный" + "Не публиковать" — anyone who was confirmed and not explicitly rejected.
 * "Не публиковать" is a manual pause (app/actions.ts pauseCandidate()) that only excludes a
 * candidate from new release selections, not that the candidate themselves was rejected — they
 * still belong in SendPulse books / candidate-facing emails (the monthly digest, see
 * app/actions.ts runCandidateDigest()). */
export async function getConfirmedCandidates(): Promise<Candidate[]> {
  try {
    const rows = await db.select().from(candidates).where(inArray(candidates.status, ["Активный", "Не публиковать"]))
    return rows.map(toCandidate)
  } catch {
    return []
  }
}

/** A single candidate by id, any status (was getProfile() in lib/sheets.ts — used by the
 * editor's own candidate link, which must work regardless of moderation status). */
export async function getCandidateById(id: string): Promise<Candidate | null> {
  const rows = await db.select().from(candidates).where(eq(candidates.id, id)).limit(1)
  return rows[0] ? toCandidate(rows[0]) : null
}

export type CandidateSearchFilters = {
  query?: string
  status?: CandidateStatus
  stream?: string
  level?: string
  /** ISO date "YYYY-MM-DD", inclusive — compared against registrationTimestamp. */
  registeredFrom?: string
  registeredTo?: string
  /** Candidates with no summary written yet — the ones most worth summarizing a resume for
   * (TASK-64, added specifically for the MCP search_candidates tool, nowhere in the UI). */
  summaryEmpty?: boolean
  /** Clamped to [1, 50], default 20 — see searchCandidates(). */
  limit?: number
  /** Clamped to >= 0, default 0. */
  offset?: number
}

/** Short card for list results (search_candidates) — never the full Candidate (no coverLetter/
 * summary/email/phone), so a page of results stays small regardless of how much text a
 * candidate's full record holds. Full detail is a separate get_candidate(id) call. */
export type CandidateSummary = {
  id: string
  name: string
  title: string
  status: CandidateStatus
  stream: string[]
  level: string
  timestamp: string
  hasSummary: boolean
}

export type CandidateSearchResult = {
  total: number
  limit: number
  offset: number
  items: CandidateSummary[]
}

function candidateSearchConditions(filters: CandidateSearchFilters) {
  const conditions = []
  if (filters.status) conditions.push(eq(candidates.status, filters.status))
  if (filters.level) conditions.push(eq(candidates.level, filters.level))
  // btrim(...) = '' (not eq(summary, "")) so this stays consistent with hasSummary below, which
  // treats a whitespace-only summary as "no summary" too.
  if (filters.summaryEmpty) conditions.push(sql`btrim(${candidates.summary}) = ''`)
  if (filters.stream?.trim()) {
    const needle = filters.stream.trim().toLowerCase()
    conditions.push(sql`exists (select 1 from unnest(${candidates.stream}) as elem where lower(btrim(elem)) = ${needle})`)
  }
  if (filters.query?.trim()) {
    const needle = `%${filters.query.trim()}%`
    conditions.push(or(ilike(candidates.name, needle), ilike(candidates.email, needle), ilike(candidates.phone, needle)))
  }
  if (filters.registeredFrom) conditions.push(gte(candidates.registrationTimestamp, new Date(`${filters.registeredFrom}T00:00:00.000Z`)))
  if (filters.registeredTo) conditions.push(lte(candidates.registrationTimestamp, new Date(`${filters.registeredTo}T23:59:59.999Z`)))
  return and(...conditions)
}

/**
 * Server-side search + pagination for the MCP search_candidates tool — filtering AND
 * LIMIT/OFFSET both happen in the SQL query, not by fetching every candidate into memory and
 * slicing (the first TASK-64 version did that, fine for a small table but not something to keep
 * once the candidate table grows — every search call would otherwise pull the whole table over
 * the wire regardless of how narrow the filters or how small the requested page is).
 * Best-effort like every other read in this module: a query failure returns an empty page
 * rather than throwing.
 */
export async function searchCandidates(filters: CandidateSearchFilters): Promise<CandidateSearchResult> {
  const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 20), 1), 50)
  const offset = Math.max(Math.trunc(filters.offset ?? 0), 0)
  const where = candidateSearchConditions(filters)

  try {
    const [[{ total }], rows] = await Promise.all([
      db.select({ total: count() }).from(candidates).where(where),
      db
        .select({
          id: candidates.id,
          name: candidates.name,
          title: candidates.title,
          status: candidates.status,
          stream: candidates.stream,
          level: candidates.level,
          registrationTimestamp: candidates.registrationTimestamp,
          summary: candidates.summary,
        })
        .from(candidates)
        .where(where)
        .orderBy(asc(candidates.registrationTimestamp))
        .limit(limit)
        .offset(offset),
    ])

    return {
      total,
      limit,
      offset,
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        title: r.title,
        status: r.status as CandidateStatus,
        stream: r.stream,
        level: r.level,
        timestamp: r.registrationTimestamp.toISOString(),
        hasSummary: r.summary.trim() !== "",
      })),
    }
  } catch {
    return { total: 0, limit, offset, items: [] }
  }
}

/** Distinct non-empty `level` values across all candidates, sorted — level has no fixed enum
 * anywhere in the app (free-text field, see candidate-form-modal.tsx), so this is the same
 * "what values actually exist" computation candidate-section.tsx already does client-side for
 * its level filter dropdown, just server-side. Used by the MCP get_summary_guide tool to fill
 * in the {{LEVELS}} reference list — the guide needs to recommend real, currently-used values,
 * not an invented fixed list. */
export async function getDistinctLevels(): Promise<string[]> {
  try {
    const rows = await db.selectDistinct({ level: candidates.level }).from(candidates).where(ne(candidates.level, ""))
    return rows.map((r) => r.level).sort((a, b) => a.localeCompare(b, "ru"))
  } catch {
    return []
  }
}

/** Creates a new candidate in one INSERT (unlike the old Sheets append+update two-step). `id` is
 * generated by the caller (app/actions.ts needs it immediately for addResumeVersion()). */
export async function createCandidateRecord(data: {
  id: string
  name: string
  email: string
  phone: string
  coverLetter: string
  status: CandidateStatus
  title?: string
  level?: string
  activeSince?: string
  stream?: string[]
  countryPrimary?: string
  countryDesired?: string
  summary?: string
  excludedCompanies?: string[]
  excludedStreams?: string[]
}): Promise<void> {
  await db.insert(candidates).values({
    id: data.id,
    name: data.name,
    email: data.email || null,
    phone: data.phone || null,
    coverLetter: data.coverLetter,
    status: data.status,
    title: data.title ?? "",
    level: data.level ?? "",
    activeSince: ruToIso(data.activeSince ?? ""),
    stream: data.stream ?? [],
    countryPrimary: data.countryPrimary ?? "",
    countryDesired: data.countryDesired ?? "",
    summary: data.summary ?? "",
    excludedCompanies: data.excludedCompanies ?? [],
    excludedStreams: data.excludedStreams ?? [],
  })
}

/** Update specific editable fields of a candidate by id (was updateCandidateFields(rowIndex, ...)
 * in lib/sheets.ts). Arrays are passed as native string[] — no more join(", ")/parseMultiValue(). */
export async function updateCandidateFields(
  id: string,
  data: Partial<{
    name: string
    email: string
    phone: string
    coverLetter: string
    stream: string[]
    level: string
    countryPrimary: string
    countryDesired: string
    activeSince: string
    title: string
    summary: string
    excludedCompanies: string[]
    excludedStreams: string[]
  }>,
): Promise<void> {
  const { activeSince, email, phone, ...rest } = data
  await db
    .update(candidates)
    .set({
      ...rest,
      ...(activeSince !== undefined && { activeSince: ruToIso(activeSince) }),
      ...(email !== undefined && { email: email || null }),
      ...(phone !== undefined && { phone: phone || null }),
    })
    .where(eq(candidates.id, id))
}

export async function updateCandidateStatus(
  id: string,
  status: CandidateStatus,
  activeSince?: string,
): Promise<void> {
  await db
    .update(candidates)
    .set({
      status,
      ...(activeSince !== undefined && { activeSince: ruToIso(activeSince) }),
    })
    .where(eq(candidates.id, id))
}

/** Permanently deletes a candidate. candidateResumes/selectionEntries rows cascade-delete
 * automatically (FK ON DELETE CASCADE — a resume or a подборка membership means nothing without
 * the candidate it belongs to); contactRequests referencing this id is set to NULL (FK ON DELETE
 * SET NULL) — that history is kept, just unlinked. Caller still handles Vercel Blob cleanup. */
export async function deleteCandidateRecord(id: string): Promise<void> {
  await db.delete(candidates).where(eq(candidates.id, id))
}

/** Builds the exact string that gets embedded for duplicate detection (TASK-55) — stored verbatim
 * in embeddingSourceText so a later scan can detect staleness without re-calling Gemini. Only
 * fields that distinguish *who* a person is, not moderation/contact fields (those legitimately
 * differ between two duplicate registrations of the same person). Includes coverLetter alongside
 * summary (TASK-57) — caught live: a real duplicate pair had summary empty on one side and
 * coverLetter empty on the other (714 vs 875 chars, opposite fields filled), so summary-only
 * starved one side's embedding of real content even though the person had written plenty. */
export function buildEmbeddingSourceText(c: { name: string; title: string; summary: string; coverLetter: string }): string {
  return [c.name, c.title, c.summary, c.coverLetter].map((s) => s.trim()).filter(Boolean).join(" — ")
}

/** Candidates whose current source text doesn't match the cached embeddingSourceText, OR who have
 * no embedding at all (including a candidate whose previous Gemini call failed — embedding stays
 * null but embeddingSourceText is still written, see setCandidateEmbedding(), so this must check
 * embedding IS NULL separately or such a candidate would never be retried). Any status included —
 * a duplicate pair isn't necessarily both "На проверке". */
export async function getCandidatesNeedingEmbedding(): Promise<{ id: string; sourceText: string }[]> {
  const rows = await db.select().from(candidates)
  return rows
    .map((r) => ({ id: r.id, sourceText: buildEmbeddingSourceText(r), embedding: r.embedding, embeddingSourceText: r.embeddingSourceText }))
    .filter((r) => r.embedding === null || r.embeddingSourceText !== r.sourceText)
    .map(({ id, sourceText }) => ({ id, sourceText }))
}

/** Writes a freshly computed embedding (or null, if the Gemini call failed for this candidate —
 * still records sourceText so a retry is attempted on the next scan even if the text hasn't
 * changed again). */
export async function setCandidateEmbedding(id: string, embedding: number[] | null, sourceText: string): Promise<void> {
  await db.update(candidates).set({ embedding, embeddingSourceText: sourceText }).where(eq(candidates.id, id))
}

/** All candidate pairs whose embeddings' cosine similarity is >= threshold, computed entirely in
 * Postgres via pgvector's `<=>` (cosine distance) operator — no vectors are pulled into Node.
 * `a.id < b.id` just avoids self-pairs and duplicate (B,A)/(A,B) pairs; pair order carries no
 * meaning. Sorted by similarity descending. */
export async function findSimilarCandidatePairs(threshold: number): Promise<
  { candidateAId: string; candidateBId: string; similarity: number }[]
> {
  const result = await db.execute<{ candidateAId: string; candidateBId: string; similarity: number }>(sql`
    SELECT a.id AS "candidateAId", b.id AS "candidateBId", 1 - (a.embedding <=> b.embedding) AS similarity
    FROM ${candidates} a
    JOIN ${candidates} b ON a.id < b.id
    WHERE a.embedding IS NOT NULL AND b.embedding IS NOT NULL
      AND 1 - (a.embedding <=> b.embedding) >= ${threshold}
    ORDER BY similarity DESC
  `)
  return result.rows
}

const DUPLICATE_THRESHOLD_SETTING = "candidateDuplicateSimilarityThreshold"
// Checked live against the real candidate pool (TASK-56): 0.93 found exactly 7 pairs, all
// genuine duplicates (100% precision) — see app/actions.ts findDuplicateCandidates() for why
// lowering this uniformly isn't viable (315 pairs at 0.80, 2343 at 0.75, tens of thousands near
// the 0.68 needed to catch a "thin profile" miss). Still user-adjustable (TASK-57) because the
// right value can shift as the candidate pool grows — this default is just where it starts.
const DEFAULT_DUPLICATE_THRESHOLD = 0.93

/** User-set threshold (0..1) from /editor/settings, if any; otherwise the data-backed default. */
export async function getDuplicateSimilarityThreshold(): Promise<number> {
  const v = await getSetting(DUPLICATE_THRESHOLD_SETTING)
  const n = v === null ? NaN : Number(v)
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_DUPLICATE_THRESHOLD
}

export async function setDuplicateSimilarityThreshold(value: number): Promise<void> {
  await setSetting(DUPLICATE_THRESHOLD_SETTING, "number", String(value))
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh", "з": "z",
  "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
  "с": "s", "т": "t", "у": "u", "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh",
  "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}

function transliterate(s: string): string {
  const latin = s.toLowerCase().split("").map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch).join("")
  // "й"/trailing "-ей"/"-ий" is transliterated inconsistently in practice as "i" or "y"
  // (Sergei vs Sergey) — collapse both spellings to the same canonical letter, or two real
  // spellings of the same name would fail to match.
  return latin.replace(/[yj]/g, "i")
}

function nameTokens(name: string): string[] {
  return name.split(/[\s-]+/).map((t) => transliterate(t).replace(/[^a-z]/g, "")).filter(Boolean)
}

/** True if the SHORTER name's token set is fully contained in the longer one's (TASK-57) — an
 * embedding-independent signal specifically for "thin" profiles whose embedding carries little
 * signal beyond the bare name. Catches word-order swaps (Иванов Пётр ~ Пётр Иванов),
 * transliteration (Андрей ~ Andrei), and a missing/extra patronymic (Иванов Пётр ~ Иванов Пётр
 * Сергеевич). Requires at least 2 tokens on the shorter side — otherwise two unrelated people who
 * merely share one common surname would match on that single token alone. Known limitation,
 * deliberately not addressed: no single transliteration standard for х/ц/щ (kh/h, ts/c,
 * shch/sch) — only the common "й→i/y" ambiguity above is normalized. */
export function namesLikelyMatch(nameA: string, nameB: string): boolean {
  const a = new Set(nameTokens(nameA))
  const b = new Set(nameTokens(nameB))
  const [shorter, longer] = a.size <= b.size ? [a, b] : [b, a]
  if (shorter.size < 2) return false
  for (const t of shorter) if (!longer.has(t)) return false
  return true
}

/**
 * True if a candidate is tagged into the given stream via the `stream` multi-select — what
 * editors actually populate today (ported from lib/sheets.ts, TASK-27).
 */
function candidateMatchesStream(candidate: Candidate, stream: { name: string }): boolean {
  const name = stream.name.trim().toLowerCase()
  if (!name) return false
  return candidate.stream.some((s) => s.trim().toLowerCase() === name)
}

/** Active candidates tagged into the given stream. */
export function getCandidatesForStream(candidates: Candidate[], stream: { name: string }): Candidate[] {
  return candidates.filter((c) => candidateMatchesStream(c, stream))
}

/** Parses the ru-RU "Active Since" text into a timestamp. null = empty/unparseable, meaning
 * "always eligible" — callers must treat null as a pass, not a fail. */
function parseRuDate(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  return new Date(Number(y), Number(mo) - 1, Number(d)).getTime()
}

/**
 * Candidates eligible for a new release of the given stream: tagged into the stream and already
 * active — activeSince is empty (never set, always-eligible) or on/before today.
 */
export function getEligibleCandidatesForRelease(candidates: Candidate[], stream: { name: string }): Candidate[] {
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  return getCandidatesForStream(candidates, stream).filter((c) => {
    const t = parseRuDate(c.activeSince)
    return t === null || t <= todayEnd.getTime()
  })
}

/** The complement of getEligibleCandidatesForRelease() — candidates whose pause hasn't ended yet. */
export function getPausedCandidatesForRelease(candidates: Candidate[], stream: { name: string }): Candidate[] {
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 999)
  return getCandidatesForStream(candidates, stream).filter((c) => {
    const t = parseRuDate(c.activeSince)
    return t !== null && t > todayEnd.getTime()
  })
}
