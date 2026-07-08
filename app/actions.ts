"use server"

import { request } from "node:https"
import { appendEmployerRow, appendCandidateRow } from "@/lib/sheets"

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

async function addToSendPulse(name: string, email: string, phone: string, telegram?: string): Promise<void> {
  console.log("[SendPulse] addToSendPulse called", { email })
  const bookId = process.env.SENDPULSE_ADDRESS_BOOK_ID
  if (!bookId) {
    console.warn("[SendPulse] SENDPULSE_ADDRESS_BOOK_ID not set")
    return
  }
  try {
    const token = await getSendPulseToken()
    if (!token) {
      console.warn("[SendPulse] failed to get access token")
      return
    }
    const variables: Record<string, string> = { "Имя": name, phone }
    if (telegram) variables.telegram = telegram
    const payload = JSON.stringify({ emails: [{ email, variables }] })
    console.log("[SendPulse] sending:", payload)
    const { status, text } = await spPost(
      `${SENDPULSE_API}/addressbooks/${bookId}/emails`,
      { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      payload,
    )
    console.log(`[SendPulse] status=${status}`, text)
  } catch (err) {
    console.error("[SendPulse] request failed:", err)
  }
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
    addToSendPulse(data.name, data.email, data.phone, data.telegram || undefined),
  ])
}
