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

function getEnv() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY
  const sheetId = process.env.GOOGLE_SHEET_ID

  if (!email || !key || !sheetId) {
    throw new Error(
      "Missing Google Sheets configuration. Required env vars: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID.",
    )
  }

  // Private keys stored in env usually have escaped newlines.
  const privateKey = key.replace(/\\n/g, "\n")
  return { email, privateKey, sheetId }
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

/** Whether Google Sheets credentials are configured. */
export function isSheetsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEET_ID,
  )
}
