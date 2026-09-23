"use server"

import { revalidatePath } from "next/cache"
import { del } from "@vercel/blob"
import { appendCandidateRow, deleteCandidateRow, getMailingList, getMailingLists, updateCandidateStatus, updateCandidateFields, type CandidateStatus } from "@/lib/sheets"
import { appendContactRequest, updateContactRequestStatus, type ContactRequestStatus } from "@/lib/db/contact-requests"
import { addResumeVersion, getResumeVersions, deleteResumeVersions, deleteResumeVersion, type ResumeVersion } from "@/lib/db/resumes"
export type { ResumeVersion, ResumeVersionKind } from "@/lib/db/resumes"
import { updateStreamRecord, createStreamRecord, deleteStreamRecord, getStreamIdByName } from "@/lib/db/streams"
import { getEmployers, getEmployerByToken, createEmployer, updateEmployerFields, deleteEmployer as deleteEmployerRecord, type Employer } from "@/lib/db/employers"
import { spPost, spGet, spDelete, getToken, getOrCreateBook, getBookId } from "@/lib/sendpulse"
import { isOwnFileUrl, resolveBlobUrl } from "@/lib/blob"

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

async function removeFromAddressBook(
  email: string,
  bookId: number,
  token: string,
): Promise<void> {
  const payload = JSON.stringify({ emails: [email] })
  console.log(`[SendPulse] removeFromBook bookId=${bookId}:`, payload)
  const { status, text } = await spDelete(
    `${SENDPULSE_API}/addressbooks/${bookId}/emails`,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    payload,
  )
  console.log(`[SendPulse] remove bookId=${bookId} status=${status}`, text)
}

/**
 * Adds/updates an employer's SendPulse subscription (master book + one book per stream).
 * Pass `previous` when re-syncing an already-confirmed employer after an edit — it removes
 * stale book membership (streams the employer is no longer part of, or the old email address
 * entirely if it changed) before (re-)adding the current data.
 */
async function syncEmployerToSendPulse(
  employer: {
    name: string
    email: string
    phone: string
    telegram?: string
    linkedin?: string
    primaryContact: string
    streams: string[]
    token?: string
  },
  previous?: { email: string; streams: string[] },
): Promise<void> {
  console.log("[SendPulse] syncEmployerToSendPulse", { email: employer.email })
  const token = await getToken()
  if (!token) { console.warn("[SendPulse] failed to get access token"); return }

  const masterBookName = process.env.SENDPULSE_MASTER_BOOK_NAME || "Default"

  if (previous) {
    const emailChanged = previous.email.trim().toLowerCase() !== employer.email.trim().toLowerCase()
    const staleStreams = emailChanged
      ? previous.streams
      : previous.streams.filter(
          (s) => !employer.streams.some((ns) => ns.trim().toLowerCase() === s.trim().toLowerCase()),
        )
    const staleBookNames = [...new Set(emailChanged ? [masterBookName, ...staleStreams] : staleStreams)]
    await Promise.all(
      staleBookNames.map(async (name) => {
        const id = await getBookId(name, token)
        if (id) await removeFromAddressBook(previous.email, id, token)
      }),
    )
  }

  const variables: Record<string, string> = {
    "Имя": employer.name,
    phone: employer.phone,
    ...(employer.telegram && { Telegram: employer.telegram }),
    ...(employer.linkedin && { LinkedIn: employer.linkedin }),
    "Primary Contact": employer.primaryContact,
    Streams: employer.streams.join(", "),
    ...(employer.token && { employer_token: employer.token }),
  }

  const bookNames = [...new Set([masterBookName, ...employer.streams])]
  const bookIds = await Promise.all(bookNames.map((n) => getOrCreateBook(n, token)))
  await Promise.all(bookIds.map((id) => addToAddressBook(employer.email, id, variables, token)))
}

/** Fully unsubscribes an employer from SendPulse — master book and every stream book they were in. */
async function removeEmployerFromSendPulse(employer: { email: string; streams: string[] }): Promise<void> {
  console.log("[SendPulse] removeEmployerFromSendPulse", { email: employer.email })
  const token = await getToken()
  if (!token) { console.warn("[SendPulse] failed to get access token"); return }

  const masterBookName = process.env.SENDPULSE_MASTER_BOOK_NAME || "Default"
  const bookNames = [...new Set([masterBookName, ...employer.streams])]
  await Promise.all(
    bookNames.map(async (name) => {
      const id = await getBookId(name, token)
      if (id) await removeFromAddressBook(employer.email, id, token)
    }),
  )
}

/**
 * currentActiveSince is the value already shown in the editor for this candidate — if it's
 * already set (e.g. re-approving a previously disabled candidate), it's left untouched;
 * "Активен с" only gets today's date when the field was empty.
 */
export async function approveCandidate(rowIndex: number, currentActiveSince?: string): Promise<void> {
  const activeSince = currentActiveSince?.trim() ? undefined : new Date().toLocaleDateString("ru-RU")
  await updateCandidateStatus(rowIndex, "Активный" as CandidateStatus, activeSince)
  revalidatePath("/editor/candidates")
}

export async function rejectCandidate(rowIndex: number): Promise<void> {
  await updateCandidateStatus(rowIndex, "Отклонён" as CandidateStatus)
  revalidatePath("/editor/candidates")
}

export type PublishResult = {
  listId: string
  stream: string
  campaignId: number
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function buildEmailHtml(stream: string, date: string, url: string): string {
  const s = escapeHtml(stream)
  const d = escapeHtml(date)
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
            ${d}&nbsp;&nbsp;·&nbsp;&nbsp;новые кандидаты в этом выпуске
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
  const html = buildEmailHtml(list.stream, list.date, listUrl)

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
  resumeFilename?: string
  coverLetter: string
}

export async function registerCandidate(data: CandidateData): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email.trim()) throw new Error("Укажите email")

  const id = crypto.randomUUID()
  await appendCandidateRow({
    "id": id,
    "timestamp": new Date().toISOString(),
    "name": data.name,
    "email": data.email,
    "phone": data.phone,
    "resume url": data.resumeUrl,
    "cover letter": data.coverLetter,
    "status": "На проверке",
  })

  if (data.resumeUrl) {
    await addResumeVersion({
      candidateId: id,
      kind: isOwnFileUrl(data.resumeUrl) ? "file" : "link",
      filename: data.resumeFilename,
      url: data.resumeUrl,
    })
  }
}

/** Editor-only "quick add" — unlike registerCandidate(), writes the full field set in one go
 * (title/level/stream/countries/summary included). Status is still "На проверке": whoever adds
 * the candidate (e.g. a secretary) isn't necessarily who should approve them (a recruiter). */
export type NewCandidateData = {
  name: string
  title: string
  email: string
  phone: string
  level: string
  activeSince: string
  stream: string[]
  countryPrimary: string
  countryDesired: string
  summary: string
  resumeUrl: string
  resumeFilename?: string
  coverLetter: string
}

export async function createCandidate(data: NewCandidateData): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email.trim()) throw new Error("Укажите email")

  const id = crypto.randomUUID()
  const { rowIndex } = await appendCandidateRow({
    "id": id,
    "timestamp": new Date().toISOString(),
    "name": data.name,
    "email": data.email,
    "phone": data.phone,
    "resume url": data.resumeUrl,
    "cover letter": data.coverLetter,
    "status": "На проверке",
  })

  await updateCandidateFields(rowIndex, {
    title: data.title,
    level: data.level,
    activeSince: data.activeSince,
    stream: data.stream.join(", "),
    countryPrimary: data.countryPrimary,
    countryDesired: data.countryDesired,
    summary: data.summary,
  })

  if (data.resumeUrl) {
    await addResumeVersion({
      candidateId: id,
      kind: isOwnFileUrl(data.resumeUrl) ? "file" : "link",
      filename: data.resumeFilename,
      url: data.resumeUrl,
    })
  }

  revalidatePath("/editor/candidates")
}

export async function updateCandidate(
  rowIndex: number,
  data: {
    candidateId: string
    name: string
    email: string
    phone: string
    resumeUrl: string
    resumeVersionChanged?: boolean
    resumeFilename?: string
    coverLetter: string
    stream: string[]
    level: string
    countryPrimary: string
    countryDesired: string
    activeSince: string
    title: string
    summary: string
  },
): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email.trim()) throw new Error("Укажите email")
  await updateCandidateFields(rowIndex, {
    name: data.name,
    email: data.email,
    phone: data.phone,
    resumeUrl: data.resumeUrl,
    coverLetter: data.coverLetter,
    stream: data.stream.join(", "),
    level: data.level,
    countryPrimary: data.countryPrimary,
    countryDesired: data.countryDesired,
    activeSince: data.activeSince,
    title: data.title,
    summary: data.summary,
  })

  if (data.resumeVersionChanged && data.resumeUrl) {
    await addResumeVersion({
      candidateId: data.candidateId,
      kind: isOwnFileUrl(data.resumeUrl) ? "file" : "link",
      filename: data.resumeFilename,
      url: data.resumeUrl,
    })
  }

  revalidatePath("/editor/candidates")
}

/** Resume version history for a candidate (editor only — keyed by the Sheets `id` column). */
export async function getCandidateResumeHistory(candidateId: string): Promise<ResumeVersion[]> {
  return getResumeVersions(candidateId)
}

/**
 * Deletes a single resume version from the history list (editor only). Looks the version up
 * fresh from Neon by id rather than trusting kind/url from the client, so a stale or crafted
 * "link" kind can't leave an orphaned file in Vercel Blob. Blob deletion is best-effort, same
 * as deleteCandidate() — a failed delete is logged, not fatal, so the row still gets removed.
 */
export async function deleteCandidateResumeVersion(candidateId: string, versionId: string): Promise<void> {
  const versions = await getResumeVersions(candidateId)
  const version = versions.find((v) => v.id === versionId)
  if (version?.kind === "file") {
    const blobUrl = resolveBlobUrl(version.url)
    if (blobUrl) {
      await del(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((err) => {
        console.warn("[deleteCandidateResumeVersion] failed to delete blob:", blobUrl, err)
      })
    }
  }
  await deleteResumeVersion(versionId)
  revalidatePath("/editor/candidates")
}

/**
 * Permanently deletes a candidate: their resume files from Vercel Blob, their resume
 * history in Neon, and finally the row itself in Sheets. Blob deletion is best-effort —
 * a failed delete (blob already gone, transient error) is logged, not fatal, so the row
 * still gets removed.
 */
export async function deleteCandidate(rowIndex: number, candidateId: string): Promise<void> {
  if (candidateId) {
    const versions = await getResumeVersions(candidateId)
    await Promise.all(
      versions
        .map((v) => resolveBlobUrl(v.url))
        .filter((url): url is string => Boolean(url))
        .map((url) =>
          del(url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch((err) => {
            console.warn("[deleteCandidate] failed to delete blob:", url, err)
          }),
        ),
    )
    await deleteResumeVersions(candidateId)
  }
  await deleteCandidateRow(rowIndex)
  revalidatePath("/editor/candidates")
}

export type RegisterEmployerResult = { ok: true } | { ok: false; error: string }

/** Returns a result object instead of throwing: Next.js redacts thrown Error messages
 * from Server Actions in production builds, so user-facing validation errors (as opposed
 * to unexpected failures) must travel back as data, not as an exception. */
export async function registerEmployer(data: EmployerData): Promise<RegisterEmployerResult> {
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }
  if (!data.email || !data.phone) return { ok: false, error: "Email и телефон обязательны" }
  if (!data.streams.length) return { ok: false, error: "Выберите хотя бы один стрим" }
  if (data.primaryContact === "telegram" && !data.telegram.trim()) {
    return { ok: false, error: "Укажите Telegram-имя" }
  }
  if (data.primaryContact === "linkedin" && !data.linkedin.trim()) {
    return { ok: false, error: "Укажите LinkedIn-профиль" }
  }

  const existing = await getEmployers()
  const active = existing.filter((e) => e.status === "На проверке" || e.status === "Подтверждён")
  const emailNorm = data.email.trim().toLowerCase()
  const digitsOnly = (p: string) => p.replace(/\D/g, "")
  const phoneNorm = digitsOnly(data.phone)

  if (active.some((e) => e.email.toLowerCase() === emailNorm)) {
    return { ok: false, error: "Работодатель с таким email уже зарегистрирован" }
  }
  if (phoneNorm && active.some((e) => digitsOnly(e.phone) === phoneNorm)) {
    return { ok: false, error: "Работодатель с таким номером телефона уже зарегистрирован" }
  }

  await createEmployer({
    name: data.name,
    company: data.company,
    email: data.email,
    phone: data.phone,
    primaryContact: data.primaryContact,
    telegram: data.telegram || "",
    linkedin: data.linkedin || "",
    streams: data.streams,
    status: "На проверке",
    country: data.country,
    additionalCountries: data.additionalCountries,
  })
  revalidatePath("/editor/employers")
  return { ok: true }
}

export async function updateEmployer(
  token: string,
  data: {
    name: string
    company: string
    email: string
    phone: string
    primaryContact: EmployerData["primaryContact"]
    telegram: string
    linkedin: string
    streams: string[]
    country: string
    additionalCountries: string[]
  },
): Promise<RegisterEmployerResult> {
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }
  if (!data.email.trim()) return { ok: false, error: "Укажите email" }
  if (!data.phone.trim()) return { ok: false, error: "Укажите телефон" }
  if (!data.streams.length) return { ok: false, error: "Выберите хотя бы один стрим" }
  if (data.primaryContact === "telegram" && !data.telegram.trim()) {
    return { ok: false, error: "Укажите Telegram-имя" }
  }
  if (data.primaryContact === "linkedin" && !data.linkedin.trim()) {
    return { ok: false, error: "Укажите LinkedIn-профиль" }
  }

  const existing = await getEmployerByToken(token)

  await updateEmployerFields(token, {
    name: data.name,
    company: data.company,
    email: data.email,
    phone: data.phone,
    primaryContact: data.primaryContact,
    telegram: data.telegram,
    linkedin: data.linkedin,
    streams: data.streams,
    country: data.country,
    additionalCountries: data.additionalCountries,
  })

  if (existing?.status === "Подтверждён") {
    await syncEmployerToSendPulse(
      {
        name: data.name,
        email: data.email,
        phone: data.phone,
        telegram: data.telegram,
        linkedin: data.linkedin,
        primaryContact: data.primaryContact,
        streams: data.streams,
        token: existing.token,
      },
      { email: existing.email, streams: existing.streams },
    )
  }

  revalidatePath("/editor/employers")
  return { ok: true }
}

export async function confirmEmployer(token: string, employer: Pick<Employer, "token" | "name" | "email" | "phone" | "telegram" | "linkedin" | "primaryContact" | "streams">): Promise<void> {
  await syncEmployerToSendPulse(employer)
  await updateEmployerFields(token, { status: "Подтверждён" })
  revalidatePath("/editor")
}

export async function rejectEmployer(token: string): Promise<void> {
  const existing = await getEmployerByToken(token)
  if (existing?.status === "Подтверждён") {
    await removeEmployerFromSendPulse(existing)
  }
  await updateEmployerFields(token, { status: "Отклонён" })
  revalidatePath("/editor")
  revalidatePath("/editor/employers")
}

export async function deleteEmployer(token: string): Promise<void> {
  const existing = await getEmployerByToken(token)
  if (existing?.status === "Подтверждён") {
    await removeEmployerFromSendPulse(existing)
  }
  await deleteEmployerRecord(token)
  revalidatePath("/editor")
  revalidatePath("/editor/employers")
}

export async function setContactRequestStatus(id: string, status: ContactRequestStatus): Promise<void> {
  await updateContactRequestStatus(id, status)
  revalidatePath("/editor")
}

export async function submitGeneralInquiry(listId: string, employerToken: string): Promise<void> {
  if (!employerToken) throw new Error("Токен работодателя не найден в URL")

  const employer = await getEmployerByToken(employerToken)
  if (!employer) throw new Error("Работодатель не найден")

  const lists = await getMailingLists()
  const list = lists.find((l) => l.listId === listId)
  const streamId = await getStreamIdByName(list?.stream ?? "")

  await appendContactRequest({
    listId,
    streamId,
    candidateId: "",
    employerToken,
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
  const streamId = await getStreamIdByName(list?.stream ?? "")

  await appendContactRequest({
    listId,
    streamId,
    candidateId,
    employerToken,
  })
}

export async function updateStream(
  id: number,
  data: { name: string; type: string; description: string },
): Promise<void> {
  await updateStreamRecord(id, data)
  revalidatePath("/editor/streams")
}

export async function createStream(data: {
  name: string
  type: string
  description: string
}): Promise<void> {
  await createStreamRecord(data)
  revalidatePath("/editor/streams")
}

export async function deleteStream(id: number): Promise<void> {
  await deleteStreamRecord(id)
  revalidatePath("/editor/streams")
}
