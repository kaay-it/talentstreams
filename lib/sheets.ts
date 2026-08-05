import "server-only"
import { createSign } from "crypto"

/** Moderation status of a candidate. Empty string = legacy row without this column (treated as "Активный"). */
export type CandidateStatus = "На проверке" | "Активный" | "Отклонён"

/**
 * A single profile/visiting-card record from the main Candidates Database sheet.
 * Registration form submissions write basic fields here (id, name, email, phone,
 * cover letter, resume url, status "На проверке"). Editor enriches the remaining
 * fields (title, bio, stream, level, etc.) and approves/rejects via the editor UI.
 * Columns are read dynamically from the header row — any extra columns land in `extra`.
 */
export type Profile = {
  id: string
  name: string
  title: string
  bio: string
  email: string
  phone: string
  website: string
  location: string
  /** One or more stream tags from a multi-select dropdown in the sheet. */
  stream: string[]
  // ── Distribution tags (§5 spec) ───────────────────────────────────────────
  level: string
  industry: string
  func: string
  countryPrimary: string
  countryDesired: string
  summary: string
  excludedCompanies: string[]
  excludedIndustries: string[]
  // ── Registration / moderation fields ──────────────────────────────────────
  /** Empty string = legacy row without status column → treated as "Активный". */
  status: CandidateStatus | ""
  activeSince: string
  registrationTimestamp: string
  coverLetter: string
  resumeUrl: string
  extra: Record<string, string>
}

const SHEET_RANGE = "A1:Z1000"
const MAILING_LIST_RANGE = "'Mailing lists'!A1:Z1000"

const MAILING_LIST_COL_ALIASES: Record<string, string> = {
  "list id": "list_id",
  "candidate id": "candidate_id",
}

/**
 * Normalize a private key value coming from an env var.
 * Handles: surrounding quotes, escaped "\n" newlines (the common case on
 * Windows / Vercel), and trims stray whitespace.
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim()
  // Strip wrapping quotes if the whole JSON value was pasted with them.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1)
  }
  // Convert literal "\n" sequences into real newlines.
  key = key.replace(/\\n/g, "\n")
  return key
}

function isValidPrivateKey(key: string): boolean {
  return key.includes("-----BEGIN") && key.includes("PRIVATE KEY-----")
}

/** Resolve the service-account email + private key from GOOGLE_SERVICE_ACCOUNT_JSON. */
function resolveCredentials(): { email: string; privateKey: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!json?.trim()) return null

  try {
    const parsed = JSON.parse(json.trim())
    const email = parsed.client_email as string | undefined
    const rawKey = parsed.private_key as string | undefined
    if (email && rawKey) {
      return { email, privateKey: normalizePrivateKey(rawKey) }
    }
  } catch {
    // invalid JSON
  }
  return null
}

function getEnv() {
  const sheetId = process.env.GOOGLE_SHEET_ID
  const creds = resolveCredentials()
  if (!creds || !sheetId) {
    throw new Error(
      "Missing Google Sheets configuration. Provide GOOGLE_SHEET_ID and GOOGLE_SERVICE_ACCOUNT_JSON.",
    )
  }

  if (!isValidPrivateKey(creds.privateKey)) {
    throw new Error(
      'Private key does not look like a PEM block. Use the "private_key" field ' +
        'from the service-account JSON (starts with "-----BEGIN PRIVATE KEY-----"), NOT "private_key_id".',
    )
  }
  return { email: creds.email, privateKey: creds.privateKey, sheetId }
}

async function getAccessToken(
  email: string,
  privateKey: string,
  scope = "https://www.googleapis.com/auth/spreadsheets.readonly",
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iss: email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }

  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const unsigned = `${encode(header)}.${encode(payload)}`
  const sign = createSign("RSA-SHA256")
  sign.update(unsigned)
  const signature = sign.sign(privateKey, "base64url")
  const jwt = `${unsigned}.${signature}`

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google OAuth token request failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error("Google OAuth token response did not include access_token.")
  }
  return data.access_token
}

async function fetchSheetValues(sheetId: string, range: string): Promise<string[][]> {
  const { email, privateKey } = getEnv()
  const token = await getAccessToken(email, privateKey)
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
    encodeURIComponent(range)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google Sheets API request failed (${res.status}): ${body}`)
  }

  const data = (await res.json()) as { values?: string[][] }
  return data.values ?? []
}

const KNOWN_KEYS = [
  "id", "name", "title", "bio", "email", "phone", "website", "location", "stream",
  "level", "industry", "func", "countryPrimary", "countryDesired", "summary",
  "excludedCompanies", "excludedIndustries",
  "status", "activeSince", "registrationTimestamp", "coverLetter", "resumeUrl",
]

const HEADER_ALIASES: Record<string, (typeof KNOWN_KEYS)[number]> = {
  id: "id",
  name: "name",
  кандидат: "name",
  title: "title",
  роль: "title",
  bio: "bio",
  резюме: "bio",
  email: "email",
  phone: "phone",
  website: "website",
  location: "location",
  stream: "stream",
  стрим: "stream",
  level: "level",
  уровень: "level",
  industry: "industry",
  отрасль: "industry",
  function: "func",
  функция: "func",
  "country primary": "countryPrimary",
  "страна текущая": "countryPrimary",
  "основная страна": "countryPrimary",
  "country desired": "countryDesired",
  "страна желаемая": "countryDesired",
  "желаемая страна": "countryDesired",
  summary: "summary",
  саммари: "summary",
  "excluded companies": "excludedCompanies",
  "исключённые компании": "excludedCompanies",
  "excluded industries": "excludedIndustries",
  "исключённые отрасли": "excludedIndustries",
  "status": "status",
  "статус": "status",
  "active since": "activeSince",
  "timestamp": "registrationTimestamp",
  "cover letter": "coverLetter",
  "сопроводительное письмо": "coverLetter",
  "resume url": "resumeUrl",
  "ссылка на резюме": "resumeUrl",
}

function mapHeader(header: string): string {
  const key = header.trim().toLowerCase()
  return HEADER_ALIASES[key] ?? key
}

function getIdColumnIndex(headers: string[]): number {
  const idx = headers.findIndex((h) => h.trim().toLowerCase() === "id")
  return idx >= 0 ? idx : 0
}

function rowToRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {}
  headers.forEach((header, i) => {
    const rawKey = header.trim().toLowerCase()
    if (!rawKey) return
    const value = (row[i] ?? "").trim()
    const field = mapHeader(header)
    if (KNOWN_KEYS.includes(field)) {
      record[field] = value
    } else {
      record[rawKey] = value
    }
  })
  return record
}

function resolveRowId(headers: string[], row: string[], record: Record<string, string>): string {
  const idCol = getIdColumnIndex(headers)
  return record.id || (row[idCol] ?? "").trim() || slugify(record.name || "")
}

function buildProfile(headers: string[], row: string[]): Profile {
  const record = rowToRecord(headers, row)
  const extra: Record<string, string> = {}
  for (const [k, v] of Object.entries(record)) {
    if (!KNOWN_KEYS.includes(k) && v) extra[k] = v
  }

  return {
    id: resolveRowId(headers, row, record),
    name: record.name || "",
    title: record.title || "",
    bio: record.bio || "",
    email: record.email || "",
    phone: record.phone || "",
    website: record.website || "",
    location: record.location || "",
    stream: parseMultiValue(record.stream || ""),
    level: record.level || "",
    industry: record.industry || "",
    func: record.func || "",
    countryPrimary: record.countryPrimary || "",
    countryDesired: record.countryDesired || "",
    summary: record.summary || "",
    excludedCompanies: parseMultiValue(record.excludedCompanies || ""),
    excludedIndustries: parseMultiValue(record.excludedIndustries || ""),
    status: (record.status || "") as CandidateStatus | "",
    activeSince: record.activeSince || "",
    registrationTimestamp: record.registrationTimestamp || "",
    coverLetter: record.coverLetter || "",
    resumeUrl: record.resumeUrl || "",
    extra,
  }
}

function rowsToProfiles(rows: string[][]): Profile[] {
  if (!rows.length) return []

  const headers = rows[0].map((h) => (h ?? "").trim())
  return rows
    .slice(1)
    .map((row) => buildProfile(headers, row))
    .filter((p) => p.id && (!p.status || p.status === "Активный"))
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-+|-+$/g, "")
}

/** Parse a multi-select cell value (Google Sheets dropdown) into distinct tags. */
export function parseMultiValue(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  return trimmed
    .split(/\s*[,;|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** The full sheet as headers + raw row values, preserving every column. */
export type SheetTable = {
  headers: string[]
  rows: { id: string; cells: string[] }[]
}

/**
 * Fetch the entire sheet verbatim: the header row plus every data row.
 * Nothing is dropped or remapped — useful for showing all columns as-is.
 * The first column is treated as the row id (for linking to /[id]).
 */
export async function getSheetTable(): Promise<SheetTable> {
  const { sheetId } = getEnv()
  const values = await fetchSheetValues(sheetId, SHEET_RANGE)
  if (!values.length) return { headers: [], rows: [] }

  const headers = values[0].map((h) => (h ?? "").trim())
  const rows = values.slice(1).map((row) => {
    const cells = headers.map((_, i) => (row[i] ?? "").toString().trim())
    const record = rowToRecord(headers, row)
    return { id: resolveRowId(headers, row, record), cells }
  })
  return { headers, rows }
}

/** Fetch every profile row from the sheet. */
export async function getProfiles(): Promise<Profile[]> {
  const { sheetId } = getEnv()
  const values = await fetchSheetValues(sheetId, SHEET_RANGE)
  return rowsToProfiles(values)
}

/** Fetch a single profile by its id. Returns null if not found. */
export async function getProfile(id: string): Promise<Profile | null> {
  const { sheetId } = getEnv()
  const values = await fetchSheetValues(sheetId, SHEET_RANGE)
  if (!values.length) return null

  const headers = values[0].map((h) => (h ?? "").trim())
  for (const row of values.slice(1)) {
    const profile = buildProfile(headers, row)
    if (profile.id === id) return profile
  }
  return null
}

export type MailingListEntry = {
  profile: Profile
  /** Stream value from the mailing list sheet row. */
  mailingStream: string
}

export type MailingList = {
  listId: string
  /** Stream name for the whole mailing list (from the first matching row). */
  stream: string
  /** Date string as stored in the sheet (e.g. "01.06.2025"). */
  date: string
  entries: MailingListEntry[]
}

/**
 * Fetch a mailing list by its ID, preserving per-entry stream and the list date.
 * Returns null if the list does not exist or contains no candidates.
 */
export async function getMailingList(listId: string): Promise<MailingList | null> {
  const { sheetId } = getEnv()
  const values = await fetchSheetValues(sheetId, MAILING_LIST_RANGE)
  if (!values.length) return null

  const rawHeaders = values[0].map((h) => (h ?? "").trim())
  const mappedHeaders = rawHeaders.map((h) => MAILING_LIST_COL_ALIASES[h.toLowerCase()] ?? h.toLowerCase())

  const listIdIdx = mappedHeaders.indexOf("list_id")
  const candidateIdIdx = mappedHeaders.indexOf("candidate_id")
  const streamIdx = mappedHeaders.indexOf("stream")
  const dateIdx = mappedHeaders.indexOf("date")

  if (listIdIdx < 0 || candidateIdIdx < 0) return null

  const matchingRows = values.slice(1).filter((row) => (row[listIdIdx] ?? "").trim() === listId)
  if (!matchingRows.length) return null

  const date = dateIdx >= 0 ? (matchingRows[0][dateIdx] ?? "").trim() : ""
  const stream = streamIdx >= 0 ? (matchingRows[0][streamIdx] ?? "").trim() : ""

  const candidateIds = new Set<string>()
  for (const row of matchingRows) {
    const candidateId = (row[candidateIdIdx] ?? "").trim()
    if (candidateId) candidateIds.add(candidateId)
  }

  if (!candidateIds.size) return null

  const allProfiles = await getProfiles()
  const entries: MailingListEntry[] = allProfiles
    .filter((p) => candidateIds.has(p.id))
    .map((p) => ({ profile: p, mailingStream: stream }))

  return { listId, stream, date, entries }
}


const WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets"

async function ensureSheet(sheetId: string, token: string, title: string, headers: string[]): Promise<void> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!metaRes.ok) return

  const meta = (await metaRes.json()) as { sheets: { properties: { title: string } }[] }
  if (meta.sheets.some((s) => s.properties.title === title)) return

  const createRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
    },
  )
  if (!createRes.ok) return

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/` +
      `${encodeURIComponent(title + "!A1")}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headers] }),
    },
  )
}


const EMPLOYERS_HEADERS = ["ID", "Timestamp", "Name", "Company", "Email", "Phone", "Primary Contact", "Telegram", "LinkedIn", "Streams", "Status"]
export type Candidate = {
  rowIndex: number
  timestamp: string
  name: string
  email: string
  phone: string
  resumeUrl: string
  coverLetter: string
  status: CandidateStatus
  activeSince: string
}

/** Append an employer row, mapping field names to actual column positions in the sheet. */
export async function appendEmployerRow(data: Record<string, string>): Promise<void> {
  const { email, privateKey, sheetId } = getEnv()
  const token = await getAccessToken(email, privateKey, WRITE_SCOPE)

  await ensureSheet(sheetId, token, "Employers", EMPLOYERS_HEADERS)

  // Read actual header row to determine column order
  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("'Employers'!A1:Z1")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const headerData = (await headerRes.json()) as { values?: string[][] }
  const headers = (headerData.values?.[0] ?? []).map((h) => h.trim())

  const values = headers.map((h) => data[h] ?? "")

  const range = encodeURIComponent("Employers!A1")
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [values] }),
  })
  if (!res.ok) throw new Error(`Sheets append failed (${res.status}): ${await res.text()}`)
}

/** Append a candidate row to the main profiles sheet (case-insensitive header matching). */
export async function appendCandidateRow(data: Record<string, string>): Promise<void> {
  const { email, privateKey, sheetId } = getEnv()
  const token = await getAccessToken(email, privateKey, WRITE_SCOPE)

  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("A1:AZ1")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const headerData = (await headerRes.json()) as { values?: string[][] }
  const headers = (headerData.values?.[0] ?? []).map((h) => h.trim())
  const dataLower = Object.fromEntries(Object.entries(data).map(([k, v]) => [k.toLowerCase(), v]))
  const values = headers.map((h) => dataLower[h.toLowerCase()] ?? "")

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("A1")}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [values] }),
  })
  if (!res.ok) throw new Error(`Sheets append failed (${res.status}): ${await res.text()}`)
}

/** Returns all candidates from the main sheet for editor moderation (all statuses). */
export async function getCandidates(): Promise<Candidate[]> {
  const { sheetId } = getEnv()
  try {
    const values = await fetchSheetValues(sheetId, SHEET_RANGE)
    if (values.length < 2) return []
    const headers = values[0].map((h) => (h ?? "").trim())

    return values.slice(1).map((row, i) => {
      // Use rowToRecord so HEADER_ALIASES resolves "Кандидат" → name, "Статус" → status, etc.
      const r = rowToRecord(headers, row)
      return {
        rowIndex: i + 2,
        timestamp: r.registrationTimestamp || "",
        name: r.name || "",
        email: r.email || "",
        phone: r.phone || "",
        resumeUrl: r.resumeUrl || "",
        coverLetter: r.coverLetter || "",
        // Legacy rows without a Status column default to Активный
        status: ((r.status || "").trim() || "Активный") as CandidateStatus,
        activeSince: r.activeSince || "",
      }
    }).filter((c) => c.name || c.email)
  } catch {
    return []
  }
}

export async function updateCandidateStatus(
  rowIndex: number,
  status: CandidateStatus,
  activeSince?: string,
): Promise<void> {
  const { email, privateKey, sheetId } = getEnv()
  const token = await getAccessToken(email, privateKey, WRITE_SCOPE)

  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("A1:AZ1")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const headerData = (await headerRes.json()) as { values?: string[][] }
  const headers = (headerData.values?.[0] ?? []).map((h) => h.trim().toLowerCase())

  const statusColIdx = headers.indexOf("status")
  if (statusColIdx < 0) throw new Error("Status column not found in main sheet")

  const statusRange = encodeURIComponent(`${colLetter(statusColIdx + 1)}${rowIndex}`)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${statusRange}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[status]] }),
    },
  )
  if (!res.ok) throw new Error(`Failed to update candidate status (${res.status}): ${await res.text()}`)

  if (activeSince !== undefined) {
    const activeSinceColIdx = headers.indexOf("active since")
    if (activeSinceColIdx >= 0) {
      const asRange = encodeURIComponent(`${colLetter(activeSinceColIdx + 1)}${rowIndex}`)
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${asRange}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ values: [[activeSince]] }),
        },
      )
    }
  }
}

// Registration and moderation columns added to the main profiles sheet
const CANDIDATE_EXTRA_COLUMNS = ["id", "Status", "Active Since", "Timestamp", "Cover Letter", "Resume URL"]

export async function ensureCandidateColumns(): Promise<{ added: string[] }> {
  const { email, privateKey, sheetId } = getEnv()
  const token = await getAccessToken(email, privateKey, WRITE_SCOPE)

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("A1:AZ1")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return { added: [] }

  const data = (await res.json()) as { values?: string[][] }
  const currentHeaders = (data.values?.[0] ?? []).map((h) => h.trim().toLowerCase())

  const missing = CANDIDATE_EXTRA_COLUMNS.filter(
    (col) => !currentHeaders.includes(col.toLowerCase()),
  )
  if (!missing.length) return { added: [] }

  const startIdx = currentHeaders.length + 1
  const endIdx = startIdx + missing.length - 1
  const range = `${colLetter(startIdx)}1:${colLetter(endIdx)}1`

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [missing] }),
    },
  )
  if (!updateRes.ok) throw new Error(`Failed to add candidate columns (${updateRes.status}): ${await updateRes.text()}`)

  return { added: missing }
}



export type MailingListSummary = {
  listId: string
  stream: string
  date: string
  candidateCount: number
}

/** Fetch all mailing lists grouped by List ID (no profile data, fast). */
export async function getMailingLists(): Promise<MailingListSummary[]> {
  const { sheetId } = getEnv()
  const values = await fetchSheetValues(sheetId, MAILING_LIST_RANGE)
  if (!values.length) return []

  const rawHeaders = values[0].map((h) => (h ?? "").trim())
  const mappedHeaders = rawHeaders.map((h) => MAILING_LIST_COL_ALIASES[h.toLowerCase()] ?? h.toLowerCase())

  const listIdIdx = mappedHeaders.indexOf("list_id")
  const candidateIdIdx = mappedHeaders.indexOf("candidate_id")
  const streamIdx = mappedHeaders.indexOf("stream")
  const dateIdx = mappedHeaders.indexOf("date")

  if (listIdIdx < 0) return []

  const byListId = new Map<string, { stream: string; date: string; candidateIds: Set<string> }>()

  for (const row of values.slice(1)) {
    const listId = (row[listIdIdx] ?? "").trim()
    if (!listId) continue
    if (!byListId.has(listId)) {
      byListId.set(listId, {
        stream: streamIdx >= 0 ? (row[streamIdx] ?? "").trim() : "",
        date: dateIdx >= 0 ? (row[dateIdx] ?? "").trim() : "",
        candidateIds: new Set(),
      })
    }
    const entry = byListId.get(listId)!
    const candidateId = candidateIdIdx >= 0 ? (row[candidateIdIdx] ?? "").trim() : ""
    if (candidateId) entry.candidateIds.add(candidateId)
  }

  return Array.from(byListId.entries()).map(([listId, { stream, date, candidateIds }]) => ({
    listId,
    stream,
    date,
    candidateCount: candidateIds.size,
  }))
}

export type EmployerStatus = "На проверке" | "Подтверждён" | "Отклонён"

export type Employer = {
  rowIndex: number
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
}

function parseEmployerRows(values: string[][]): Employer[] {
  if (values.length < 2) return []
  const headers = values[0].map((h) => (h ?? "").trim().toLowerCase())
  const idIdx = headers.indexOf("id")
  const nameIdx = headers.indexOf("name")
  const companyIdx = headers.indexOf("company")
  const emailIdx = headers.indexOf("email")
  const phoneIdx = headers.indexOf("phone")
  const primaryContactIdx = headers.indexOf("primary contact")
  const telegramIdx = headers.indexOf("telegram")
  const linkedinIdx = headers.indexOf("linkedin")
  const streamsIdx = headers.indexOf("streams")
  const statusIdx = headers.indexOf("status")
  const countryIdx = headers.indexOf("country")
  const additionalCountriesIdx = headers.indexOf("additional countries")

  if (emailIdx < 0) return []

  return values.slice(1).map((row, i) => ({
    rowIndex: i + 2, // row 1 is header
    token: idIdx >= 0 ? (row[idIdx] ?? "").trim() : "",
    name: nameIdx >= 0 ? (row[nameIdx] ?? "").trim() : "",
    company: companyIdx >= 0 ? (row[companyIdx] ?? "").trim() : "",
    email: emailIdx >= 0 ? (row[emailIdx] ?? "").trim() : "",
    phone: phoneIdx >= 0 ? (row[phoneIdx] ?? "").trim() : "",
    primaryContact: primaryContactIdx >= 0 ? (row[primaryContactIdx] ?? "").trim() : "",
    telegram: telegramIdx >= 0 ? (row[telegramIdx] ?? "").trim() : "",
    linkedin: linkedinIdx >= 0 ? (row[linkedinIdx] ?? "").trim() : "",
    streams: parseMultiValue(streamsIdx >= 0 ? (row[streamsIdx] ?? "") : ""),
    status: ((statusIdx >= 0 ? (row[statusIdx] ?? "").trim() : "") || "На проверке") as EmployerStatus,
    country: countryIdx >= 0 ? (row[countryIdx] ?? "").trim() : "",
    additionalCountries: parseMultiValue(additionalCountriesIdx >= 0 ? (row[additionalCountriesIdx] ?? "") : ""),
  })).filter((e) => e.email)
}

/** Fetch all employers from the Employers sheet. */
export async function getEmployers(): Promise<Employer[]> {
  const { sheetId } = getEnv()
  try {
    const values = await fetchSheetValues(sheetId, "'Employers'!A1:Z1000")
    return parseEmployerRows(values)
  } catch {
    return []
  }
}

/** Find a single employer by their token (ID column). Returns undefined if not found. */
export async function getEmployerByToken(token: string): Promise<Employer | undefined> {
  if (!token) return undefined
  const employers = await getEmployers()
  return employers.find((e) => e.token === token)
}

/**
 * Filter candidates for a specific employer, removing those who have excluded
 * the employer's company or industry from their preferences.
 */
export function filterCandidatesForEmployer(candidates: Profile[], employer: Employer): Profile[] {
  const companyLower = employer.company.trim().toLowerCase()
  const industryLower = employer.streams.map((s) => s.trim().toLowerCase())

  return candidates.filter((c) => {
    if (companyLower && c.excludedCompanies.some((ec) => ec.toLowerCase() === companyLower)) {
      return false
    }
    if (industryLower.length && c.excludedIndustries.some((ei) => industryLower.includes(ei.toLowerCase()))) {
      return false
    }
    return true
  })
}

/** Fetch all employers subscribed to a given stream from the Employers sheet. */
export async function getEmployersByStream(stream: string): Promise<Employer[]> {
  const employers = await getEmployers()
  return employers.filter((e) =>
    e.streams.some((s) => s.toLowerCase() === stream.toLowerCase())
  )
}

/** Update the Status cell of an employer row. */
export async function updateEmployerStatus(rowIndex: number, status: EmployerStatus): Promise<void> {
  const { email, privateKey, sheetId } = getEnv()
  const token = await getAccessToken(email, privateKey, WRITE_SCOPE)

  const headerRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("'Employers'!A1:Z1")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const headerData = (await headerRes.json()) as { values?: string[][] }
  const headers = (headerData.values?.[0] ?? []).map((h) => h.trim().toLowerCase())
  const statusColIdx = headers.indexOf("status")
  if (statusColIdx < 0) throw new Error("Status column not found in Employers sheet")

  const range = encodeURIComponent(`'Employers'!${colLetter(statusColIdx + 1)}${rowIndex}`)
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [[status]] }),
    },
  )
  if (!res.ok) throw new Error(`Failed to update employer status (${res.status}): ${await res.text()}`)
}


/** Whether Google Sheets credentials are configured AND the key looks valid. */
export function isSheetsConfigured(): boolean {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) return false
  const creds = resolveCredentials()
  if (!creds) return false
  return isValidPrivateKey(creds.privateKey)
}

// ── Profile column migration ──────────────────────────────────────────────────

const EMPLOYER_EXTRA_COLUMNS = ["Country", "Additional Countries"]

export async function ensureEmployerColumns(): Promise<{ added: string[] }> {
  const { email, privateKey, sheetId } = getEnv()
  const token = await getAccessToken(email, privateKey, WRITE_SCOPE)

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("'Employers'!A1:Z1")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Failed to read Employers header row (${res.status}): ${await res.text()}`)

  const data = (await res.json()) as { values?: string[][] }
  const currentHeaders = (data.values?.[0] ?? []).map((h) => h.trim().toLowerCase())

  const missing = EMPLOYER_EXTRA_COLUMNS.filter(
    (col) => !currentHeaders.includes(col.toLowerCase()),
  )
  if (!missing.length) return { added: [] }

  const startIdx = currentHeaders.length + 1
  const endIdx = startIdx + missing.length - 1
  const range = `'Employers'!${colLetter(startIdx)}1:${colLetter(endIdx)}1`

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [missing] }),
    },
  )
  if (!updateRes.ok) throw new Error(`Failed to add employer columns (${updateRes.status}): ${await updateRes.text()}`)

  return { added: missing }
}

const DISTRIBUTION_COLUMNS = ["Level", "Industry", "Function", "Country Primary", "Country Desired", "Summary", "Excluded Companies", "Excluded Industries"]

function colLetter(n: number): string {
  let s = ""
  while (n > 0) {
    n--
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26)
  }
  return s
}

/**
 * Reads the header row of the main profiles sheet and appends any missing
 * distribution-tag columns (Level, Industry, Function, Country Primary,
 * Country Desired) after the last existing column.
 */
export async function ensureProfileColumns(): Promise<{ added: string[] }> {
  const { email, privateKey, sheetId } = getEnv()
  const token = await getAccessToken(email, privateKey, WRITE_SCOPE)

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("A1:AZ1")}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Failed to read profile header row (${res.status}): ${await res.text()}`)

  const data = (await res.json()) as { values?: string[][] }
  const currentHeaders = (data.values?.[0] ?? []).map((h) => h.trim().toLowerCase())

  const missing = DISTRIBUTION_COLUMNS.filter(
    (col) => !currentHeaders.includes(col.toLowerCase()),
  )
  if (!missing.length) return { added: [] }

  const startIdx = currentHeaders.length + 1
  const endIdx = startIdx + missing.length - 1
  const range = `${colLetter(startIdx)}1:${colLetter(endIdx)}1`

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [missing] }),
    },
  )
  if (!updateRes.ok) throw new Error(`Failed to add columns (${updateRes.status}): ${await updateRes.text()}`)

  return { added: missing }
}
