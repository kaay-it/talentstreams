import "server-only"
import { request } from "node:https"

const API = "https://api.sendpulse.com"

function spRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method,
        headers: body ? { ...headers, "Content-Length": Buffer.byteLength(body) } : headers,
        rejectUnauthorized: false,
      },
      (res) => {
        let text = ""
        res.on("data", (chunk: Buffer) => (text += chunk.toString()))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }))
      },
    )
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

export const spPost = (url: string, headers: Record<string, string>, body: string) =>
  spRequest("POST", url, headers, body)

export const spGet = (url: string, headers: Record<string, string>) =>
  spRequest("GET", url, headers)

// ── Token cache ───────────────────────────────────────────────────────────────

let _tokenCache: { value: string; expiresAt: number } | null = null

export async function getToken(): Promise<string | null> {
  const clientId = process.env.SENDPULSE_CLIENT_ID
  const clientSecret = process.env.SENDPULSE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (_tokenCache && Date.now() < _tokenCache.expiresAt) return _tokenCache.value

  try {
    const { status, text } = await spPost(
      `${API}/oauth/access_token`,
      { "Content-Type": "application/json" },
      JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    )
    console.log(`[SendPulse] oauth status=${status}`)
    if (status < 200 || status >= 300) return null
    const data = JSON.parse(text) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    _tokenCache = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    }
    return _tokenCache.value
  } catch (err) {
    console.error("[SendPulse] oauth failed:", err)
    return null
  }
}

// ── Address book cache ────────────────────────────────────────────────────────

type BookEntry = { id: number; emailCount: number }
let _bookCache: Map<string, BookEntry> | null = null

async function loadBookCache(token: string): Promise<void> {
  if (_bookCache) return
  const { status, text } = await spGet(
    `${API}/addressbooks?limit=500&offset=0`,
    { Authorization: `Bearer ${token}` },
  )
  if (status >= 200 && status < 300) {
    const books = JSON.parse(text) as Array<{ id: number; name: string; all_email_qty?: number }>
    _bookCache = new Map(books.map((b) => [b.name, { id: b.id, emailCount: b.all_email_qty ?? 0 }]))
    console.log(`[SendPulse] loaded ${_bookCache.size} address books`)
  } else {
    console.warn(`[SendPulse] GET /addressbooks status=${status}`, text)
    _bookCache = new Map()
  }
}

export async function getOrCreateBook(name: string, token: string): Promise<number> {
  await loadBookCache(token)

  const existing = _bookCache!.get(name)
  if (existing) return existing.id

  console.log(`[SendPulse] creating address book "${name}"`)
  const { status, text } = await spPost(
    `${API}/addressbooks`,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    JSON.stringify({ bookName: name }),
  )
  if (status < 200 || status >= 300) throw new Error(`Failed to create address book "${name}": ${text}`)
  const data = JSON.parse(text) as { id: number }
  _bookCache!.set(name, { id: data.id, emailCount: 0 })
  return data.id
}

export async function getBookEmailCount(name: string, token: string): Promise<number> {
  await loadBookCache(token)
  return _bookCache?.get(name)?.emailCount ?? 0
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export type Campaign = {
  id: number
  name: string
  status: string
  created?: string
}

export async function getCampaigns(): Promise<Campaign[]> {
  const token = await getToken()
  if (!token) return []
  try {
    const all: Campaign[] = []
    const limit = 100
    let offset = 0
    while (true) {
      const { status, text } = await spGet(
        `${API}/campaigns?limit=${limit}&offset=${offset}`,
        { Authorization: `Bearer ${token}` },
      )
      if (status < 200 || status >= 300) {
        console.warn(`[SendPulse] GET /campaigns status=${status}`, text)
        break
      }
      const page = JSON.parse(text) as Campaign[]
      all.push(...page)
      if (page.length < limit) break
      offset += limit
    }
    return all
  } catch (err) {
    console.error("[SendPulse] getCampaigns failed:", err)
    return []
  }
}
