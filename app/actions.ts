"use server"

import { revalidatePath } from "next/cache"
import { requireEditorAuth } from "@/lib/auth"
import { del } from "@vercel/blob"
import {
  getCandidates, getCandidateById, getConfirmedCandidates, createCandidateRecord, updateCandidateStatus, updateCandidateFields, deleteCandidateRecord,
  buildEmbeddingSourceText, getCandidatesNeedingEmbedding, setCandidateEmbedding, findSimilarCandidatePairs,
  type Candidate, type CandidateStatus,
} from "@/lib/db/candidates"
import {
  getMailingLists, getMailingListMeta, getMailingList, getCandidateExposureCounts, resolveMailingListForEmployer, createMailingListRows,
  deleteMailingListRows, getMailingListsForCandidate, updateMailingListTimestamp, markMailingListSent,
  createMailingListRecipientRows, getMailingListRecipientTokens,
  replaceMailingListRecipients, getEmployersWithoutSelection, attachSelectionsToMailingList, getSelectionById,
  getSelectionsForStream as getSelectionsForStreamRows,
  getAllSelections as getAllSelectionsRows,
  createSelection as createSelectionRows,
  updateSelection as updateSelectionRows,
  deleteSelection as deleteSelectionRows,
  detachSelection as detachSelectionRows,
  reassignSelectionEntriesToSurvivor,
  getReleaseAudience,
  campaignNameFor, isoToRu,
} from "@/lib/db/mailing-lists"
import { appendContactRequest, updateContactRequestStatus, getEmployerTokensWithRequestForList, reassignContactRequestsToSurvivor, type ContactRequestStatus } from "@/lib/db/contact-requests"
import { addResumeVersion, getResumeVersions, deleteResumeVersions, deleteResumeVersion, reassignResumesToSurvivor, type ResumeVersion } from "@/lib/db/resumes"
export type { ResumeVersion, ResumeVersionKind } from "@/lib/db/resumes"
import { updateStreamRecord, createStreamRecord, deleteStreamRecord, getStreamIdByName, getStreamById } from "@/lib/db/streams"
import { getEmployers, getEmployerByToken, confirmedEmployersForStream, filterCandidatesForEmployer, createEmployer, updateEmployerFields, deleteEmployer as deleteEmployerRecord, type Employer, type EmployerPickOption } from "@/lib/db/employers"
import { searchCompanies as searchCompaniesDb, findOrCreateCompanyByName } from "@/lib/db/companies"
import {
  getCandidateDigestSettings as getCandidateDigestSettingsDb,
  setCandidateDigestAutoSend as setCandidateDigestAutoSendDb,
  getCandidateDigestRuns as getCandidateDigestRunsDb,
  recordCandidateDigestRun,
  type DigestRun,
} from "@/lib/db/candidate-digest"
import {
  getReleaseFollowUpSettings as getReleaseFollowUpSettingsDb,
  setReleaseFollowUpAutoSend as setReleaseFollowUpAutoSendDb,
  getReleaseFollowUpRuns as getReleaseFollowUpRunsDb,
  recordReleaseFollowUpRun,
  getEvaluatedFollowUpKeys,
  recordFollowUpOutcome,
  type FollowUpRun,
} from "@/lib/db/release-follow-ups"
import { spPost, spGet, spDelete, getToken, getOrCreateBook, getBookId, telegramConnectUrl, sendTelegramToEmployer, enableTelegramContact, disableTelegramContact, deleteTelegramContact, sendTransactionalEmail, getCampaignSendDate, getCampaignEmailStatus } from "@/lib/sendpulse"
import { isGeminiConfigured, embedTexts } from "@/lib/gemini"
import { buildConsentRequestEmailHtml, buildDigestEmailHtml, buildFollowUpFeedbackEmailHtml, buildFollowUpReminderEmailHtml } from "@/lib/email-templates"
import { isOwnFileUrl, resolveBlobUrl } from "@/lib/blob"
import { previewCandidatesImport as previewImport, importCandidatesFromSheet, type ImportPreview, type ImportResult } from "@/lib/sheets-import"
export type { ImportPreview, ImportResult, ImportRow, ImportSkipped } from "@/lib/sheets-import"
export type { DigestRun } from "@/lib/db/candidate-digest"
export type { FollowUpRun } from "@/lib/db/release-follow-ups"

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

/** Every contact email currently in an address book — paginated at the API's own 100-per-page
 * cap (`GET /addressbooks/{id}/emails`, confirmed against SendPulse's own OpenAPI spec,
 * api.sendpulse.com/.well-known/openapi/bulk-email.yaml). Used by runCandidateDigest() to
 * reconcile the "Candidates" book: anyone present who is no longer eligible gets removed before
 * the campaign goes out. */
async function listAddressBookEmails(bookId: number, token: string): Promise<string[]> {
  const emails: string[] = []
  let offset = 0
  while (true) {
    const { status, text } = await spGet(
      `${SENDPULSE_API}/addressbooks/${bookId}/emails?limit=100&offset=${offset}`,
      { Authorization: `Bearer ${token}` },
    )
    if (status < 200 || status >= 300) {
      console.warn(`[SendPulse] GET /addressbooks/${bookId}/emails status=${status}`, text)
      break
    }
    const page = JSON.parse(text) as Array<{ email: string }>
    if (!page.length) break
    emails.push(...page.map((e) => e.email))
    offset += page.length
  }
  return emails
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

/** Adds a confirmed candidate to the single "Candidates" SendPulse book — the only purpose is
 * to trigger a SendPulse Automation 360 flow ("contact added to book") that sends the welcome
 * email, same mechanism as the employer welcome email (TASK-10) — no HTML is built or sent by
 * this app's code. The same book is also reconciled by runCandidateDigest() (digest campaign
 * target) — one book for both, see docs/backlog.adoc for why. */
async function syncCandidateToSendPulse(candidate: { id: string; name: string; email: string; phone: string }): Promise<void> {
  const token = await getToken()
  if (!token) { console.warn("[SendPulse] failed to get access token"); return }
  const bookName = process.env.SENDPULSE_CANDIDATE_BOOK_NAME || "Candidates"
  const bookId = await getOrCreateBook(bookName, token)
  await addToAddressBook(candidate.email, bookId, { "Имя": candidate.name, phone: candidate.phone, candidate_id: candidate.id }, token)
}

/** Removes a candidate from the "Candidates" book — mirrors removeEmployerFromSendPulse().
 * Called on explicit rejection/deletion only, never on a manual "Не публиковать" pause
 * (pauseCandidate()) — that status doesn't mean the candidate was rejected, see getConfirmedCandidates(). */
async function removeCandidateFromSendPulse(email: string): Promise<void> {
  const token = await getToken()
  if (!token) { console.warn("[SendPulse] failed to get access token"); return }
  const bookName = process.env.SENDPULSE_CANDIDATE_BOOK_NAME || "Candidates"
  const bookId = await getBookId(bookName, token)
  if (bookId) await removeFromAddressBook(email, bookId, token)
}

/**
 * currentActiveSince is the value already shown in the editor for this candidate — if it's
 * already set (e.g. re-approving a previously disabled candidate), it's left untouched;
 * "Активен с" only gets today's date when the field was empty.
 */
export async function approveCandidate(id: string, currentActiveSince?: string): Promise<void> {
  await requireEditorAuth()
  const activeSince = currentActiveSince?.trim() ? undefined : new Date().toLocaleDateString("ru-RU")
  await updateCandidateStatus(id, "Активный" as CandidateStatus, activeSince)
  const candidate = await getCandidateById(id)
  if (candidate?.email) {
    await syncCandidateToSendPulse({ id: candidate.id, name: candidate.name, email: candidate.email, phone: candidate.phone })
  }
  revalidatePath("/editor/candidates")
}

export async function rejectCandidate(id: string): Promise<void> {
  await requireEditorAuth()
  const candidate = await getCandidateById(id)
  await updateCandidateStatus(id, "Отклонён" as CandidateStatus)
  if (candidate?.email) {
    await removeCandidateFromSendPulse(candidate.email)
  }
  revalidatePath("/editor/candidates")
}

/** Manual pause — the manager decides a candidate shouldn't appear in new releases for now,
 * without rejecting them outright. Unlike rejectCandidate(), doesn't touch SendPulse: a
 * "Не публиковать" candidate stays in the "Candidates" book and in the monthly digest
 * (getConfirmedCandidates() treats "Активный" and "Не публиковать" the same). Lifted the same
 * way any other pause is — the existing "Подтвердить" button (approveCandidate()). */
export async function pauseCandidate(id: string): Promise<void> {
  await requireEditorAuth()
  await updateCandidateStatus(id, "Не публиковать" as CandidateStatus)
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

/** Validates that every chosen selectionId belongs to the given stream and is available to
 * attach — either currently unattached (sitting in the pool) or already attached to `ownListId`
 * (updateMailingList() re-submits its own currently-attached ids as part of the picker's state;
 * re-attaching them to themselves must not be rejected as "already used elsewhere"). Also
 * enforces the "at most one default" invariant across the resulting attached set. */
async function validateSelectionChoice(
  streamId: number,
  selectionIds: string[],
  ownListId?: string,
): Promise<void> {
  if (!selectionIds.length) throw new Error("Выберите хотя бы одну подборку")

  const available = await getSelectionsForStreamRows(streamId)
  const chosen = available.filter((s) => selectionIds.includes(s.selectionId))
  if (chosen.length !== selectionIds.length) {
    throw new Error("Выбранная подборка не найдена или относится к другому стриму")
  }
  if (chosen.some((s) => s.listId !== null && s.listId !== ownListId)) {
    throw new Error("Выбранная подборка уже используется в другом выпуске")
  }
  if (chosen.filter((s) => s.employerTokens.length === 0).length > 1) {
    throw new Error("Можно выбрать только одну подборку по умолчанию")
  }
}

export async function createMailingList(data: {
  stream: string
  date: string
  employerTokens?: string[]
  /** Existing подборки (from /editor/selections) to attach — picked, never authored here. */
  selectionIds: string[]
}): Promise<{ listId: string }> {
  await requireEditorAuth()
  if (!data.stream.trim()) throw new Error("Выберите стрим")
  if (!data.date.trim()) throw new Error("Укажите дату рассылки")

  const streamId = await getStreamIdByName(data.stream)
  if (streamId === null) throw new Error(`Стрим не найден: ${data.stream}`)
  await validateSelectionChoice(streamId, data.selectionIds)

  let recipientLabel = ""
  if (data.employerTokens?.length) {
    const employers = (await Promise.all(data.employerTokens.map((t) => getEmployerByToken(t))))
      .filter((e): e is Employer => Boolean(e))
    recipientLabel = recipientLabelFor(employers)
  }

  const result = await createMailingListRows({ stream: data.stream, date: data.date, recipientLabel })
  if (data.employerTokens?.length) {
    await createMailingListRecipientRows(result.listId, data.employerTokens)
  }
  await attachSelections(result.listId, data.selectionIds)
  revalidatePath("/editor")
  return result
}

/** Attaches exactly the given selectionIds to a release and detaches any currently-attached one
 * that isn't in that set — shared by createMailingList() (nothing attached yet, every id is new)
 * and updateMailingList() (diffs against what's already attached). */
async function attachSelections(listId: string, selectionIds: string[]): Promise<void> {
  const list = await getMailingList(listId)
  const currentlyAttached = list ? [list.default, ...list.personal].filter((s): s is NonNullable<typeof s> => s !== null).map((s) => s.selectionId) : []
  const toAttach = selectionIds.filter((id) => !currentlyAttached.includes(id))
  const toDetach = currentlyAttached.filter((id) => !selectionIds.includes(id))
  if (toAttach.length) await attachSelectionsToMailingList(listId, toAttach)
  for (const id of toDetach) await detachSelectionRows(id)
}

/** Edits a release that hasn't been sent yet — stream is fixed at creation and not editable here
 * (changing it would orphan the attached подборки, which are stream-specific; a different stream
 * means a new release). sentCampaignId is re-checked fresh on the server, not trusted from
 * whatever state the edit form was opened with — same guard as deleteMailingList(). `selectionIds`
 * is the FULL desired attached set (not a delta) — newly-added ones get attached, ones that were
 * attached but are no longer listed get detached back to the pool (never deleted). */
export async function updateMailingList(
  listId: string,
  data: { date: string; employerTokens?: string[]; selectionIds: string[] },
): Promise<void> {
  await requireEditorAuth()
  const list = await getMailingListMeta(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)
  if (list.sentCampaignId !== null) throw new Error("Эта рассылка уже отправлена — редактирование недоступно")
  if (!data.date.trim()) throw new Error("Укажите дату рассылки")
  if (list.streamId === null) throw new Error("У выпуска не определён стрим")
  await validateSelectionChoice(list.streamId, data.selectionIds, listId)

  await updateMailingListTimestamp(listId, `${data.date}T00:00:00`)
  await attachSelections(listId, data.selectionIds)

  let recipientLabel = ""
  if (data.employerTokens?.length) {
    const employers = (await Promise.all(data.employerTokens.map((t) => getEmployerByToken(t))))
      .filter((e): e is Employer => Boolean(e))
    recipientLabel = recipientLabelFor(employers)
  }
  await replaceMailingListRecipients(listId, data.employerTokens ?? [], recipientLabel)

  revalidatePath("/editor")
}

/** Full detail of a release — default + every personal selection currently attached, each
 * resolved to real Candidate profiles — used by ReleaseCreateModal/ReleaseDetailModal to render
 * the roster table and the (read-only) list of attached подборки. */
export async function getMailingListDetail(listId: string) {
  await requireEditorAuth()
  return getMailingList(listId)
}

/** Every подборка prepared for a stream — pool items and ones attached elsewhere alike — used by
 * /editor/selections and by the release create/edit pickers (which show, per подборка, whether
 * it's free to attach, already attached to this release, or taken by another one). */
export async function getSelectionsForStream(stream: string) {
  await requireEditorAuth()
  const streamId = await getStreamIdByName(stream)
  if (streamId === null) return []
  return getSelectionsForStreamRows(streamId)
}

/** Every подборка across every stream — the default view of /editor/selections. */
export async function getAllSelections() {
  await requireEditorAuth()
  return getAllSelectionsRows()
}

/** Creates a new подборка in the pool for a stream (/editor/selections) — never attached to a
 * release at creation; that only happens later, when a release picks it. */
export async function createSelection(
  stream: string,
  data: { date: string; candidateIds: string[]; employerTokens: string[] },
): Promise<void> {
  await requireEditorAuth()
  const streamId = await getStreamIdByName(stream)
  if (streamId === null) throw new Error(`Стрим не найден: ${stream}`)
  if (!data.date.trim()) throw new Error("Укажите дату подборки")

  const employers = (await Promise.all(data.employerTokens.map((t) => getEmployerByToken(t))))
    .filter((e): e is Employer => Boolean(e))
  await createSelectionRows(streamId, data.date, data.candidateIds, data.employerTokens, recipientLabelFor(employers))
  revalidatePath("/editor/selections")
}

async function assertSelectionEditable(selectionId: string): Promise<{ listId: string | null }> {
  const current = await getSelectionById(selectionId)
  if (!current) throw new Error(`Подборка не найдена: ${selectionId}`)
  if (current.listId) {
    const list = await getMailingListMeta(current.listId)
    if (list && list.sentCampaignId !== null) {
      throw new Error("Эта подборка уже отправлена в составе выпуска — изменения недоступны")
    }
  }
  return { listId: current.listId }
}

/** Edits a подборка's composition — only from /editor/selections, never from a release's own UI,
 * whether it's currently in the pool or attached to an unsent release. Blocked if it's attached
 * to an already-sent release (editing history isn't allowed). */
export async function updateSelection(
  selectionId: string,
  data: { date: string; candidateIds: string[]; employerTokens: string[] },
): Promise<void> {
  await requireEditorAuth()
  await assertSelectionEditable(selectionId)
  if (!data.date.trim()) throw new Error("Укажите дату подборки")

  const employers = (await Promise.all(data.employerTokens.map((t) => getEmployerByToken(t))))
    .filter((e): e is Employer => Boolean(e))
  await updateSelectionRows(selectionId, data.date, data.candidateIds, data.employerTokens, recipientLabelFor(employers))
  revalidatePath("/editor/selections")
  revalidatePath("/editor")
}

/** Deletes a подборка outright — same guard as updateSelection(); one attached to an unsent
 * release can still be deleted directly (equivalent to detaching it first). */
export async function deleteSelection(selectionId: string): Promise<void> {
  await requireEditorAuth()
  await assertSelectionEditable(selectionId)

  await deleteSelectionRows(selectionId)
  revalidatePath("/editor/selections")
  revalidatePath("/editor")
}

/** Detaches a подборка from its release directly (from /editor/selections) — returns it to the
 * pool, reusable in a future release. Same guard as updateSelection(). */
export async function detachSelection(selectionId: string): Promise<void> {
  await requireEditorAuth()
  const { listId } = await assertSelectionEditable(selectionId)
  if (!listId) return
  await detachSelectionRows(selectionId)
  revalidatePath("/editor/selections")
  revalidatePath("/editor")
}

export type EmployerWithoutSelection = { token: string; name: string; company: string }

/** Employers of a release's actual send audience who have neither a personal selection nor a
 * default to fall back on — used both by the roster table's live warning (recomputed client-side
 * from in-progress form state, this action just mirrors it for an already-saved release) and as
 * the list shown in PublishButton's confirmation dialog before a release with gaps is sent. */
export async function getMissingSelectionEmployers(listId: string): Promise<EmployerWithoutSelection[]> {
  await requireEditorAuth()
  const missing = await getEmployersWithoutSelection(listId)
  return missing.map((e) => ({ token: e.token, name: e.name, company: e.company }))
}


/** Resolves a release's recipient-override tokens into displayable employer data — used by the
 * edit modal (to seed the current selection) and the view modal (to show who it actually went
 * to). [] means the release targets the whole stream (no override rows). */
export async function getMailingListRecipients(listId: string): Promise<EmployerPickOption[]> {
  await requireEditorAuth()
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
  await requireEditorAuth()
  const list = await getMailingListMeta(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)

  if (list.sentCampaignId !== null) {
    throw new Error("Эта рассылка уже отправлена — удалить её нельзя")
  }

  await deleteMailingListRows(listId)
  revalidatePath("/editor")
}

export type PublishResult =
  | { listId: string; stream: string; campaignId: number }
  | { requiresConfirmation: true; missingEmployers: EmployerWithoutSelection[] }

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function candidatePlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "кандидат"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "кандидата"
  return "кандидатов"
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

          <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.5;font-family:${font}">
            Здравствуйте, {{Имя}}!
          </p>

          <h1 style="margin:0 0 10px;font-size:22px;font-weight:600;color:#0f172a;line-height:1.35;letter-spacing:-0.02em;font-family:${font}">
            Новый выпуск ${s} Talent Stream уже готов для вас.
          </h1>

          <p style="margin:0 0 16px;font-size:14px;color:#64748b;line-height:1.65;font-family:${font}">
            В него вошли проверенные кандидаты, отобранные нашей командой за последнюю неделю.
          </p>

          <p style="margin:0 0 24px;font-size:13px;color:#94a3b8;font-family:${font}">
            Новые кандидаты в выпуске от ${d}
          </p>

          <hr style="border:none;border-top:1px solid #f1f5f9;margin:0 0 24px">

          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65;font-family:${font}">
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
  from: { email: string; name: string },
): Promise<{ id: number }> {
  const token = await getToken()
  if (!token) throw new Error("Не удалось получить токен SendPulse")

  const payload = JSON.stringify({
    name,
    list_id: Number(bookId),
    subject,
    body: Buffer.from(html, "utf-8").toString("base64"),
    sender_name: from.name,
    sender_email: from.email,
  })
  console.log("[SendPulse] createCampaign:", payload)

  // SendPulse's "add email to book" write isn't always immediately visible to the campaign
  // endpoint's own book-membership check — confirmed by direct testing: a freshly-created,
  // freshly-populated book (exactly the throwaway ad-hoc book a narrowed release builds, TASK-40)
  // can transiently read back as empty (error_code 798) for a second or two after the add call
  // already returned 200, even for a recipient who is a long-confirmed employer. Retry a few
  // times with a short delay before surfacing "book is empty" as a real, actionable error.
  // Delays kept small (1.5s total) — this Server Action runs as a Vercel serverless function
  // with a hard 10s execution ceiling on the Hobby plan (not raisable via maxDuration there),
  // and this retry sits on top of the rest of the publish flow's own network calls.
  const RETRY_DELAYS_MS = [500, 1000, 1500]
  for (let attempt = 0; ; attempt++) {
    const { status, text } = await spPost(
      `${SENDPULSE_API}/campaigns`,
      { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      payload,
    )
    console.log(`[SendPulse] campaigns status=${status} body=${text}`)

    if (status >= 200 && status < 300) return JSON.parse(text) as { id: number }

    let errorCode: number | undefined
    let message = `SendPulse campaign error (${status}): ${text}`
    try {
      const err = JSON.parse(text) as { error_code?: number; message?: string }
      errorCode = err.error_code
      if (errorCode === 709) {
        message = "Адресная книга занята (идёт копирование адресов). Подождите минуту и попробуйте снова."
      } else if (errorCode === 798) {
        message = "В адресной книге нет подписчиков. Добавьте работодателей в стрим «" + name.split(" — ")[0] + "» и повторите попытку."
      }
    } catch { /* ignore parse errors */ }

    if (errorCode === 798 && attempt < RETRY_DELAYS_MS.length) {
      console.log(`[SendPulse] campaigns: book not indexed yet, retrying in ${RETRY_DELAYS_MS[attempt]}ms (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length})`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
      continue
    }
    throw new Error(message)
  }
}

export async function publishMailingList(listId: string, confirmed = false): Promise<PublishResult> {
  await requireEditorAuth()
  const list = await getMailingListMeta(listId)
  if (!list) throw new Error(`Подборка не найдена: ${listId}`)

  // Authoritative gate — the roster table's warning in the editor UI mirrors this client-side for
  // an instant heads-up while the manager is still building the release, but this server check is
  // what actually blocks a send with gaps; a manager who confirms once gets a real send (and never
  // re-confirms on a resend that still has the exact same gap, see the alreadySent branch below).
  if (!confirmed) {
    const missing = await getEmployersWithoutSelection(listId)
    if (missing.length) {
      return { requiresConfirmation: true, missingEmployers: missing.map((e) => ({ token: e.token, name: e.name, company: e.company })) }
    }
  }

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
  // Same population the email campaign reaches — reused below to also notify via Telegram
  // (TASK-35, часть 2) once the campaign is confirmed sent.
  let notifyEmployers: Employer[]

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
    notifyEmployers = recipients
  } else {
    bookId = await getOrCreateBook(list.stream, token)
    notifyEmployers = confirmedEmployersForStream(await getEmployers(), { name: list.stream })
  }

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const listUrl = `${appUrl}/list/${listId}?e={{employer_token}}`
  const subject = `Talent Stream: ${list.stream} — выпуск ${date}`
  const campaignName = campaignNameFor(list.stream, date, list.recipientLabel)
  const html = buildEmailHtml(list.stream, date, listUrl, telegramConnectUrl("{{employer_token}}"))

  const employerFromEmail = process.env.SENDPULSE_EMPLOYER_FROM_EMAIL
  if (!employerFromEmail) throw new Error("SENDPULSE_EMPLOYER_FROM_EMAIL не задан в переменных окружения")
  const employerFrom = { email: employerFromEmail, name: process.env.SENDPULSE_EMPLOYER_FROM_NAME || "Talent Streams Partner" }

  let campaign: { id: number }
  try {
    campaign = await createCampaign(bookId, subject, html, campaignName, employerFrom)
  } catch (err) {
    // Deliberately NOT deleting the ad-hoc book here (unlike earlier versions of this code).
    // Real incident: a brand-new SendPulse contact (never added to any book before) kept
    // failing error_code 798 across 3-4 manual retries over several minutes, each exhausting
    // all 3 in-process retries — SendPulse's own indexing can apparently take far longer than
    // a few seconds for a genuinely new contact, nowhere near coverable by an in-request retry
    // (let alone the 10s Vercel Hobby cap). Deleting the book on every failed attempt forced
    // each manual retry to recreate it from scratch, discarding whatever indexing progress
    // SendPulse had already made on the previous attempt's identical contact. Leaving the book
    // in place means the next manual "Отправить" click (getOrCreateBook finds this same book,
    // addToAddressBook on an already-present email is a no-op) benefits from however much time
    // has passed since the contact was first added, instead of resetting the clock.
    // Known gap: if this release is deleted before ever sending successfully, this book has no
    // automatic cleanup path (the daily cron below only looks at already-sent releases) — left
    // as-is deliberately, simpler than the alternative right now.
    throw err
  }
  // Campaign created successfully — deliberately NOT deleting the ad-hoc book here. SendPulse
  // holds new campaigns in moderation for an unpredictable stretch before actually sending, and
  // won't let the book be deleted while it's attached to that pending campaign; this request
  // can't wait that out (10s hard cap on a Vercel Hobby serverless function). The daily
  // cleanup-adhoc-books cron (vercel.json) deletes it once SendPulse reports the campaign fully
  // processed.

  // TASK-35, часть 2 — same recipients the email just went to, also pinged on Telegram (whoever
  // connected the bot; sendTelegramToEmployer() never throws, just no-ops for anyone who hasn't —
  // best-effort, Telegram is a supplementary channel on top of email, not load-bearing). Fires on
  // every real send including a resend, mirroring createCampaign() above (also unconditional).
  // Candidate count shown here on purpose — unlike the email body (TASK-26's neutral phrasing,
  // no exact count), this was an explicit request for the Telegram channel specifically. Resolved
  // PER EMPLOYER (TASK-44 made this necessary): a personal selection, or the default filtered the
  // same way filterCandidatesForEmployer does on their own /list/[listId] page, so the number in
  // the push always matches what they'll actually see when they tap the button. An employer
  // resolving to nothing ("подборка не готова") gets no ping at all — nothing to point them at yet.
  const fullList = await getMailingList(listId)
  if (fullList) {
    await Promise.all(
      notifyEmployers.map((employer) => {
        const resolved = resolveMailingListForEmployer(fullList, employer.token)
        if (!resolved) return null
        const count = resolved.isPersonal
          ? resolved.entries.length
          : filterCandidatesForEmployer(resolved.entries.map((e) => e.profile), employer).length
        return sendTelegramToEmployer(
          employer.token,
          `<b>Новый выпуск Talent Stream уже готов!</b>\n\nВ поток ${escapeHtml(list.stream)} от ${escapeHtml(date)} вошли ${count} ${candidatePlural(count)}`,
          {
            button: { label: `Открыть поток ${list.stream} за ${date} →`, url: `${appUrl}/list/${listId}?e=${employer.token}` },
            // Telegram caches an external photo per exact URL (confirmed by testing — a file
            // changed in place at the same URL kept showing the stale version). The filename is
            // versioned on purpose: bump it (public/telegram-notify-vN.png) whenever the image
            // itself changes, so Telegram is forced to fetch fresh instead of serving a cached miss.
            // 640×180: SendPulse marks this send is_external_attachment: true, meaning Telegram
            // renders it as a link-preview card, not a native uploaded photo, and crops/pads an
            // off-ratio image to fit — this specific ratio (not the documented 1.91:1 Open Graph
            // standard tried earlier) is the one confirmed clean on a real device, by eye.
            photo: `${appUrl}/telegram-notify-v8.png`,
          },
        )
      }),
    )
  }

  // sentCampaignId is written once, on the genuine first send — a resend must not overwrite it
  // with the resend's own campaign id (it's the single source of truth for "was this ever sent").
  if (!alreadySent) {
    await markMailingListSent(listId, campaign.id)
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
  await requireEditorAuth()
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }

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
  await requireEditorAuth()
  if (!data.name.trim()) return { ok: false, error: "Укажите имя" }
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
  await requireEditorAuth()
  return getResumeVersions(candidateId)
}

export type CandidateMailingHistoryEntry = { listId: string; stream: string; date: string; sent: boolean }

/**
 * Every release a candidate has ever been included in, newest first — lets the manager see how
 * often a candidate has already been sent before deciding by hand whether to pause them
 * (pauseCandidate()) — no automatic enforcement based on this count (removed, TASK-51).
 * `sent` is read straight from mailingLists.sentCampaignId (a release can be created and never
 * actually sent, or deleted before sending) — not a name comparison against SendPulse campaigns.
 */
export async function getCandidateMailingHistory(candidateId: string): Promise<CandidateMailingHistoryEntry[]> {
  await requireEditorAuth()
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
  await requireEditorAuth()
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
  await requireEditorAuth()
  const candidate = await getCandidateById(id)
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
  if (candidate?.email) {
    await removeCandidateFromSendPulse(candidate.email)
  }
  revalidatePath("/editor/candidates")
}

/** Read-only dry run of importCandidatesFromSheets() — reports what would happen, writes nothing. */
export async function previewCandidatesImport(): Promise<ImportPreview> {
  await requireEditorAuth()
  return previewImport()
}

/** Actually imports new candidates from the Google Sheet (lib/sheets-import.ts). */
export async function importCandidatesFromSheets(): Promise<ImportResult> {
  await requireEditorAuth()
  const result = await importCandidatesFromSheet()
  if (result.ok && result.imported.length > 0) {
    revalidatePath("/editor/candidates")
    revalidatePath("/editor")
  }
  return result
}

// Cosine similarity ≥ this is flagged as a likely duplicate. Conservative default — tune based
// on real false-positive/negative rate after the first few scans; not exposed in the UI.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.93

export type DuplicatePair = { candidateAId: string; candidateBId: string; similarity: number }
export type FindDuplicatesResult =
  | { ok: true; pairs: DuplicatePair[]; candidatesById: Record<string, Candidate> }
  | { ok: false; error: string }

/** Finds likely-duplicate candidate profiles via Gemini embeddings (TASK-55) — semantic matching
 * that catches the same person registered twice under different contact info/spelling, which the
 * existing email/phone UNIQUE constraints can't. Refreshes any stale/missing embedding first
 * (best-effort, chunked), then scans all pairs via pgvector in a single SQL query (see
 * findSimilarCandidatePairs()) — never pulls vectors into Node. Manual trigger only, from the
 * "Поиск дублей кандидатов" section on /editor/settings. */
export async function findDuplicateCandidates(): Promise<FindDuplicatesResult> {
  await requireEditorAuth()
  if (!isGeminiConfigured()) {
    return { ok: false, error: "Gemini не настроен — укажите GEMINI_API_KEY" }
  }

  const pending = await getCandidatesNeedingEmbedding()
  if (pending.length > 0) {
    const vectors = await embedTexts(pending.map((p) => p.sourceText))
    // allSettled, not all — a single transient DB write failure for one candidate must not
    // discard the Gemini results (and Neon writes) already succeeded for every other candidate
    // in this same scan. Caught live: a real write failure ("fetch failed") for one candidate
    // among dozens took down the whole scan before this fix.
    const results = await Promise.allSettled(pending.map((p, i) => setCandidateEmbedding(p.id, vectors[i], p.sourceText)))
    results.forEach((r, i) => {
      if (r.status === "rejected") console.warn("[findDuplicateCandidates] failed to save embedding for candidate:", pending[i].id, r.reason)
    })
    if (vectors.every((v) => v === null)) {
      return { ok: false, error: "Не удалось получить эмбеддинги — проверьте квоту/ключ в Google AI Studio" }
    }
  }

  const pairs = await findSimilarCandidatePairs(DUPLICATE_SIMILARITY_THRESHOLD)
  const allCandidates = await getCandidates()
  const candidatesById = Object.fromEntries(allCandidates.map((c) => [c.id, c]))
  return { ok: true, pairs, candidatesById }
}

type MergeFieldChoice = "survivor" | "other" | "union"
export type MergeCandidatesInput = {
  survivorId: string
  droppedId: string
  fields: {
    name: MergeFieldChoice; title: MergeFieldChoice; email: MergeFieldChoice; phone: MergeFieldChoice
    level: MergeFieldChoice; countryPrimary: MergeFieldChoice; countryDesired: MergeFieldChoice
    summary: MergeFieldChoice; coverLetter: MergeFieldChoice; activeSince: MergeFieldChoice
    stream: MergeFieldChoice; excludedCompanies: MergeFieldChoice; excludedStreams: MergeFieldChoice
  }
}
export type MergeCandidatesResult = { ok: true } | { ok: false; error: string }

/** Merges two candidate profiles (TASK-55) — the manager picks, per field, whether the surviving
 * row keeps its own value or takes the other candidate's (array fields can also be unioned,
 * deduped). `status` is deliberately not a field choice — the surviving row keeps its own current
 * status unchanged (status is managed by approveCandidate()/rejectCandidate()/pauseCandidate(),
 * not the edit form). Resume history, подборка membership and contact requests are never
 * field-picked — always combined onto the survivor, never lost. No DB transaction: neon-http
 * doesn't support one ("No transactions support in neon-http driver") — steps run sequentially,
 * each idempotent, safe to re-run after a partial failure. */
export async function mergeCandidates(input: MergeCandidatesInput): Promise<MergeCandidatesResult> {
  await requireEditorAuth()
  if (input.survivorId === input.droppedId) return { ok: false, error: "Нельзя объединить кандидата с самим собой" }

  const [survivor, dropped] = await Promise.all([
    getCandidateById(input.survivorId),
    getCandidateById(input.droppedId),
  ])
  if (!survivor) return { ok: false, error: "Оставляемый кандидат не найден" }
  if (!dropped) {
    // Idempotency: a previous run of this exact merge already deleted the loser.
    return { ok: true }
  }

  function pick<T>(field: MergeFieldChoice, survivorVal: T, otherVal: T, union?: () => T): T {
    if (field === "survivor") return survivorVal
    if (field === "other") return otherVal
    return union!()
  }

  const merged = {
    name: pick(input.fields.name, survivor.name, dropped.name),
    title: pick(input.fields.title, survivor.title, dropped.title),
    email: pick(input.fields.email, survivor.email, dropped.email),
    phone: pick(input.fields.phone, survivor.phone, dropped.phone),
    level: pick(input.fields.level, survivor.level, dropped.level),
    countryPrimary: pick(input.fields.countryPrimary, survivor.countryPrimary, dropped.countryPrimary),
    countryDesired: pick(input.fields.countryDesired, survivor.countryDesired, dropped.countryDesired),
    summary: pick(input.fields.summary, survivor.summary, dropped.summary),
    coverLetter: pick(input.fields.coverLetter, survivor.coverLetter, dropped.coverLetter),
    activeSince: pick(input.fields.activeSince, survivor.activeSince, dropped.activeSince),
    stream: pick(input.fields.stream, survivor.stream, dropped.stream, () => [...new Set([...survivor.stream, ...dropped.stream])]),
    excludedCompanies: pick(input.fields.excludedCompanies, survivor.excludedCompanies, dropped.excludedCompanies, () => [...new Set([...survivor.excludedCompanies, ...dropped.excludedCompanies])]),
    excludedStreams: pick(input.fields.excludedStreams, survivor.excludedStreams, dropped.excludedStreams, () => [...new Set([...survivor.excludedStreams, ...dropped.excludedStreams])]),
  }

  // Pre-check uniqueness against every OTHER candidate before touching anything. Caught live:
  // the dropped row still exists at this point — if "other"/"union" carries dropped's own
  // email/phone forward onto the survivor, updateCandidateFields() would collide with the
  // dropped row's OWN still-existing value (both rows briefly holding the same email) and fail
  // the UNIQUE constraint, even though that's not a real conflict once the merge completes. So
  // the field update must run AFTER deleteCandidateRecord(droppedId) below, not before — this
  // pre-check guards against a genuine THIRD-PARTY collision instead (survivor/dropped excluded).
  const others = (await getCandidates()).filter((c) => c.id !== survivor.id && c.id !== dropped.id)
  if (merged.email && others.some((c) => c.email === merged.email)) {
    return { ok: false, error: "Выбранный email уже используется другим кандидатом" }
  }
  if (merged.phone && others.some((c) => c.phone === merged.phone)) {
    return { ok: false, error: "Выбранный телефон уже используется другим кандидатом" }
  }

  // Order matters: these FK reassignments must happen BEFORE deleteCandidateRecord(droppedId) —
  // otherwise cascade/set-null on the delete would empty them before they're transferred. The
  // delete itself must happen BEFORE updateCandidateFields() below, for the reason explained above.
  await reassignResumesToSurvivor(input.droppedId, input.survivorId)
  await reassignSelectionEntriesToSurvivor(input.droppedId, input.survivorId)
  await reassignContactRequestsToSurvivor(input.droppedId, input.survivorId)

  await deleteCandidateRecord(input.droppedId)

  try {
    await updateCandidateFields(input.survivorId, merged)
  } catch (err) {
    // Safety net against a race the pre-check above can miss (same pattern as
    // registerEmployer()/updateEmployer()) — not the primary guard, which is the pre-check.
    const constraint = uniqueViolationConstraint(err)
    if (constraint === "candidates_email_unique") return { ok: false, error: "Выбранный email уже используется другим кандидатом" }
    if (constraint === "candidates_phone_unique") return { ok: false, error: "Выбранный телефон уже используется другим кандидатом" }
    throw err
  }

  // Only remove the dropped candidate's email from SendPulse if it's genuinely abandoned — not
  // if it's the same as the survivor's own email, and not if it ended up as the final merged
  // email (i.e. it "survives" under the merged identity rather than being discarded).
  if (dropped.email && dropped.email !== merged.email && dropped.email !== survivor.email) {
    await removeCandidateFromSendPulse(dropped.email)
  }

  revalidatePath("/editor/candidates")
  revalidatePath("/editor/settings")
  return { ok: true }
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
  await requireEditorAuth()
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
  await requireEditorAuth()
  await syncEmployerToSendPulse(employer)
  await updateEmployerFields(token, { status: "Подтверждён" })
  // Re-enable first — a "На проверке"/"Отклонён" employer re-confirmed here may have been
  // disabled by a previous rejectEmployer() call; without this, their Telegram contact stays
  // disabled in SendPulse (manual fix required there) and the message below silently no-ops.
  const reactivated = await enableTelegramContact(employer.token)
  // Reactivating a disabled contact is silent — the employer already got this exact message
  // once before being disabled, and got no "you were disabled" message either, so sending it
  // again here would be a non-symmetric, confusing notification. Only a genuine first-time
  // connection (never disabled — reactivated === false) gets it. Only reaches employers who
  // already subscribed to the bot; the rest get the link in the welcome email.
  if (!reactivated) {
    await sendTelegramToEmployer(
      employer.token,
      "Ваша заявка в TalentStreams одобрена! Первая подборка кандидатов придёт на email и сюда.",
    )
  }
  revalidatePath("/editor")
}

export async function rejectEmployer(token: string): Promise<void> {
  await requireEditorAuth()
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
  await requireEditorAuth()
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
  await requireEditorAuth()
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

  // Best-effort — a candidate not getting this email must never affect the contact request
  // itself, which is already written above. Only the employer's company is named, never the
  // employer (name/email/phone) — hard rule, decided with the user.
  const candidate = await getCandidateById(candidateId)
  if (candidate?.email) {
    const candidateFromEmail = process.env.SENDPULSE_CANDIDATE_FROM_EMAIL
    if (candidateFromEmail) {
      await sendTransactionalEmail(
        { email: candidate.email },
        "Вашим резюме заинтересовался работодатель",
        buildConsentRequestEmailHtml(employer.company),
        { email: candidateFromEmail, name: process.env.SENDPULSE_CANDIDATE_FROM_NAME || "Talent Streams Career" },
      )
    }
  }
}

/** True if a stream has at least one release that was actually sent as a SendPulse campaign —
 * not just created. A stream in this state has its name baked into a permanent campaign title
 * and into real send history (mailingLists.streamId), so renaming/deleting it would silently
 * desync that history. Archiving is always safe instead — it doesn't touch the name. */
async function streamHasSentReleases(streamId: number): Promise<boolean> {
  const lists = await getMailingLists()
  return lists.some((l) => l.streamId === streamId && l.sentCampaignId !== null)
}

export async function updateStream(
  id: number,
  data: { name: string; type: string; description: string },
): Promise<void> {
  await requireEditorAuth()
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
  await requireEditorAuth()
  await createStreamRecord(data)
  revalidatePath("/editor/streams")
}

export async function deleteStream(id: number): Promise<void> {
  await requireEditorAuth()
  if (await streamHasSentReleases(id)) {
    throw new Error("У стрима уже есть отправленные рассылки — удаление недоступно, можно только архивировать")
  }
  await deleteStreamRecord(id)
  revalidatePath("/editor/streams")
}

export async function archiveStream(id: number): Promise<void> {
  await requireEditorAuth()
  await updateStreamRecord(id, { status: "Архивный" })
  revalidatePath("/editor/streams")
}

export async function unarchiveStream(id: number): Promise<void> {
  await requireEditorAuth()
  await updateStreamRecord(id, { status: "Активный" })
  revalidatePath("/editor/streams")
}

/**
 * Sends the monthly "N работодателей увидели ваше резюме" digest — one SendPulse campaign to
 * the "Candidates" book, not a per-recipient loop (decided with the user after reconsidering:
 * a transactional send would misuse SendPulse's SMTP channel, meant for one-off event-triggered
 * mail, for what is actually a recurring bulk send — see docs/backlog.adoc). Only called from the
 * cron route (app/api/cron/candidate-monthly-digest/route.ts) now — the manual "Отправить сейчас"
 * flow goes through previewCandidateDigest()/sendCandidateDigestToApproved() instead (a separate,
 * manager-curated path, see those functions' doc comments below). A route handler importing an
 * exported Server Action as a plain function is fine; the "use server" RPC restriction only
 * applies to client-component calls, not server-to-server imports.
 *
 * The book is fully reconciled every run: anyone no longer "Активный"/"Не публиковать", or
 * missing an email, is removed first; everyone currently eligible is (re-)added with a fresh
 * digest_count variable. This is also how the book gets created and populated in the first
 * place — there's no separate backfill step, see "Что нужно сделать руками" in the plan this
 * feature shipped from: run this once manually before turning on the SendPulse Automation 360
 * welcome flow on the same book, so the reconciliation's adds don't fire false "welcome" emails.
 */
export async function runCandidateDigest(triggeredBy: "cron" | "manual"): Promise<DigestRun> {
  const [candidates, exposureCounts] = await Promise.all([getConfirmedCandidates(), getCandidateExposureCounts()])
  const eligible = candidates.filter((c): c is typeof c & { email: string } => Boolean(c.email))
  const eligibleEmails = new Set(eligible.map((c) => c.email.toLowerCase()))

  const token = await getToken()
  if (!token) {
    console.warn("[SendPulse] runCandidateDigest: failed to get access token")
    return recordCandidateDigestRun({
      triggeredBy,
      candidatesTotal: eligible.length,
      candidatesPrepared: 0,
      candidatesFailed: eligible.length,
      campaignId: null,
    })
  }

  const bookName = process.env.SENDPULSE_CANDIDATE_BOOK_NAME || "Candidates"
  const bookId = await getOrCreateBook(bookName, token)

  // 1. Remove anyone in the book who is no longer eligible (rejected/deleted/no email).
  const currentMembers = await listAddressBookEmails(bookId, token)
  const stale = currentMembers.filter((email) => !eligibleEmails.has(email.toLowerCase()))
  await Promise.all(stale.map((email) => removeFromAddressBook(email, bookId, token)))

  // 2. Add/refresh every eligible candidate — book membership and digest_count always current.
  let prepared = 0
  let failed = 0
  for (const c of eligible) {
    const real = exposureCounts.get(c.id) ?? 0
    const shown = real >= 8 ? real : 8 + Math.floor(Math.random() * 9) // 8..16
    try {
      // digest_count MUST be included in this one call, not set afterward via a separate
      // "update variable" call — confirmed by live testing: SendPulse only auto-creates a new
      // custom variable field in the book's schema from the bulk add-contacts endpoint; the
      // single-variable endpoint silently no-ops when the field doesn't already exist in the
      // book's schema (returns 200, but the value never shows up on the contact or in a merge
      // tag). A prior version of this code called them as two separate steps and the digest_count
      // merge tag never actually substituted in the sent email — caught live, not in review.
      await addToAddressBook(c.email, bookId, { "Имя": c.name, phone: c.phone, digest_count: String(shown) }, token)
      prepared++
    } catch (err) {
      console.error("[SendPulse] runCandidateDigest: failed to prepare candidate:", c.id, err)
      failed++
    }
  }

  // 3. One campaign for the whole book — {{digest_count}} is substituted per-recipient by
  // SendPulse from the variable just set above, same mechanism as {{Имя}}/{{Streams}} already
  // used for employer campaigns.
  let campaignId: number | null = null
  if (prepared > 0) {
    const candidateFromEmail = process.env.SENDPULSE_CANDIDATE_FROM_EMAIL
    if (!candidateFromEmail) {
      console.warn("[SendPulse] runCandidateDigest: SENDPULSE_CANDIDATE_FROM_EMAIL not set, skipping campaign")
    } else {
      try {
        const campaign = await createCampaign(
          bookId,
          "Итоги месяца: вас увидели {{digest_count}} работодателей",
          buildDigestEmailHtml(),
          `Дайджест кандидатам — ${new Date().toLocaleDateString("ru-RU")}`,
          { email: candidateFromEmail, name: process.env.SENDPULSE_CANDIDATE_FROM_NAME || "Talent Streams Career" },
        )
        campaignId = campaign.id
      } catch (err) {
        console.error("[SendPulse] runCandidateDigest: failed to create campaign:", err)
      }
    }
  }

  const run = await recordCandidateDigestRun({
    triggeredBy,
    candidatesTotal: eligible.length,
    candidatesPrepared: prepared,
    candidatesFailed: failed,
    campaignId,
  })
  revalidatePath("/editor/settings")
  return run
}

export async function getCandidateDigestSettings() {
  await requireEditorAuth()
  return getCandidateDigestSettingsDb()
}

export async function setCandidateDigestAutoSend(enabled: boolean): Promise<void> {
  await requireEditorAuth()
  await setCandidateDigestAutoSendDb(enabled)
  revalidatePath("/editor/settings")
}

export async function getCandidateDigestRuns() {
  await requireEditorAuth()
  return getCandidateDigestRunsDb()
}

export type DigestPreviewCandidate = { id: string; name: string; email: string; phone: string; shown: number }
export type DigestPreview = { candidates: DigestPreviewCandidate[] }

/** Read-only computation for the "Загрузить список" button on /editor/settings — same eligibility
 * + exposure-count logic as runCandidateDigest(), but no SendPulse writes, no run recorded. The
 * `shown` value here is frozen and must be reused as-is by sendCandidateDigestToApproved() below —
 * recomputing it there would risk showing the manager one number and emailing a different one. */
export async function previewCandidateDigest(): Promise<DigestPreview> {
  await requireEditorAuth()
  const [candidates, exposureCounts] = await Promise.all([getConfirmedCandidates(), getCandidateExposureCounts()])
  const eligible = candidates.filter((c): c is typeof c & { email: string } => Boolean(c.email))
  return {
    candidates: eligible.map((c) => {
      const real = exposureCounts.get(c.id) ?? 0
      const shown = real >= 8 ? real : 8 + Math.floor(Math.random() * 9) // 8..16
      return { id: c.id, name: c.name, email: c.email, phone: c.phone, shown }
    }),
  }
}

/** Sends the digest to exactly the manager-approved subset from previewCandidateDigest() — the
 * manual counterpart to runCandidateDigest("cron"), which is untouched and keeps targeting the
 * "Candidates" book directly. This function deliberately never touches "Candidates" book
 * membership: removing an unapproved candidate from it to exclude them from this one send would
 * make their next re-add (e.g. next month, once approved) a genuine fresh "contact added to book"
 * event, which is exactly what triggers the SendPulse Automation 360 welcome-email flow
 * (syncCandidateToSendPulse(), approveCandidate()) — a false repeat "welcome" email. Instead this
 * uses a separate, permanent, reused-every-time book that exists only to carry this campaign's
 * audience; "Candidates" membership is never read or written here. */
export async function sendCandidateDigestToApproved(approved: DigestPreviewCandidate[]): Promise<DigestRun> {
  await requireEditorAuth()
  // Re-validate against current eligibility (not just trusting the client) — a candidate rejected/
  // deleted between preview and this click must not receive the campaign. `shown` IS trusted
  // verbatim from `approved` (see previewCandidateDigest()'s doc comment) — only membership is
  // re-checked here, not the number.
  const currentlyEligible = new Set(
    (await getConfirmedCandidates()).filter((c) => c.email).map((c) => c.id),
  )
  const finalList = approved.filter((c) => currentlyEligible.has(c.id))

  if (finalList.length === 0) {
    const run = await recordCandidateDigestRun({ triggeredBy: "manual", candidatesTotal: 0, candidatesPrepared: 0, candidatesFailed: 0, campaignId: null })
    revalidatePath("/editor/settings")
    return run
  }

  const token = await getToken()
  if (!token) {
    console.warn("[SendPulse] sendCandidateDigestToApproved: failed to get access token")
    return recordCandidateDigestRun({ triggeredBy: "manual", candidatesTotal: finalList.length, candidatesPrepared: 0, candidatesFailed: finalList.length, campaignId: null })
  }

  const bookName = process.env.SENDPULSE_CANDIDATE_DIGEST_SEND_BOOK_NAME || "Candidates Digest Manual"
  const bookId = await getOrCreateBook(bookName, token)

  // Fully clear and repopulate every manual send — this book only ever needs to carry exactly
  // this run's approved audience, nothing held over from a previous manual send.
  const currentMembers = await listAddressBookEmails(bookId, token)
  await Promise.all(currentMembers.map((email) => removeFromAddressBook(email, bookId, token)))

  let prepared = 0
  let failed = 0
  for (const c of finalList) {
    try {
      // digest_count bundled into this one call, not a separate update — see the identical
      // comment in runCandidateDigest() for why.
      await addToAddressBook(c.email, bookId, { "Имя": c.name, phone: c.phone, digest_count: String(c.shown) }, token)
      prepared++
    } catch (err) {
      console.error("[SendPulse] sendCandidateDigestToApproved: failed to prepare candidate:", c.id, err)
      failed++
    }
  }

  let campaignId: number | null = null
  if (prepared > 0) {
    const candidateFromEmail = process.env.SENDPULSE_CANDIDATE_FROM_EMAIL
    if (!candidateFromEmail) {
      console.warn("[SendPulse] sendCandidateDigestToApproved: SENDPULSE_CANDIDATE_FROM_EMAIL not set, skipping campaign")
    } else {
      try {
        const campaign = await createCampaign(
          bookId,
          "Итоги месяца: вас увидели {{digest_count}} работодателей",
          buildDigestEmailHtml(),
          `Дайджест кандидатам (вручную) — ${new Date().toLocaleDateString("ru-RU")}`,
          { email: candidateFromEmail, name: process.env.SENDPULSE_CANDIDATE_FROM_NAME || "Talent Streams Career" },
        )
        campaignId = campaign.id
      } catch (err) {
        console.error("[SendPulse] sendCandidateDigestToApproved: failed to create campaign:", err)
      }
    }
  }

  const run = await recordCandidateDigestRun({ triggeredBy: "manual", candidatesTotal: finalList.length, candidatesPrepared: prepared, candidatesFailed: failed, campaignId })
  revalidatePath("/editor/settings")
  return run
}

// Protects a first/late run from retroactively messaging every employer across the entire
// historical release backlog (23+ releases going back months) the moment this feature ships or
// resumes after being off for a while — only releases sent in roughly the last couple weeks are
// ever in-window, which happens to also be the realistic span for "did they open it yet".
const FOLLOW_UP_MIN_DAYS_AFTER_SEND = 2
const FOLLOW_UP_MAX_DAYS_AFTER_SEND = 14

/**
 * Employer follow-ups after a release send — two kinds, decided per (release, employer) from
 * SendPulse's own per-recipient open status (getCampaignEmailStatus()) and whether that employer
 * ever submitted a contact request tied to this exact release (getEmployerTokensWithRequestForList()):
 *   - opened, no request   -> "feedback" (static "помогите нам сделать подборки точнее" letter)
 *   - never opened         -> "reminder" (personalized nudge back to the same release link)
 *   - opened AND requested -> "skipped" (already engaged, no follow-up needed)
 * Every (listId, employerToken) pair is recorded at most once, ever (releaseFollowUps' unique
 * constraint + getEvaluatedFollowUpKeys() pre-filter) — re-running this daily never re-messages
 * an employer it already decided about for a given release, "skipped" included. Transactional
 * SMTP, not a book+campaign like the candidate digest — unlike the digest (same letter to
 * everyone on a fixed calendar day), each send here is genuinely conditional on that one
 * employer's own behavior around their own release.
 */
export async function runReleaseFollowUps(triggeredBy: "cron" | "manual"): Promise<FollowUpRun> {
  const token = await getToken()
  const [lists, allEmployers] = await Promise.all([getMailingLists(), getEmployers()])

  if (!token) {
    console.warn("[SendPulse] runReleaseFollowUps: failed to get access token")
    return recordReleaseFollowUpRun({ triggeredBy, releasesChecked: 0, employersEvaluated: 0, feedbackSent: 0, reminderSent: 0, failed: 0 })
  }

  const qualifying: Array<{ listId: string; stream: string; sentCampaignId: number }> = []
  for (const summary of lists.filter((l) => l.sentCampaignId !== null)) {
    const sendDate = await getCampaignSendDate(summary.sentCampaignId!, token)
    if (!sendDate) continue
    const daysSinceSend = (Date.now() - sendDate.getTime()) / 86_400_000
    if (daysSinceSend < FOLLOW_UP_MIN_DAYS_AFTER_SEND || daysSinceSend > FOLLOW_UP_MAX_DAYS_AFTER_SEND) continue
    qualifying.push({ listId: summary.listId, stream: summary.stream, sentCampaignId: summary.sentCampaignId! })
  }

  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const employerFromEmail = process.env.SENDPULSE_EMPLOYER_FROM_EMAIL
  const employerFromName = process.env.SENDPULSE_EMPLOYER_FROM_NAME || "Talent Streams Partner"

  let employersEvaluated = 0
  let feedbackSent = 0
  let reminderSent = 0
  let failed = 0

  if (qualifying.length && !employerFromEmail) {
    console.warn("[SendPulse] runReleaseFollowUps: SENDPULSE_EMPLOYER_FROM_EMAIL not set, skipping")
  } else {
    const alreadyEvaluated = await getEvaluatedFollowUpKeys(qualifying.map((q) => q.listId))

    for (const release of qualifying) {
      const [audience, requestedTokens] = await Promise.all([
        getReleaseAudience(release.listId, release.stream, allEmployers),
        getEmployerTokensWithRequestForList(release.listId),
      ])

      for (const employer of audience) {
        if (alreadyEvaluated.has(`${release.listId}|${employer.token}`)) continue
        employersEvaluated++

        try {
          const emailStatus = await getCampaignEmailStatus(release.sentCampaignId, employer.email, token)
          if (!emailStatus) { failed++; continue } // unknown — leave unrecorded, retried next run

          const opened = emailStatus.detailStatus >= 3 // 3 = Opened, 4 = Link redirected (implies opened)
          const requested = requestedTokens.has(employer.token)

          if (requested) {
            // A submitted request is a stronger engagement signal than the open-tracking pixel
            // (which misses opens when images are blocked) — an employer who already requested
            // a candidate never gets a follow-up, opened or not; caught live in a dry run where
            // an employer with requested=true but opened=false would otherwise have been told
            // "вы ещё не открывали это письмо".
            await recordFollowUpOutcome(release.listId, employer.token, "skipped")
          } else if (opened) {
            await sendTransactionalEmail(
              { email: employer.email, name: employer.name },
              "Помогите нам сделать подборки точнее",
              buildFollowUpFeedbackEmailHtml(),
              { email: employerFromEmail!, name: employerFromName },
            )
            await recordFollowUpOutcome(release.listId, employer.token, "feedback")
            feedbackSent++
          } else {
            const listUrl = `${appUrl}/list/${release.listId}?e=${employer.token}`
            await sendTransactionalEmail(
              { email: employer.email, name: employer.name },
              `Напоминаем о новой подборке кандидатов — ${release.stream}`,
              buildFollowUpReminderEmailHtml({ employerName: employer.name, streamName: release.stream, listUrl }),
              { email: employerFromEmail!, name: employerFromName },
            )
            await recordFollowUpOutcome(release.listId, employer.token, "reminder")
            reminderSent++
          }
        } catch (err) {
          console.error("[SendPulse] runReleaseFollowUps: failed to process employer:", employer.token, release.listId, err)
          failed++
        }
      }
    }
  }

  const run = await recordReleaseFollowUpRun({
    triggeredBy,
    releasesChecked: qualifying.length,
    employersEvaluated,
    feedbackSent,
    reminderSent,
    failed,
  })
  revalidatePath("/editor/settings")
  return run
}

export async function getReleaseFollowUpSettings() {
  await requireEditorAuth()
  return getReleaseFollowUpSettingsDb()
}

export async function setReleaseFollowUpAutoSend(enabled: boolean): Promise<void> {
  await requireEditorAuth()
  await setReleaseFollowUpAutoSendDb(enabled)
  revalidatePath("/editor/settings")
}

export async function getReleaseFollowUpRuns() {
  await requireEditorAuth()
  return getReleaseFollowUpRunsDb()
}

export type FollowUpPreviewRow = {
  listId: string
  employerToken: string
  employerName: string
  company: string
  email: string
  classification: "feedback" | "reminder"
}
export type FollowUpPreviewRelease = {
  listId: string
  stream: string
  date: string
  rows: FollowUpPreviewRow[]
  /** Already requested for this release — no follow-up applies, not an actionable row. */
  skippedCount: number
}
export type FollowUpPreview = { releases: FollowUpPreviewRelease[] }

/** Read-only computation for the "Загрузить список" button — same classification logic as
 * runReleaseFollowUps() (including the live, unavoidable getCampaignEmailStatus() calls per
 * employer), but sends nothing and records nothing. Only feedback/reminder (actionable) rows are
 * returned per-row; already-requested employers are counted in skippedCount, not listed — nothing
 * for the manager to decide about them, they never get an email either way. */
export async function previewReleaseFollowUps(): Promise<FollowUpPreview> {
  await requireEditorAuth()
  const token = await getToken()
  const [lists, allEmployers] = await Promise.all([getMailingLists(), getEmployers()])
  if (!token) return { releases: [] }

  const qualifying: Array<{ listId: string; stream: string; date: string; sentCampaignId: number }> = []
  for (const summary of lists.filter((l) => l.sentCampaignId !== null)) {
    const sendDate = await getCampaignSendDate(summary.sentCampaignId!, token)
    if (!sendDate) continue
    const daysSinceSend = (Date.now() - sendDate.getTime()) / 86_400_000
    if (daysSinceSend < FOLLOW_UP_MIN_DAYS_AFTER_SEND || daysSinceSend > FOLLOW_UP_MAX_DAYS_AFTER_SEND) continue
    qualifying.push({ listId: summary.listId, stream: summary.stream, date: summary.date, sentCampaignId: summary.sentCampaignId! })
  }
  if (!qualifying.length) return { releases: [] }

  const alreadyEvaluated = await getEvaluatedFollowUpKeys(qualifying.map((q) => q.listId))
  const releases: FollowUpPreviewRelease[] = []

  for (const release of qualifying) {
    const [audience, requestedTokens] = await Promise.all([
      getReleaseAudience(release.listId, release.stream, allEmployers),
      getEmployerTokensWithRequestForList(release.listId),
    ])

    const rows: FollowUpPreviewRow[] = []
    let skippedCount = 0

    for (const employer of audience) {
      if (alreadyEvaluated.has(`${release.listId}|${employer.token}`)) continue

      const emailStatus = await getCampaignEmailStatus(release.sentCampaignId, employer.email, token)
      if (!emailStatus) continue // unknown — leave out of preview, same as runReleaseFollowUps() leaves it unrecorded

      const opened = emailStatus.detailStatus >= 3
      const requested = requestedTokens.has(employer.token)

      if (requested) {
        skippedCount++
      } else {
        rows.push({
          listId: release.listId,
          employerToken: employer.token,
          employerName: employer.name,
          company: employer.company,
          email: employer.email,
          classification: opened ? "feedback" : "reminder",
        })
      }
    }

    if (rows.length || skippedCount) {
      releases.push({ listId: release.listId, stream: release.stream, date: release.date, rows, skippedCount })
    }
  }

  return { releases }
}

/** Sends exactly the manager-approved rows from previewReleaseFollowUps() — the manual counterpart
 * to runReleaseFollowUps("cron"), which is untouched. Re-checks each pair against
 * getEvaluatedFollowUpKeys() immediately before sending (cheap, DB-only) to guard the race where
 * the daily cron (or a concurrent manual send) already decided this exact pair between preview and
 * this click — such a row is silently skipped, not re-sent and not errored. Does NOT re-fetch
 * getCampaignEmailStatus()/re-check contact requests — open status only ever moves toward "opened"
 * (a harmless staleness), and a request submitted in the last few minutes is a rare, low-stakes
 * tone mismatch, not a duplicate or incorrect permanent record. */
export async function sendReleaseFollowUpsToApproved(
  approved: Array<{ listId: string; employerToken: string; classification: "feedback" | "reminder" }>,
): Promise<FollowUpRun> {
  await requireEditorAuth()
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const employerFromEmail = process.env.SENDPULSE_EMPLOYER_FROM_EMAIL
  const employerFromName = process.env.SENDPULSE_EMPLOYER_FROM_NAME || "Talent Streams Partner"

  const releaseIds = [...new Set(approved.map((r) => r.listId))]
  let feedbackSent = 0
  let reminderSent = 0
  let failed = 0

  if (approved.length && !employerFromEmail) {
    console.warn("[SendPulse] sendReleaseFollowUpsToApproved: SENDPULSE_EMPLOYER_FROM_EMAIL not set, skipping")
    failed = approved.length
  } else if (approved.length) {
    const [alreadyEvaluated, allEmployers, allLists] = await Promise.all([
      getEvaluatedFollowUpKeys(releaseIds),
      getEmployers(),
      getMailingLists(),
    ])
    const employerByToken = new Map(allEmployers.map((e) => [e.token, e]))
    const streamByListId = new Map(allLists.map((l) => [l.listId, l.stream]))

    for (const row of approved) {
      const key = `${row.listId}|${row.employerToken}`
      if (alreadyEvaluated.has(key)) continue // already decided by a concurrent cron/manual run — don't double-send

      const employer = employerByToken.get(row.employerToken)
      if (!employer) { failed++; continue }

      try {
        if (row.classification === "feedback") {
          await sendTransactionalEmail(
            { email: employer.email, name: employer.name },
            "Помогите нам сделать подборки точнее",
            buildFollowUpFeedbackEmailHtml(),
            { email: employerFromEmail!, name: employerFromName },
          )
          await recordFollowUpOutcome(row.listId, row.employerToken, "feedback")
          feedbackSent++
        } else {
          const stream = streamByListId.get(row.listId) ?? ""
          const listUrl = `${appUrl}/list/${row.listId}?e=${row.employerToken}`
          await sendTransactionalEmail(
            { email: employer.email, name: employer.name },
            `Напоминаем о новой подборке кандидатов — ${stream}`,
            buildFollowUpReminderEmailHtml({ employerName: employer.name, streamName: stream, listUrl }),
            { email: employerFromEmail!, name: employerFromName },
          )
          await recordFollowUpOutcome(row.listId, row.employerToken, "reminder")
          reminderSent++
        }
      } catch (err) {
        console.error("[SendPulse] sendReleaseFollowUpsToApproved: failed to process employer:", row.employerToken, row.listId, err)
        failed++
      }
    }
  }

  const run = await recordReleaseFollowUpRun({
    triggeredBy: "manual",
    releasesChecked: releaseIds.length,
    employersEvaluated: approved.length,
    feedbackSent,
    reminderSent,
    failed,
  })
  revalidatePath("/editor/settings")
  return run
}
