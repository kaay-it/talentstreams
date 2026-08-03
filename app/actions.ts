"use server"

import { revalidatePath } from "next/cache"
import { appendEmployerRow, appendCandidateRow, appendContactRequest, getMailingList, getMailingLists, ensureProfileColumns, ensureEmployerColumns, updateEmployerStatus, updateContactRequestStatus, getEmployers, getEmployerByToken, type Employer, type ContactRequestStatus } from "@/lib/sheets"
import { spPost, spGet, getToken, getOrCreateBook } from "@/lib/sendpulse"

const SENDPULSE_API = "https://api.sendpulse.com"

async function addToAddressBook(
  email: string,
  bookId: number,
  variables: Record<string, string>,
  token: string,
): Promise<void> {
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
  const token = await getToken()
  if (!token) { console.warn("[SendPulse] failed to get access token"); return }

  const variables: Record<string, string> = { "Имя": name, phone, ...extra }
  const masterBookName = process.env.SENDPULSE_MASTER_BOOK_NAME || "Default"
  const streams = extra?.Streams
    ? extra.Streams.split(",").map((s) => s.trim()).filter(Boolean)
    : []

  const bookNames = [masterBookName, ...streams]
  const uniqueNames = [...new Set(bookNames)]

  const bookIds = await Promise.all(uniqueNames.map((n) => getOrCreateBook(n, token)))
  await Promise.all(bookIds.map((id) => addToAddressBook(email, id, variables, token)))
}

export async function addProfileColumns(): Promise<{ added: string[] }> {
  return ensureProfileColumns()
}

export async function addAllColumns(): Promise<{ added: string[] }> {
  const [profiles, employers] = await Promise.all([ensureProfileColumns(), ensureEmployerColumns()])
  return { added: [...profiles.added, ...employers.added] }
}


export type PublishResult = {
  listId: string
  stream: string
  campaignId: number
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function buildEmailHtml(stream: string, date: string, url: string, count: number): string {
  const s = escapeHtml(stream)
  const d = escapeHtml(date)
  const plural = candidatePlural(count)
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>Talent Stream</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">

  <tr>
    <td style="padding-bottom:16px">
      <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#2563eb;font-family:${font}">
        Talent Stream
      </p>
    </td>
  </tr>

  <tr>
    <td style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

      <tr>
        <td style="padding:32px 32px 24px">

          <p style="margin:0 0 14px">
            <span style="display:inline-block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#2563eb;background:#eff6ff;border-radius:999px;padding:3px 10px;font-family:${font}">
              ${s}
            </span>
          </p>

          <h1 style="margin:0 0 10px;font-size:22px;font-weight:600;color:#0f172a;line-height:1.35;letter-spacing:-0.02em;font-family:${font}">
            Выпуск ${s} Talent Stream подготовлен специально для вас.
          </h1>

          <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.65;font-family:${font}">
            В него вошли проверенные кандидаты, отобранные нашей командой за последнюю неделю.
          </p>

          <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;font-family:${font}">
            ${d}&nbsp;&nbsp;·&nbsp;&nbsp;${count} ${plural}
          </p>

          <hr style="border:none;border-top:1px solid #f1f5f9;margin:0 0 24px">

          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65;font-family:${font}">
            Здравствуйте, {{Имя}}!<br>
            Перейдите по ссылке, чтобы познакомиться с кандидатами этого выпуска.
          </p>

          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:8px;background:#2563eb">
                <a href="${url}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;letter-spacing:-0.01em;font-family:${font}">
                  Открыть подборку &rarr;
                </a>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <tr>
        <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f1f5f9">
          <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;font-family:${font}">
            Если кнопка не открывается —
            <a href="${url}" style="color:#94a3b8;text-decoration:underline">открыть в браузере</a>.
          </p>
        </td>
      </tr>

    </table>
    </td>
  </tr>

</table>
</td></tr>
</table>
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

  const token = await getToken()
  if (!token) throw new Error("Не удалось получить токен SendPulse")

  const payload = JSON.stringify({
    name,
    list_id: Number(bookId),
    subject,
    body: Buffer.from(html, "utf-8").toString("base64"),
    sender_name: fromName,
    sender_email: fromEmail,
  })
  console.log("[SendPulse] createCampaign:", payload)

  const { status, text } = await spPost(
    `${SENDPULSE_API}/campaigns`,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    payload,
  )
  console.log(`[SendPulse] campaigns status=${status} body=${text}`)

  if (status < 200 || status >= 300) {
    let message = `SendPulse campaign error (${status}): ${text}`
    try {
      const err = JSON.parse(text) as { error_code?: number; message?: string }
      if (err.error_code === 709) {
        message = "Адресная книга занята (идёт копирование адресов). Подождите минуту и попробуйте снова."
      } else if (err.error_code === 798) {
        message = "В адресной книге нет подписчиков. Добавьте работодателей в стрим «" + name.split(" — ")[0] + "» и повторите попытку."
      }
    } catch { /* ignore parse errors */ }
    throw new Error(message)
  }
  return JSON.parse(text) as { id: number }
}

export async function publishMailingList(listId: string): Promise<PublishResult> {
  const list = await getMailingList(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)

  const token = await getToken()
  if (!token) throw new Error("Не удалось получить токен SendPulse")

  const bookId = await getOrCreateBook(list.stream, token)
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const listUrl = `${appUrl}/list/${listId}?e={{employer_token}}`
  const subject = `Talent Stream: ${list.stream} — выпуск ${list.date}`
  const campaignName = `${list.stream} — ${list.date}`
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
  country: string
  additionalCountries: string[]
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

  await appendCandidateRow([
    new Date().toISOString(),
    data.name,
    data.email,
    data.phone,
    data.resumeUrl,
    data.coverLetter,
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

  const existing = await getEmployers()
  const active = existing.filter((e) => e.status === "На проверке" || e.status === "Подтверждён")
  const emailNorm = data.email.trim().toLowerCase()
  const digitsOnly = (p: string) => p.replace(/\D/g, "")
  const phoneNorm = digitsOnly(data.phone)

  if (active.some((e) => e.email.toLowerCase() === emailNorm)) {
    throw new Error("Работодатель с таким email уже зарегистрирован")
  }
  if (phoneNorm && active.some((e) => digitsOnly(e.phone) === phoneNorm)) {
    throw new Error("Работодатель с таким номером телефона уже зарегистрирован")
  }

  await appendEmployerRow({
    "ID": crypto.randomUUID(),
    "Timestamp": new Date().toISOString(),
    "Name": data.name,
    "Company": data.company,
    "Email": data.email,
    "Phone": data.phone,
    "Primary Contact": data.primaryContact,
    "Telegram": data.telegram || "",
    "LinkedIn": data.linkedin || "",
    "Streams": data.streams.join(", "),
    "Status": "На проверке",
    "Country": data.country,
    "Additional Countries": data.additionalCountries.join(", "),
  })
}

export async function confirmEmployer(rowIndex: number, employer: Pick<Employer, "token" | "name" | "email" | "phone" | "telegram" | "linkedin" | "primaryContact" | "streams">): Promise<void> {
  await addToSendPulse(employer.name, employer.email, employer.phone, {
    ...(employer.telegram && { Telegram: employer.telegram }),
    ...(employer.linkedin && { LinkedIn: employer.linkedin }),
    "Primary Contact": employer.primaryContact,
    Streams: employer.streams.join(", "),
    ...(employer.token && { employer_token: employer.token }),
  })
  // TASK-10: send welcome email after confirmation
  await updateEmployerStatus(rowIndex, "Подтверждён")
  revalidatePath("/editor")
}

export async function rejectEmployer(rowIndex: number): Promise<void> {
  await updateEmployerStatus(rowIndex, "Отклонён")
  revalidatePath("/editor")
}

export async function setContactRequestStatus(rowIndex: number, status: ContactRequestStatus): Promise<void> {
  await updateContactRequestStatus(rowIndex, status)
  revalidatePath("/editor")
}

export async function submitGeneralInquiry(listId: string, employerToken: string): Promise<void> {
  if (!employerToken) throw new Error("Токен работодателя не найден в URL")

  const employer = await getEmployerByToken(employerToken)
  if (!employer) throw new Error("Работодатель не найден")

  const lists = await getMailingLists()
  const list = lists.find((l) => l.listId === listId)

  await appendContactRequest({
    listId,
    stream: list?.stream ?? "",
    candidateId: "",
    employerToken,
    employerName: employer.name,
    employerCompany: employer.company,
    employerEmail: employer.email,
  })
}

export async function submitContactRequest(
  candidateId: string,
  listId: string,
  employerToken: string,
): Promise<void> {
  if (!employerToken) throw new Error("Токен работодателя не найден в URL")

  const employer = await getEmployerByToken(employerToken)
  if (!employer) throw new Error("Работодатель не найден")

  const lists = await getMailingLists()
  const list = lists.find((l) => l.listId === listId)

  await appendContactRequest({
    listId,
    stream: list?.stream ?? "",
    candidateId,
    employerToken,
    employerName: employer.name,
    employerCompany: employer.company,
    employerEmail: employer.email,
  })
}
