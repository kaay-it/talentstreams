"use server"

import { request } from "node:https"
import { appendEmployerRow, appendCandidateRow, getMailingList } from "@/lib/sheets"

const SENDPULSE_API = "https://api.sendpulse.com"

function spPost(url: string, headers: Record<string, string>, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: { ...headers, "Content-Length": Buffer.byteLength(body) },
        rejectUnauthorized: false,
      },
      (res) => {
        let text = ""
        res.on("data", (chunk: Buffer) => (text += chunk.toString()))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }))
      },
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

let _tokenCache: { value: string; expiresAt: number } | null = null

async function getSendPulseToken(): Promise<string | null> {
  const clientId = process.env.SENDPULSE_CLIENT_ID
  const clientSecret = process.env.SENDPULSE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (_tokenCache && Date.now() < _tokenCache.expiresAt) return _tokenCache.value

  try {
    const { status, text } = await spPost(
      `${SENDPULSE_API}/oauth/access_token`,
      { "Content-Type": "application/json" },
      JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    )
    console.log(`[SendPulse] oauth status=${status}`, text)
    if (status < 200 || status >= 300) return null
    const data = JSON.parse(text) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    _tokenCache = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000 }
    return _tokenCache.value
  } catch (err) {
    console.error("[SendPulse] oauth failed:", err)
    return null
  }
}

/** Parse "Finance:111,Tech:222" from SENDPULSE_STREAM_BOOKS into a lowercase map. */
function getStreamBookMap(): Map<string, string> {
  const map = new Map<string, string>()
  const raw = process.env.SENDPULSE_STREAM_BOOKS || ""
  for (const pair of raw.split(",")) {
    const colonIdx = pair.indexOf(":")
    if (colonIdx < 0) continue
    const stream = pair.slice(0, colonIdx).trim()
    const bookId = pair.slice(colonIdx + 1).trim()
    if (stream && bookId) map.set(stream.toLowerCase(), bookId)
  }
  return map
}

async function addToAddressBook(
  email: string,
  bookId: string,
  variables: Record<string, string>,
): Promise<void> {
  const token = await getSendPulseToken()
  if (!token) { console.warn("[SendPulse] failed to get access token"); return }
  const payload = JSON.stringify({ emails: [{ email, variables }] })
  console.log(`[SendPulse] addToBook bookId=${bookId}:`, payload)
  const { status, text } = await spPost(
    `${SENDPULSE_API}/addressbooks/${bookId}/emails`,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    payload,
  )
  console.log(`[SendPulse] bookId=${bookId} status=${status}`, text)
}

async function addToSendPulse(
  name: string,
  email: string,
  phone: string,
  extra?: Record<string, string>,
): Promise<void> {
  console.log("[SendPulse] addToSendPulse", { email })
  const variables: Record<string, string> = { "Имя": name, phone, ...extra }

  const masterBookId = process.env.SENDPULSE_ADDRESS_BOOK_ID
  const streamBooks = getStreamBookMap()
  const streams = extra?.Streams
    ? extra.Streams.split(",").map((s) => s.trim()).filter(Boolean)
    : []

  const bookIds = new Set<string>()
  if (masterBookId) bookIds.add(masterBookId)
  for (const stream of streams) {
    const id = streamBooks.get(stream.toLowerCase())
    if (id) bookIds.add(id)
  }

  if (!bookIds.size) {
    console.warn("[SendPulse] no address book configured (set SENDPULSE_ADDRESS_BOOK_ID or SENDPULSE_STREAM_BOOKS)")
    return
  }

  await Promise.all([...bookIds].map((id) => addToAddressBook(email, id, variables)))
}

export type PublishResult = {
  listId: string
  stream: string
  campaignId: number
}

function buildEmailHtml(stream: string, date: string, url: string, count: number): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
  <p style="color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px">Talent Stream · ${stream}</p>
  <h1 style="font-size:22px;margin:0 0 16px">Новая подборка кандидатов</h1>
  <p>Здравствуйте, {{Имя}}!</p>
  <p>Для вас подготовлен новый выпуск стрима <strong>${stream}</strong> от ${date} — ${count} ${candidatePlural(count)}.</p>
  <p style="margin:24px 0">
    <a href="${url}" style="background:#1168bd;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
      Открыть подборку
    </a>
  </p>
  <p style="color:#999;font-size:12px">Если кнопка не открывается, скопируйте ссылку: ${url}</p>
</body>
</html>`
}

function candidatePlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "проверенный кандидат"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "проверенных кандидата"
  return "проверенных кандидатов"
}

async function createCampaign(
  bookId: string | number,
  subject: string,
  html: string,
  name: string,
): Promise<{ id: number }> {
  const fromEmail = process.env.SENDPULSE_FROM_EMAIL
  const fromName = process.env.SENDPULSE_FROM_NAME || "TalentStreams"
  if (!fromEmail) throw new Error("SENDPULSE_FROM_EMAIL не задан в переменных окружения")

  const token = await getSendPulseToken()
  if (!token) throw new Error("Не удалось получить токен SendPulse")

  const payload = JSON.stringify({
    sender_name: fromName,
    sender_email: fromEmail,
    subject,
    body: html,
    name,
    list_id: Number(bookId),
  })
  console.log("[SendPulse] createCampaign:", payload)

  const { status, text } = await spPost(
    `${SENDPULSE_API}/campaigns`,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    payload,
  )
  console.log(`[SendPulse] campaigns status=${status}`, text)

  if (status < 200 || status >= 300) throw new Error(`SendPulse campaign error (${status}): ${text}`)
  return JSON.parse(text) as { id: number }
}

export async function publishMailingList(listId: string): Promise<PublishResult> {
  const list = await getMailingList(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)

  const streamBooks = getStreamBookMap()
  const bookId =
    streamBooks.get(list.stream.toLowerCase()) ?? process.env.SENDPULSE_ADDRESS_BOOK_ID
  if (!bookId) {
    throw new Error(
      `Нет адресной книги для стрима "${list.stream}". Задайте SENDPULSE_STREAM_BOOKS или SENDPULSE_ADDRESS_BOOK_ID.`,
    )
  }

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const listUrl = `${appUrl}/list/${listId}`
  const subject = `Talent Stream: ${list.stream} — выпуск ${list.date}`
  const campaignName = `${list.stream} ${list.date} (${listId.slice(0, 8)})`
  const html = buildEmailHtml(list.stream, list.date, listUrl, list.entries.length)

  const campaign = await createCampaign(bookId, subject, html, campaignName)
  return { listId, stream: list.stream, campaignId: campaign.id }
}

export type EmployerData = {
  name: string
  company: string
  email: string
  phone: string
  primaryContact: "email" | "telegram" | "whatsapp" | "linkedin"
  telegram: string
  linkedin: string
  streams: string[]
}

export type CandidateData = {
  name: string
  email: string
  phone: string
  resumeUrl: string
  coverLetter: string
}

export async function registerCandidate(data: CandidateData): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email.trim()) throw new Error("Укажите email")

  await Promise.all([
    appendCandidateRow([
      new Date().toISOString(),
      data.name,
      data.email,
      data.phone,
      data.resumeUrl,
      data.coverLetter,
    ]),
    addToSendPulse(data.name, data.email, data.phone),
  ])
}

export async function registerEmployer(data: EmployerData): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email || !data.phone) throw new Error("Email и телефон обязательны")
  if (!data.streams.length) throw new Error("Выберите хотя бы один стрим")
  if (data.primaryContact === "telegram" && !data.telegram.trim()) {
    throw new Error("Укажите Telegram-имя")
  }
  if (data.primaryContact === "linkedin" && !data.linkedin.trim()) {
    throw new Error("Укажите LinkedIn-профиль")
  }

  await Promise.all([
    appendEmployerRow([
      new Date().toISOString(),
      data.name,
      data.company,
      data.email,
      data.phone,
      data.primaryContact,
      data.telegram || "",
      data.linkedin || "",
      data.streams.join(", "),
    ]),
    addToSendPulse(data.name, data.email, data.phone, {
      ...(data.telegram && { Telegram: data.telegram }),
      ...(data.linkedin && { LinkedIn: data.linkedin }),
      "Primary Contact": data.primaryContact,
      Streams: data.streams.join(", "),
    }),
  ])
}
