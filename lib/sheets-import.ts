import "server-only"
import { isSheetsConfigured, getCandidates as getSheetCandidates, writeCandidateId, type Candidate as SheetCandidate } from "./sheets"
import { getCandidates as getNeonCandidates, createCandidateRecord, type CandidateStatus } from "./db/candidates"
import { getStreams } from "./db/streams"
import { addResumeVersion } from "./db/resumes"
import { isOwnFileUrl } from "./blob"

export type ImportSkipped = { row: number; name: string; reason: string }
/** Lightweight row reference for "to import"/"imported" lists — same shape as ImportSkipped minus the reason. */
export type ImportRow = { row: number; name: string }

type ToImport = {
  row: SheetCandidate
  id: string
  status: CandidateStatus
  stream: string[]
  excludedStreams: string[]
}

type Categorized =
  | { ok: true; toImport: ToImport[]; skippedDuplicate: ImportSkipped[]; skippedInvalid: ImportSkipped[] }
  | { ok: false; error: string }

/**
 * Reads the Google Sheet and sorts every row into "will be imported" / "duplicate of an
 * existing candidate" / "invalid" — shared by the read-only preview and the real import, so
 * both always agree on what would happen. Nothing is written to Neon here.
 */
async function categorize(): Promise<Categorized> {
  if (!isSheetsConfigured()) return { ok: false, error: "Google Sheets не настроен" }

  const sheetRows = await getSheetCandidates()
  const existing = await getNeonCandidates()
  const existingIds = new Set(existing.map((c) => c.id))
  const existingEmails = new Set(existing.map((c) => c.email).filter(Boolean))
  const existingPhones = new Set(existing.map((c) => c.phone).filter(Boolean))

  // Stream / excludedStreams are validated against the active streams list (same source as the
  // options shown in CandidateEditModal/registration forms) — an unknown name is silently
  // dropped from the cell's value, it does not make the whole row invalid. Case/whitespace
  // insensitive match (like candidateMatchesStream()), but the canonical name gets written.
  const validStreamsByKey = new Map((await getStreams()).map((s) => [s.trim().toLowerCase(), s]))
  function onlyKnownStreams(values: string[]): string[] {
    return values
      .map((v) => validStreamsByKey.get(v.trim().toLowerCase()))
      .filter((v): v is string => Boolean(v))
  }

  const toImport: ToImport[] = []
  const skippedDuplicate: ImportSkipped[] = []
  const skippedInvalid: ImportSkipped[] = []

  // Sequential, not Promise.all — the dedup sets must see rows already accepted earlier in this
  // same run (two sheet rows sharing an email/id — the second one is a duplicate of the first).
  for (const row of sheetRows) {
    if (!row.name.trim()) {
      skippedInvalid.push({ row: row.rowIndex, name: row.name || "(без имени)", reason: "Не указано имя" })
      continue
    }
    if (row.id && existingIds.has(row.id)) {
      skippedDuplicate.push({ row: row.rowIndex, name: row.name, reason: `Уже импортирован (id ${row.id})` })
      continue
    }
    if (row.email && existingEmails.has(row.email)) {
      skippedDuplicate.push({ row: row.rowIndex, name: row.name, reason: `Email уже существует (${row.email})` })
      continue
    }
    if (row.phone && existingPhones.has(row.phone)) {
      skippedDuplicate.push({ row: row.rowIndex, name: row.name, reason: `Телефон уже существует (${row.phone})` })
      continue
    }

    const id = row.id || crypto.randomUUID()
    const status: CandidateStatus = row.status === "Активный" ? "Активный" : "На проверке"
    toImport.push({
      row,
      id,
      status,
      stream: onlyKnownStreams(row.stream),
      excludedStreams: onlyKnownStreams(row.excludedStreams),
    })

    existingIds.add(id)
    if (row.email) existingEmails.add(row.email)
    if (row.phone) existingPhones.add(row.phone)
  }

  return { ok: true, toImport, skippedDuplicate, skippedInvalid }
}

export type ImportPreview =
  | { ok: true; toImport: ImportRow[]; skippedDuplicate: ImportSkipped[]; skippedInvalid: ImportSkipped[] }
  | { ok: false; error: string }

/** Read-only — does not write to Neon, just reports what importCandidatesFromSheet() would do. */
export async function previewCandidatesImport(): Promise<ImportPreview> {
  const result = await categorize()
  if (!result.ok) return result
  return {
    ok: true,
    toImport: result.toImport.map(({ row }) => ({ row: row.rowIndex, name: row.name })),
    skippedDuplicate: result.skippedDuplicate,
    skippedInvalid: result.skippedInvalid,
  }
}

export type ImportResult =
  | { ok: true; imported: ImportRow[]; skippedDuplicate: ImportSkipped[]; skippedInvalid: ImportSkipped[] }
  | { ok: false; error: string }

/**
 * Re-runs the same categorization (safe even if the sheet or Neon changed since a preview —
 * dedup is recomputed from scratch) and this time actually writes the new candidates.
 */
export async function importCandidatesFromSheet(): Promise<ImportResult> {
  const result = await categorize()
  if (!result.ok) return result

  for (const { row, id, status, stream, excludedStreams } of result.toImport) {
    await createCandidateRecord({
      id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      coverLetter: row.coverLetter,
      status,
      title: row.title,
      level: row.level,
      activeSince: row.activeSince,
      stream,
      countryPrimary: row.countryPrimary,
      countryDesired: row.countryDesired,
      summary: row.summary,
      excludedCompanies: row.excludedCompanies,
      excludedStreams,
      // registrationTimestamp intentionally omitted — stays defaultNow(), the import date.
    })

    if (row.resumeUrl) {
      await addResumeVersion({
        candidateId: id,
        kind: isOwnFileUrl(row.resumeUrl) ? "file" : "link",
        url: row.resumeUrl,
        // createdAt intentionally omitted for the same reason.
      })
    }

    // The row had no id of its own — write the generated one back so a re-run of this same
    // import recognizes the row via id-based dedup instead of inserting it again.
    if (!row.id) {
      await writeCandidateId(row.rowIndex, id)
    }
  }

  const imported = result.toImport.map(({ row }) => ({ row: row.rowIndex, name: row.name }))
  return { ok: true, imported, skippedDuplicate: result.skippedDuplicate, skippedInvalid: result.skippedInvalid }
}
