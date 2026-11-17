import "server-only"
import { revalidatePath } from "next/cache"
import { getCandidateById, updateCandidateStatus, updateCandidateFields, type CandidateStatus } from "./db/candidates"
import { addResumeVersion } from "./db/resumes"
import { isOwnFileUrl } from "./blob"
import { getToken, getOrCreateBook, getBookId, addToAddressBook, removeFromAddressBook } from "./sendpulse"

/**
 * The actual candidate business logic behind approveCandidate()/rejectCandidate()/
 * pauseCandidate()/updateCandidate() in app/actions.ts — pulled out here (TASK-64) so the exact
 * same logic, side effects included, can run from a context that isn't a Server Action request,
 * namely app/api/mcp/route.ts. Those Server Actions stay the gate for the browser editor
 * (`requireEditorAuth()` first, then delegate here); the MCP route authenticates its own way
 * (OAuth bearer token, lib/mcp-oauth.ts) and calls these functions directly. Neither caller
 * duplicates the logic — this module has no auth check of its own, same as lib/db/candidates.ts
 * never checking who's calling it; that's the caller's job.
 */

export type RegisterCandidateResult = { ok: true } | { ok: false; error: string }

export type UpdateCandidateData = {
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
}

function uniqueViolationConstraint(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: string; constraint?: string } } | undefined)?.cause
  return cause?.code === "23505" ? cause.constraint : undefined
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
 * (pauseCandidateWorkflow()) — that status doesn't mean the candidate was rejected, see
 * getConfirmedCandidates(). Exported — deleteCandidate() and the duplicate-merge workflow in
 * app/actions.ts also need it. */
export async function removeCandidateFromSendPulse(email: string): Promise<void> {
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
export async function approveCandidateWorkflow(id: string, currentActiveSince?: string): Promise<void> {
  const activeSince = currentActiveSince?.trim() ? undefined : new Date().toLocaleDateString("ru-RU")
  await updateCandidateStatus(id, "Активный" as CandidateStatus, activeSince)
  const candidate = await getCandidateById(id)
  if (candidate?.email) {
    await syncCandidateToSendPulse({ id: candidate.id, name: candidate.name, email: candidate.email, phone: candidate.phone })
  }
  revalidatePath("/editor/candidates")
}

export async function rejectCandidateWorkflow(id: string): Promise<void> {
  const candidate = await getCandidateById(id)
  await updateCandidateStatus(id, "Отклонён" as CandidateStatus)
  if (candidate?.email) {
    await removeCandidateFromSendPulse(candidate.email)
  }
  revalidatePath("/editor/candidates")
}

/** Manual pause — the manager decides a candidate shouldn't appear in new releases for now,
 * without rejecting them outright. Unlike rejectCandidateWorkflow(), doesn't touch SendPulse: a
 * "Не публиковать" candidate stays in the "Candidates" book and in the monthly digest
 * (getConfirmedCandidates() treats "Активный" and "Не публиковать" the same). */
export async function pauseCandidateWorkflow(id: string): Promise<void> {
  await updateCandidateStatus(id, "Не публиковать" as CandidateStatus)
  revalidatePath("/editor/candidates")
}

export async function updateCandidateWorkflow(id: string, data: UpdateCandidateData): Promise<RegisterCandidateResult> {
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
