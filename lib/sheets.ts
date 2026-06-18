import "server-only"
import { google } from "googleapis"

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

/**
 * Resolve the service-account email + private key.
 * Two supported ways to provide them:
 *  1. GOOGLE_SERVICE_ACCOUNT_JSON = the entire service-account JSON file content
 *     (most foolproof — no risk of confusing private_key with private_key_id).
 *  2. GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY as separate vars.
 */
function resolveCredentials(): { email: string; privateKey: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (json && json.trim()) {
    try {
      const parsed = JSON.parse(json.trim())
      const email = parsed.client_email as string | undefined
      const rawKey = parsed.private_key as string | undefined
      if (email && rawKey) {
        return { email, privateKey: normalizePrivateKey(rawKey) }
      }
    } catch {
      // fall through to individual vars
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY
  if (email && key) {
    return { email, privateKey: normalizePrivateKey(key) }
  }
  return null
}

function getEnv() {
  const sheetId = process.env.GOOGLE_SHEET_ID
  const creds = resolveCredentials()

  if (!creds || !sheetId) {
    throw new Error(
      "Missing Google Sheets configuration. Provide GOOGLE_SHEET_ID plus either " +
        "GOOGLE_SERVICE_ACCOUNT_JSON (full JSON) or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY.",
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

async function getSheetsClient() {
  const { email, privateKey } = getEnv()
  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  })
  return google.sheets({ version: "v4", auth })
}

const KNOWN_KEYS = ["id", "name", "title", "bio", "email", "phone", "website", "location", "avatar"]

function rowsToProfiles(rows: string[][]): Profile[] {
  if (!rows.length) return []

  const headers = rows[0].map((h) => (h ?? "").trim().toLowerCase())
  const dataRows = rows.slice(1)

  return dataRows
    .map((row) => {
      const record: Record<string, string> = {}
      headers.forEach((header, i) => {
        if (!header) return
        record[header] = (row[i] ?? "").trim()
      })

      const extra: Record<string, string> = {}
      for (const [k, v] of Object.entries(record)) {
        if (!KNOWN_KEYS.includes(k) && v) extra[k] = v
      }

      const profile: Profile = {
        id: record.id || slugify(record.name || ""),
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
      return profile
    })
    .filter((p) => p.id && p.name)
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-+|-+$/g, "")
}

/** Fetch every profile row from the sheet. */
export async function getProfiles(): Promise<Profile[]> {
  const { sheetId } = getEnv()
  const sheets = await getSheetsClient()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: SHEET_RANGE,
  })
  return rowsToProfiles((res.data.values as string[][]) ?? [])
}

/** Fetch a single profile by its id. Returns null if not found. */
export async function getProfile(id: string): Promise<Profile | null> {
  const profiles = await getProfiles()
  return profiles.find((p) => p.id === id) ?? null
}

/** Whether Google Sheets credentials are configured AND the key looks valid. */
export function isSheetsConfigured(): boolean {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) return false
  const creds = resolveCredentials()
  if (!creds) return false
  return isValidPrivateKey(creds.privateKey)
}
