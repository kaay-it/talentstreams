"use server"

import { revalidatePath } from "next/cache"
import { del } from "@vercel/blob"
import { getCandidates, createCandidateRecord, updateCandidateStatus, updateCandidateFields, deleteCandidateRecord, type CandidateStatus } from "@/lib/db/candidates"
import { getMailingLists, getMailingListMeta, getMailingListCandidateIds, createMailingListRows, deleteMailingListRows, getMailingListsForCandidate, updateMailingListTimestamp, markMailingListSent, createMailingListRecipientRows, getMailingListRecipientTokens, replaceMailingListEntries, replaceMailingListRecipients, campaignNameFor, isoToRu } from "@/lib/db/mailing-lists"
import { appendContactRequest, updateContactRequestStatus, type ContactRequestStatus } from "@/lib/db/contact-requests"
import { addResumeVersion, getResumeVersions, deleteResumeVersions, deleteResumeVersion, type ResumeVersion } from "@/lib/db/resumes"
export type { ResumeVersion, ResumeVersionKind } from "@/lib/db/resumes"
import { updateStreamRecord, createStreamRecord, deleteStreamRecord, getStreamIdByName, getStreamById } from "@/lib/db/streams"
import { getEmployers, getEmployerByToken, createEmployer, updateEmployerFields, deleteEmployer as deleteEmployerRecord, type Employer, type EmployerPickOption } from "@/lib/db/employers"
import { searchCompanies as searchCompaniesDb, findOrCreateCompanyByName } from "@/lib/db/companies"
import { spPost, spGet, spDelete, getToken, getOrCreateBook, getBookId, deleteAddressBook, telegramConnectUrl, sendTelegramToEmployer, disableTelegramContact, deleteTelegramContact } from "@/lib/sendpulse"
import { isOwnFileUrl, resolveBlobUrl } from "@/lib/blob"
import { previewCandidatesImport as previewImport, importCandidatesFromSheet, type ImportPreview, type ImportResult } from "@/lib/sheets-import"
export type { ImportPreview, ImportResult, ImportRow, ImportSkipped } from "@/lib/sheets-import"

const SENDPULSE_API = "https://api.sendpulse.com"

/**
 * Postgres unique-violation (code 23505) constraint name, if `err` is one — undefined otherwise,
 * so callers can `if (!constraint) throw err` to let anything unexpected propagate. The neon-http
 * driver wraps the real pg error in `.cause`; see candidates_email_unique/candidates_phone_unique/
 * employers_email_unique/employers_phone_unique (lib/db/schema.ts) for the names this returns.
 */
function uniqueViolationConstraint(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: string; constraint?: string } } | undefined)?.cause
  return cause?.code === "23505" ? cause.constraint : undefined
}

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
export async function approveCandidate(id: string, currentActiveSince?: string): Promise<void> {
  const activeSince = currentActiveSince?.trim() ? undefined : new Date().toLocaleDateString("ru-RU")
  await updateCandidateStatus(id, "Активный" as CandidateStatus, activeSince)
  revalidatePath("/editor/candidates")
}

export async function rejectCandidate(id: string): Promise<void> {
  await updateCandidateStatus(id, "Отклонён" as CandidateStatus)
  revalidatePath("/editor/candidates")
}

/** Creates a new release ("Mailing lists" rows) for a stream — the automated alternative to
 * typing rows by hand in Google Sheets. The editor picks the final candidate list in the UI;
 * this just writes it. */
/** Company names of a narrowed release's recipients, for the SendPulse campaign name suffix and
 * the editor's release-list badge. At most 3 named explicitly — beyond that, "и ещё N", so a
 * broad manual pick (dozens of individual employers across many companies) doesn't blow up the
 * SendPulse campaign name. */
function recipientLabelFor(employers: Employer[]): string {
  const companies = [...new Set(employers.map((e) => e.company).filter(Boolean))]
  if (companies.length <= 3) return companies.join(", ")
  return `${companies.slice(0, 3).join(", ")} и ещё ${companies.length - 3}`
}

export async function createMailingList(data: {
  stream: string
  date: string
  candidateIds: string[]
  employerTokens?: string[]
}): Promise<{ listId: string }> {
  if (!data.stream.trim()) throw new Error("Выберите стрим")
  if (!data.date.trim()) throw new Error("Укажите дату рассылки")

  let recipientLabel = ""
  if (data.employerTokens?.length) {
    const employers = (await Promise.all(data.employerTokens.map((t) => getEmployerByToken(t))))
      .filter((e): e is Employer => Boolean(e))
    recipientLabel = recipientLabelFor(employers)
  }

  const result = await createMailingListRows({ ...data, recipientLabel })
  if (data.employerTokens?.length) {
    await createMailingListRecipientRows(result.listId, data.employerTokens)
  }
  revalidatePath("/editor")
  return result
}

/** Edits a release that hasn't been sent yet — stream is fixed at creation and not editable here
 * (changing it would orphan the candidate/recipient selections, which are stream-specific; a
 * different stream means a new release). sentCampaignId is re-checked fresh on the server, not
 * trusted from whatever state the edit form was opened with — same guard as deleteMailingList(). */
export async function updateMailingList(
  listId: string,
  data: { date: string; candidateIds: string[]; employerTokens?: string[] },
): Promise<void> {
  const list = await getMailingListMeta(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)
  if (list.sentCampaignId !== null) throw new Error("Эта рассылка уже отправлена — редактирование недоступно")
  if (!data.date.trim()) throw new Error("Укажите дату рассылки")

  await updateMailingListTimestamp(listId, `${data.date}T00:00:00`)
  await replaceMailingListEntries(listId, data.candidateIds)

  let recipientLabel = ""
  if (data.employerTokens?.length) {
    const employers = (await Promise.all(data.employerTokens.map((t) => getEmployerByToken(t))))
      .filter((e): e is Employer => Boolean(e))
    recipientLabel = recipientLabelFor(employers)
  }
  await replaceMailingListRecipients(listId, data.employerTokens ?? [], recipientLabel)

  revalidatePath("/editor")
}

/** Resolves a release's recipient-override tokens into displayable employer data — used by the
 * edit modal (to seed the current selection) and the view modal (to show who it actually went
 * to). [] means the release targets the whole stream (no override rows). */
export async function getMailingListRecipients(listId: string): Promise<EmployerPickOption[]> {
  const tokens = await getMailingListRecipientTokens(listId)
  if (!tokens.length) return []
  const employers = (await Promise.all(tokens.map((t) => getEmployerByToken(t))))
    .filter((e): e is Employer => Boolean(e))
  return employers.map((e) => ({ token: e.token, name: e.name, email: e.email, company: e.company }))
}

/** Deletes a release ("Mailing lists" rows) — only allowed before it has ever been sent,
 * since a sent release is already out in a SendPulse campaign and deleting it here
 * would desync the site from what employers actually received. sentCampaignId is the real
 * SendPulse campaign id (set once on first send, see publishMailingList()) — the only source of
 * truth for "was this release sent", not a name comparison against SendPulse's campaign list. */
export async function deleteMailingList(listId: string): Promise<void> {
  const list = await getMailingListMeta(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)

  if (list.sentCampaignId !== null) {
    throw new Error("Эта рассылка уже отправлена — удалить её нельзя")
  }

  await deleteMailingListRows(listId)
  revalidatePath("/editor")
}

export type PublishResult = {
  listId: string
  stream: string
  campaignId: number
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function buildEmailHtml(stream: string, date: string, url: string, telegramUrl: string | null): string {
  const s = escapeHtml(stream)
  const d = escapeHtml(date)
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif"
  const telegramBlock = telegramUrl
    ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px">
            <tr>
              <td style="padding:16px 20px">
                <p style="margin:0 0 12px;font-size:13px;color:#475569;line-height:1.6;font-family:${font}">
                  Хотите получать выпуски в Telegram? Подключите нашего бота.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background:#229ED9">
                      <a href="${telegramUrl.replace(/&/g, "&amp;")}" style="display:inline-block;padding:9px 18px;font-size:13px;font-weight:600;color:#fff;text-decoration:none;font-family:${font}">
                        Подключить Telegram
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`
    : ""

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
${telegramBlock}

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

function todayIso(): string {
  return offsetIso({})
}

/** Today's date, ISO "YYYY-MM-DD", shifted by a calendar amount — used to compute the next
 * allowed publication date for the TASK-05 pause rule (setMonth/setFullYear so "3 months"/"10
 * years" land on the right calendar date, not a fixed day count). */
function offsetIso(delta: { days?: number; months?: number; years?: number }): string {
  const d = new Date()
  if (delta.days) d.setDate(d.getDate() + delta.days)
  if (delta.months) d.setMonth(d.getMonth() + delta.months)
  if (delta.years) d.setFullYear(d.getFullYear() + delta.years)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * TASK-05 publication-pause rule, applied to exactly the candidates of a release right after its
 * first real send (never on a resend — see the `!alreadySent` guard at the call site). `sentBefore`
 * for each candidate is counted from their real mailing history via `sentCampaignId` — only
 * releases actually sent at least once count, see getMailingListsForCandidate():
 * 1st real send → 2-week pause, 2nd → 3-month pause, 3rd → retired for good ("Не публиковать").
 * The 3rd-send cutoff is a deliberate simplification beyond §13 of the spec (which only defines
 * the pause after the 2nd send) — decided with the user rather than left open. Pushing `activeSince`
 * 10 years out on retirement is belt-and-suspenders: getProfiles() already excludes "Не публиковать"
 * candidates from every release, this just keeps the date field consistent if that ever changes.
 */
async function applyPublicationPauseRules(candidateIds: string[]): Promise<void> {
  if (!candidateIds.length) return

  const allCandidates = await getCandidates()
  const candidateById = new Map(allCandidates.map((c) => [c.id, c]))

  await Promise.all(
    candidateIds.map(async (id) => {
      const candidate = candidateById.get(id)
      if (!candidate) return // candidate row deleted since the release was created

      const history = await getMailingListsForCandidate(id)
      const sentBefore = history.filter((e) => e.sentCampaignId !== null).length
      const sendNumber = sentBefore + 1

      if (sendNumber === 1) {
        await updateCandidateStatus(candidate.id, "Активный", isoToRu(offsetIso({ days: 14 })))
      } else if (sendNumber === 2) {
        await updateCandidateStatus(candidate.id, "Активный", isoToRu(offsetIso({ months: 3 })))
      } else {
        await updateCandidateStatus(candidate.id, "Не публиковать", isoToRu(offsetIso({ years: 10 })))
      }
    }),
  )
}

export async function publishMailingList(listId: string): Promise<PublishResult> {
  const list = await getMailingListMeta(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)

  const alreadySent = list.sentCampaignId !== null

  // Date is just a plan — the manager can end up sending on a different day. Snap it to the actual
  // send moment the first time this release goes out; leave it alone on every resend, so the
  // campaign name/subject stay consistent with the one already delivered to employers.
  let date = list.date
  if (!alreadySent) {
    const now = new Date()
    const todayRu = isoToRu(now.toISOString().slice(0, 10))
    if (todayRu !== list.date) {
      await updateMailingListTimestamp(listId, now.toISOString())
      date = todayRu
    }
  }

  const token = await getToken()
  if (!token) throw new Error("Не удалось получить токен SendPulse")

  // A narrowed release gets a fresh throwaway book every publish call (first send AND resend) —
  // rebuilt from current employer data, then always torn down after, regardless of outcome.
  const recipientTokens = await getMailingListRecipientTokens(listId)
  let bookId: number
  let adhocBookId: number | null = null

  if (recipientTokens.length) {
    const recipients = (await Promise.all(recipientTokens.map((t) => getEmployerByToken(t))))
      .filter((e): e is Employer => Boolean(e))
    if (!recipients.length) {
      throw new Error("Выбранные получатели больше не найдены — пересоздайте выпуск")
    }
    const adhocBookName = `${list.stream} — ${date} — ${listId}`
    adhocBookId = await getOrCreateBook(adhocBookName, token)
    await Promise.all(
      recipients.map((employer) =>
        addToAddressBook(
          employer.email,
          adhocBookId!,
          {
            "Имя": employer.name,
            phone: employer.phone,
            Streams: employer.streams.join(", "),
            employer_token: employer.token,
          },
          token,
        ),
      ),
    )
    bookId = adhocBookId
  } else {
    bookId = await getOrCreateBook(list.stream, token)
  }

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const listUrl = `${appUrl}/list/${listId}?e={{employer_token}}`
  const subject = `Talent Stream: ${list.stream} — выпуск ${date}`
  const campaignName = campaignNameFor(list.stream, date, list.recipientLabel)
  const html = buildEmailHtml(list.stream, date, listUrl, telegramConnectUrl("{{employer_token}}"))

  let campaign: { id: number }
  try {
    campaign = await createCampaign(bookId, subject, html, campaignName)
  } finally {
    // Best-effort, runs even if createCampaign threw — never leave a throwaway book behind.
    if (adhocBookId !== null) await deleteAddressBook(adhocBookId, token)
  }

  // Only on a genuine first send — a resend must not advance any candidate's pause window again.
  if (!alreadySent) {
    await markMailingListSent(listId, campaign.id)
    const candidateIds = await getMailingListCandidateIds(listId)
    await applyPublicationPauseRules(candidateIds)
  }

  revalidatePath("/editor")
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

export type RegisterCandidateResult = { ok: true } | { ok: false; error: string }

/** Returns a result object instead of throwing: Next.js redacts thrown Error messages
 * from Server Actions in production builds, same reasoning as registerEmployer() below. */
export async function registerCandidate(data: CandidateData): Promise<RegisterCandidateResult> {
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }
  if (!data.email.trim()) return { ok: false, error: "Укажите email" }

  const id = crypto.randomUUID()
  try {
    await createCandidateRecord({
      id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      coverLetter: data.coverLetter,
      status: "На проверке",
    })
  } catch (err) {
    const constraint = uniqueViolationConstraint(err)
    if (constraint === "candidates_email_unique") return { ok: false, error: "Кандидат с таким email уже зарегистрирован" }
    if (constraint === "candidates_phone_unique") return { ok: false, error: "Кандидат с таким номером телефона уже зарегистрирован" }
    throw err
  }

  if (data.resumeUrl) {
    await addResumeVersion({
      candidateId: id,
      kind: isOwnFileUrl(data.resumeUrl) ? "file" : "link",
      filename: data.resumeFilename,
      url: data.resumeUrl,
    })
  }
  return { ok: true }
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

export async function createCandidate(data: NewCandidateData): Promise<RegisterCandidateResult> {
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }
  if (!data.email.trim()) return { ok: false, error: "Укажите email" }

  const id = crypto.randomUUID()
  try {
    await createCandidateRecord({
      id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      coverLetter: data.coverLetter,
      status: "На проверке",
      title: data.title,
      level: data.level,
      activeSince: data.activeSince,
      stream: data.stream,
      countryPrimary: data.countryPrimary,
      countryDesired: data.countryDesired,
      summary: data.summary,
    })
  } catch (err) {
    const constraint = uniqueViolationConstraint(err)
    if (constraint === "candidates_email_unique") return { ok: false, error: "Кандидат с таким email уже зарегистрирован" }
    if (constraint === "candidates_phone_unique") return { ok: false, error: "Кандидат с таким номером телефона уже зарегистрирован" }
    throw err
  }

  if (data.resumeUrl) {
    await addResumeVersion({
      candidateId: id,
      kind: isOwnFileUrl(data.resumeUrl) ? "file" : "link",
      filename: data.resumeFilename,
      url: data.resumeUrl,
    })
  }

  revalidatePath("/editor/candidates")
  return { ok: true }
}

export async function updateCandidate(
  id: string,
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
    excludedCompanies: string[]
    excludedStreams: string[]
  },
): Promise<RegisterCandidateResult> {
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }
  if (!data.email.trim()) return { ok: false, error: "Укажите email" }
  try {
    await updateCandidateFields(id, {
      name: data.name,
      email: data.email,
      phone: data.phone,
      coverLetter: data.coverLetter,
      stream: data.stream,
      level: data.level,
      countryPrimary: data.countryPrimary,
      countryDesired: data.countryDesired,
      activeSince: data.activeSince,
      title: data.title,
      summary: data.summary,
      excludedCompanies: data.excludedCompanies,
      excludedStreams: data.excludedStreams,
    })
  } catch (err) {
    const constraint = uniqueViolationConstraint(err)
    if (constraint === "candidates_email_unique") return { ok: false, error: "Кандидат с таким email уже зарегистрирован" }
    if (constraint === "candidates_phone_unique") return { ok: false, error: "Кандидат с таким номером телефона уже зарегистрирован" }
    throw err
  }

  if (data.resumeVersionChanged && data.resumeUrl) {
    await addResumeVersion({
      candidateId: data.candidateId,
      kind: isOwnFileUrl(data.resumeUrl) ? "file" : "link",
      filename: data.resumeFilename,
      url: data.resumeUrl,
    })
  }

  revalidatePath("/editor/candidates")
  return { ok: true }
}

/** Resume version history for a candidate (editor only — keyed by candidates.id). */
export async function getCandidateResumeHistory(candidateId: string): Promise<ResumeVersion[]> {
  return getResumeVersions(candidateId)
}

export type CandidateMailingHistoryEntry = { listId: string; stream: string; date: string; sent: boolean }

/**
 * Every release a candidate has ever been included in, newest first — visibility groundwork for
 * TASK-05 (publication pause rules, §13 ТЗ), before any automatic pause enforcement exists.
 * `sent` is read straight from mailingLists.sentCampaignId (a release can be created and never
 * actually sent, or deleted before sending) — not a name comparison against SendPulse campaigns.
 */
export async function getCandidateMailingHistory(candidateId: string): Promise<CandidateMailingHistoryEntry[]> {
  if (!candidateId) return []
  const entries = await getMailingListsForCandidate(candidateId)
  return entries.map((e) => ({ listId: e.listId, stream: e.stream, date: e.date, sent: e.sentCampaignId !== null }))
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
 * Permanently deletes a candidate: their resume files from Vercel Blob, then the candidate row
 * itself. candidateResumes rows cascade-delete automatically (FK ON DELETE CASCADE) — no need to
 * call deleteResumeVersions() explicitly. Blob deletion is best-effort — a failed delete (blob
 * already gone, transient error) is logged, not fatal, so the row still gets removed.
 */
export async function deleteCandidate(id: string): Promise<void> {
  const versions = await getResumeVersions(id)
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
  await deleteCandidateRecord(id)
  revalidatePath("/editor/candidates")
}

/** Read-only dry run of importCandidatesFromSheets() — reports what would happen, writes nothing. */
export async function previewCandidatesImport(): Promise<ImportPreview> {
  return previewImport()
}

/** Actually imports new candidates from the Google Sheet (lib/sheets-import.ts). */
export async function importCandidatesFromSheets(): Promise<ImportResult> {
  const result = await importCandidatesFromSheet()
  if (result.ok && result.imported.length > 0) {
    revalidatePath("/editor/candidates")
    revalidatePath("/editor")
  }
  return result
}

/** Autocomplete source for the "Компания" field in registration/edit forms. */
export async function searchCompanies(query: string) {
  return searchCompaniesDb(query)
}

export type RegisterEmployerResult =
  | { ok: true; telegramUrl?: string | null }
  | { ok: false; error: string }

/** Returns a result object instead of throwing: Next.js redacts thrown Error messages
 * from Server Actions in production builds, so user-facing validation errors (as opposed
 * to unexpected failures) must travel back as data, not as an exception. */
export async function registerEmployer(data: EmployerData): Promise<RegisterEmployerResult> {
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }
  if (!data.company.trim()) return { ok: false, error: "Укажите компанию" }
  if (!data.country.trim()) return { ok: false, error: "Укажите страну" }
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

  const token = crypto.randomUUID()
  const companyId = await findOrCreateCompanyByName(data.company)
  try {
    await createEmployer({
      token,
      name: data.name,
      companyId,
      email: data.email,
      phone: data.phone,
      primaryContact: data.primaryContact,
      telegram: data.telegram || "",
      linkedin: data.linkedin || "",
      streams: data.streams,
      status: "На проверке",
      country: data.country,
      additionalCountries: data.additionalCountries.length ? data.additionalCountries : ["Любая"],
    })
  } catch (err) {
    // Safety net against a race the pre-check above (active-only, normalized) can miss — e.g.
    // two concurrent submissions, or an exact-raw-value match among non-active employers.
    const constraint = uniqueViolationConstraint(err)
    if (constraint === "employers_email_unique") return { ok: false, error: "Работодатель с таким email уже зарегистрирован" }
    if (constraint === "employers_phone_unique") return { ok: false, error: "Работодатель с таким номером телефона уже зарегистрирован" }
    throw err
  }
  revalidatePath("/editor/employers")
  return { ok: true, telegramUrl: telegramConnectUrl(token) }
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
  if (!data.company.trim()) return { ok: false, error: "Укажите компанию" }
  if (!data.country.trim()) return { ok: false, error: "Укажите страну" }
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
  const companyId = await findOrCreateCompanyByName(data.company)

  try {
    await updateEmployerFields(token, {
      name: data.name,
      companyId,
      email: data.email,
      phone: data.phone,
      primaryContact: data.primaryContact,
      telegram: data.telegram,
      linkedin: data.linkedin,
      streams: data.streams,
      country: data.country,
      additionalCountries: data.additionalCountries.length ? data.additionalCountries : ["Любая"],
    })
  } catch (err) {
    const constraint = uniqueViolationConstraint(err)
    if (constraint === "employers_email_unique") return { ok: false, error: "Работодатель с таким email уже зарегистрирован" }
    if (constraint === "employers_phone_unique") return { ok: false, error: "Работодатель с таким номером телефона уже зарегистрирован" }
    throw err
  }

  if (existing?.status === "Подтверждён") {
    await syncEmployerToSendPulse(
      {
        name: data.name,
        email: data.email,
        phone: data.phone,
        streams: data.streams,
        token: existing.token,
      },
      { email: existing.email, streams: existing.streams },
    )
  }

  revalidatePath("/editor/employers")
  return { ok: true }
}

export async function confirmEmployer(token: string, employer: Pick<Employer, "token" | "name" | "email" | "phone" | "streams">): Promise<void> {
  await syncEmployerToSendPulse(employer)
  await updateEmployerFields(token, { status: "Подтверждён" })
  // Only reaches employers who already subscribed to the bot; the rest get the link in the welcome email.
  await sendTelegramToEmployer(
    employer.token,
    "Ваша заявка в TalentStreams одобрена! Первая подборка кандидатов придёт на email и сюда.",
  )
  revalidatePath("/editor")
}

export async function rejectEmployer(token: string): Promise<void> {
  const existing = await getEmployerByToken(token)
  if (existing?.status === "Подтверждён") {
    await removeEmployerFromSendPulse(existing)
  }
  // Telegram can be connected independently of email confirmation (the bot link is shown
  // right after registration) — disable unconditionally, not just for "Подтверждён".
  await disableTelegramContact(token)
  await updateEmployerFields(token, { status: "Отклонён" })
  revalidatePath("/editor")
  revalidatePath("/editor/employers")
}

export async function deleteEmployer(token: string): Promise<void> {
  const existing = await getEmployerByToken(token)
  if (existing?.status === "Подтверждён") {
    await removeEmployerFromSendPulse(existing)
  }
  await deleteTelegramContact(token)
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

  const list = await getMailingListMeta(listId)
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

  const list = await getMailingListMeta(listId)
  const streamId = await getStreamIdByName(list?.stream ?? "")

  await appendContactRequest({
    listId,
    streamId,
    candidateId,
    employerToken,
  })
}

/** True if a stream has at least one release that was actually sent as a SendPulse campaign —
 * not just created. A stream in this state has its name baked into a permanent campaign title
 * and (via mailingListEntries.streamId) into real send history, so renaming/deleting it would
 * silently desync that history. Archiving is always safe instead — it doesn't touch the name. */
async function streamHasSentReleases(streamId: number): Promise<boolean> {
  const lists = await getMailingLists()
  return lists.some((l) => l.streamId === streamId && l.sentCampaignId !== null)
}

export async function updateStream(
  id: number,
  data: { name: string; type: string; description: string },
): Promise<void> {
  const existing = await getStreamById(id)
  if (!existing) throw new Error("Стрим не найден")
  if (data.name !== existing.name && (await streamHasSentReleases(id))) {
    throw new Error("У стрима уже есть отправленные рассылки — переименование недоступно, можно только архивировать")
  }
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
  if (await streamHasSentReleases(id)) {
    throw new Error("У стрима уже есть отправленные рассылки — удаление недоступно, можно только архивировать")
  }
  await deleteStreamRecord(id)
  revalidatePath("/editor/streams")
}

export async function archiveStream(id: number): Promise<void> {
  await updateStreamRecord(id, { status: "Архивный" })
  revalidatePath("/editor/streams")
}

export async function unarchiveStream(id: number): Promise<void> {
  await updateStreamRecord(id, { status: "Активный" })
  revalidatePath("/editor/streams")
}
