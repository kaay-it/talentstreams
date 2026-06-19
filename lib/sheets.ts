import "server-only"
import { createSign } from "crypto"

/**
 * A single profile/visiting-card record.
 * Columns are read dynamically from the header row of the sheet, but these
 * fields are the ones the UI knows how to render nicely. Any extra columns
 * are preserved in `extra` so nothing is lost.
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
  avatar: string
  /** Any additional columns from the sheet, keyed by header name. */
  extra: Record<string, string>
}

const SHEET_RANGE = "A1:Z1000"

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

async function getAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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

const KNOWN_KEYS = ["id", "name", "title", "bio", "email", "phone", "website", "location", "avatar"]

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
  avatar: "avatar",
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
    avatar: record.avatar || "",
    extra,
  }
}

function rowsToProfiles(rows: string[][]): Profile[] {
  if (!rows.length) return []

  const headers = rows[0].map((h) => (h ?? "").trim())
  return rows
    .slice(1)
    .map((row) => buildProfile(headers, row))
    .filter((p) => p.id)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-+|-+$/g, "")
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

/** Whether Google Sheets credentials are configured AND the key looks valid. */
export function isSheetsConfigured(): boolean {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) return false
  const creds = resolveCredentials()
  if (!creds) return false
  return isValidPrivateKey(creds.privateKey)
}
