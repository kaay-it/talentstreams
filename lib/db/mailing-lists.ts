import "server-only"
import { eq, inArray } from "drizzle-orm"
import { db } from "./index"
import { mailingLists, mailingListRecipients, selections, selectionEntries, selectionEmployers, streams } from "./schema"
import { getStreamIdByName } from "./streams"
import { getCandidates, type Candidate } from "./candidates"
import { getEmployers, getEmployerByToken, confirmedEmployersForStream, type Employer } from "./employers"

export type MailingListEntry = {
  profile: Candidate
  /** Stream value from the mailing list, same for every entry in one list. */
  mailingStream: string
}

/** One "подборка" within a release — either the default (employerTokens: [], shown to anyone
 * without a personal override) or personal (employerTokens non-empty, shown only to them,
 * bypassing filterCandidatesForEmployer entirely). */
export type ResolvedSelection = {
  selectionId: string
  label: string
  employerTokens: string[]
  entries: MailingListEntry[]
}

export type MailingList = {
  listId: string
  stream: string
  /** ru-RU text, e.g. "21.07.2026" — matches the display format used in SendPulse campaign names. */
  date: string
  /** null if this release has no default selection — every subscriber must then have a personal
   * one, or they see the "подборка не готова" state (see app/list/[listId]/page.tsx). */
  default: ResolvedSelection | null
  personal: ResolvedSelection[]
}

export type MailingListSummary = {
  listId: string
  streamId: number | null
  stream: string
  date: string
  recipientLabel: string
  sentCampaignId: number | null
  /** Union across the default selection (if any) and every personal one — a candidate counts
   * once even if they appear in more than one selection of the same release. */
  candidateCount: number
  candidateIds: string[]
  personalSelectionCount: number
}

/** Formats an ISO "YYYY-MM-DD" date as ru-RU text ("21.07.2026") — the display format everywhere
 * this app already shows a mailing-list date (SendPulse campaign names, email body, editor UI). */
export function isoToRu(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

/** Extracts the ru-RU date from a full "YYYY-MM-DDTHH:MM:SS..." timestamp string, ignoring the
 * time component — this app doesn't surface mailing-list time anywhere yet (UI picks a date
 * only); see isoToRu() for the date-only formatter this wraps. */
function timestampToRu(timestamp: string): string {
  return isoToRu(timestamp.slice(0, 10))
}

/** Display name for a release's SendPulse campaign (dashboard, editor UI) — NOT the source of
 * truth for "was this release sent" (that's mailingLists.sentCampaignId, written once on first
 * real send). Empty recipientLabel — ordinary whole-stream release, name as always; non-empty —
 * narrowed release, company names suffixed so it's distinguishable from another narrowed release
 * of the same stream on the same day. Plain helper, not a Server Action — lives here (not
 * app/actions.ts, which is "use server" and would force it to be async) since both
 * app/actions.ts and app/editor/page.tsx need it. */
export function campaignNameFor(stream: string, date: string, recipientLabel: string): string {
  return recipientLabel ? `${stream} — ${date} — ${recipientLabel}` : `${stream} — ${date}`
}

/**
 * Fetch a mailing list by its ID: header (stream/date) plus every selection ("подборка") that
 * belongs to it, resolved into full Candidate profiles — the default (if one exists) and every
 * personal one, each tagged with the employer tokens it's scoped to. Returns null only if the
 * release itself doesn't exist; a release with no selections at all (shouldn't normally happen —
 * creation requires at least one) comes back with default: null, personal: [].
 */
export async function getMailingList(listId: string): Promise<MailingList | null> {
  const header = await db
    .select({ streamName: streams.name, targetDate: mailingLists.targetDate })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(eq(mailingLists.id, listId))
    .limit(1)
  const h = header[0]
  if (!h) return null

  const stream = h.streamName ?? ""
  const date = timestampToRu(h.targetDate)

  const selectionRows = await db
    .select({ id: selections.id, label: selections.label })
    .from(selections)
    .where(eq(selections.listId, listId))
  if (!selectionRows.length) return { listId, stream, date, default: null, personal: [] }

  const selectionIds = selectionRows.map((r) => r.id)

  const employerRows = await db
    .select({ selectionId: selectionEmployers.selectionId, employerToken: selectionEmployers.employerToken })
    .from(selectionEmployers)
    .where(inArray(selectionEmployers.selectionId, selectionIds))
  const employerTokensBySelection = new Map<string, string[]>()
  for (const row of employerRows) {
    const arr = employerTokensBySelection.get(row.selectionId) ?? []
    arr.push(row.employerToken)
    employerTokensBySelection.set(row.selectionId, arr)
  }

  const entryRows = await db
    .select({ selectionId: selectionEntries.selectionId, candidateId: selectionEntries.candidateId })
    .from(selectionEntries)
    .where(inArray(selectionEntries.selectionId, selectionIds))
  const candidateIdsBySelection = new Map<string, Set<string>>()
  for (const row of entryRows) {
    if (!candidateIdsBySelection.has(row.selectionId)) candidateIdsBySelection.set(row.selectionId, new Set())
    candidateIdsBySelection.get(row.selectionId)!.add(row.candidateId)
  }

  // All statuses, not just getActiveCandidates() — a candidate's historical membership in an
  // already-sent release's selection must survive their status changing afterward (same
  // reasoning as the old getMailingList(), see TASK-05).
  const allProfiles = await getCandidates()
  const profileById = new Map(allProfiles.map((p) => [p.id, p]))

  let defaultSelection: ResolvedSelection | null = null
  const personal: ResolvedSelection[] = []
  for (const row of selectionRows) {
    const employerTokens = employerTokensBySelection.get(row.id) ?? []
    const candidateIds = candidateIdsBySelection.get(row.id) ?? new Set<string>()
    const entries: MailingListEntry[] = [...candidateIds]
      .map((id) => profileById.get(id))
      .filter((p): p is Candidate => Boolean(p))
      .map((profile) => ({ profile, mailingStream: stream }))
    const resolved: ResolvedSelection = { selectionId: row.id, label: row.label, employerTokens, entries }
    if (employerTokens.length) personal.push(resolved)
    else defaultSelection = resolved
  }

  return { listId, stream, date, default: defaultSelection, personal }
}

/** Pure resolution, no DB access — given an already-fetched MailingList, decides what a specific
 * employer sees: their personal selection if one targets their token (never filtered — the
 * manager hand-picked these candidates for them), else the default selection (still filtered by
 * the caller via filterCandidatesForEmployer, same as always), else null ("подборка не готова" —
 * this employer has neither a personal selection nor a default to fall back on). */
export function resolveMailingListForEmployer(
  list: MailingList,
  employerToken: string,
): { entries: MailingListEntry[]; isPersonal: boolean } | null {
  const personal = list.personal.find((s) => s.employerTokens.includes(employerToken))
  if (personal) return { entries: personal.entries, isPersonal: true }
  if (list.default) return { entries: list.default.entries, isPersonal: false }
  return null
}

/** Lightweight metadata-only lookup — no candidate/Profile join. Use this instead of
 * getMailingList() wherever only the stream/date are needed (campaign naming, sent-release checks). */
export async function getMailingListMeta(
  listId: string,
): Promise<{ listId: string; stream: string; date: string; recipientLabel: string; sentCampaignId: number | null } | null> {
  const rows = await db
    .select({
      streamName: streams.name,
      targetDate: mailingLists.targetDate,
      recipientLabel: mailingLists.recipientLabel,
      sentCampaignId: mailingLists.sentCampaignId,
    })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(eq(mailingLists.id, listId))
    .limit(1)
  const row = rows[0]
  return row
    ? {
        listId,
        stream: row.streamName ?? "",
        date: timestampToRu(row.targetDate),
        recipientLabel: row.recipientLabel,
        sentCampaignId: row.sentCampaignId,
      }
    : null
}

/** Union of candidate IDs across EVERY selection (default + all personal) of a release — used by
 * publishMailingList() to apply the publication-pause rule (TASK-05) to exactly the candidates
 * touched by this send, and for the "N кандидатов" count shown in the Telegram notification.
 * Deliberately a union, not a sum: a candidate counts once per release even if they appear in
 * more than one selection (decided with the user — one send event, one pause-counter tick). */
export async function getAllSelectionCandidateIds(listId: string): Promise<string[]> {
  const selectionRows = await db.select({ id: selections.id }).from(selections).where(eq(selections.listId, listId))
  if (!selectionRows.length) return []
  const rows = await db
    .select({ candidateId: selectionEntries.candidateId })
    .from(selectionEntries)
    .where(inArray(selectionEntries.selectionId, selectionRows.map((r) => r.id)))
  return [...new Set(rows.map((r) => r.candidateId))]
}

/** Finds the id of a release's default selection (the one with no selectionEmployers rows), or
 * null if it has none — a release legitimately has no default if every subscriber got a personal
 * selection instead. */
async function findDefaultSelectionId(listId: string): Promise<string | null> {
  const rows = await db.select({ id: selections.id }).from(selections).where(eq(selections.listId, listId))
  if (!rows.length) return null
  const ids = rows.map((r) => r.id)
  const employerRows = await db
    .select({ selectionId: selectionEmployers.selectionId })
    .from(selectionEmployers)
    .where(inArray(selectionEmployers.selectionId, ids))
  const withEmployers = new Set(employerRows.map((r) => r.selectionId))
  return ids.find((id) => !withEmployers.has(id)) ?? null
}

/** Fetch all mailing lists grouped by List ID (no profile data, fast), newest date first. */
export async function getMailingLists(): Promise<MailingListSummary[]> {
  try {
    const headers = await db
      .select({
        listId: mailingLists.id,
        streamId: mailingLists.streamId,
        streamName: streams.name,
        targetDate: mailingLists.targetDate,
        recipientLabel: mailingLists.recipientLabel,
        sentCampaignId: mailingLists.sentCampaignId,
      })
      .from(mailingLists)
      .leftJoin(streams, eq(mailingLists.streamId, streams.id))

    const selectionRows = await db.select({ id: selections.id, listId: selections.listId }).from(selections)
    const selectionIdsByList = new Map<string, string[]>()
    for (const row of selectionRows) {
      const arr = selectionIdsByList.get(row.listId) ?? []
      arr.push(row.id)
      selectionIdsByList.set(row.listId, arr)
    }
    const allSelectionIds = selectionRows.map((r) => r.id)

    const entryRows = allSelectionIds.length
      ? await db
          .select({ selectionId: selectionEntries.selectionId, candidateId: selectionEntries.candidateId })
          .from(selectionEntries)
          .where(inArray(selectionEntries.selectionId, allSelectionIds))
      : []
    const candidateIdsBySelection = new Map<string, string[]>()
    for (const row of entryRows) {
      const arr = candidateIdsBySelection.get(row.selectionId) ?? []
      arr.push(row.candidateId)
      candidateIdsBySelection.set(row.selectionId, arr)
    }

    const employerRows = allSelectionIds.length
      ? await db
          .select({ selectionId: selectionEmployers.selectionId })
          .from(selectionEmployers)
          .where(inArray(selectionEmployers.selectionId, allSelectionIds))
      : []
    const selectionsWithEmployers = new Set(employerRows.map((r) => r.selectionId))

    return headers
      .map((h) => {
        const selectionIds = selectionIdsByList.get(h.listId) ?? []
        const candidateIds = [...new Set(selectionIds.flatMap((sid) => candidateIdsBySelection.get(sid) ?? []))]
        const personalSelectionCount = selectionIds.filter((sid) => selectionsWithEmployers.has(sid)).length
        return {
          listId: h.listId,
          streamId: h.streamId,
          stream: h.streamName ?? "",
          targetDate: h.targetDate,
          recipientLabel: h.recipientLabel,
          sentCampaignId: h.sentCampaignId,
          candidateCount: candidateIds.length,
          candidateIds,
          personalSelectionCount,
        }
      })
      .sort((a, b) => b.targetDate.localeCompare(a.targetDate))
      .map(({ listId, streamId, stream, targetDate, recipientLabel, sentCampaignId, candidateCount, candidateIds, personalSelectionCount }) => ({
        listId,
        streamId,
        stream,
        date: timestampToRu(targetDate),
        recipientLabel,
        sentCampaignId,
        candidateCount,
        candidateIds,
        personalSelectionCount,
      }))
  } catch {
    return []
  }
}

/**
 * Creates a new mailing list ("release"): a header row + (if candidateIds is non-empty) a default
 * selection. `candidateIds` may be empty — a release can start with no default if the manager
 * means to cover the stream entirely with personal selections (added separately via
 * createPersonalSelection()); the "at least one selection total" rule is enforced by
 * createMailingList() in app/actions.ts, which sees both the default and any personal selections
 * being created alongside it. `date` is ISO "YYYY-MM-DD" (straight from an <input type="date">).
 * `recipientLabel` — company names of a narrowed release's recipients, "" or omitted = whole
 * stream (the default).
 */
export async function createMailingListRows(data: {
  stream: string
  date: string
  candidateIds: string[]
  recipientLabel?: string
}): Promise<{ listId: string }> {
  const streamId = await getStreamIdByName(data.stream)
  if (streamId === null) throw new Error(`Стрим не найден: ${data.stream}`)

  const listId = crypto.randomUUID()
  await db.insert(mailingLists).values({
    id: listId,
    streamId,
    targetDate: `${data.date}T00:00:00`,
    recipientLabel: data.recipientLabel ?? "",
  })
  if (data.candidateIds.length) {
    const selectionId = crypto.randomUUID()
    await db.insert(selections).values({ id: selectionId, listId, label: "" })
    await db.insert(selectionEntries).values(data.candidateIds.map((candidateId) => ({ selectionId, candidateId })))
  }

  return { listId }
}

/** Snaps a release's planned date/time to the actual moment of first send (see
 * publishMailingList()) — the plan is not an obligation, the manager may send later/earlier and
 * at a different time of day; now a full timestamp, not just a date. `timestamp` is an ISO string. */
export async function updateMailingListTimestamp(listId: string, timestamp: string): Promise<void> {
  await db.update(mailingLists).set({ targetDate: timestamp }).where(eq(mailingLists.id, listId))
}

/** Records that a release was actually sent — written once, right after the first successful
 * createCampaign() (publishMailingList() only calls this inside its !alreadySent branch, so a
 * resend never overwrites it with a newer campaignId — "was this release sent" means "sent at
 * least once", not "what was the most recent campaignId"). */
export async function markMailingListSent(listId: string, campaignId: number): Promise<void> {
  await db.update(mailingLists).set({ sentCampaignId: campaignId }).where(eq(mailingLists.id, listId))
}

/** Deletes a release's header row — ON DELETE CASCADE on mailingListRecipients.listId and
 * selections.listId (which in turn cascades selectionEntries/selectionEmployers) takes care of
 * every child row, no separate cleanup needed. Callers must ensure the release was never sent
 * (app/actions.ts checks mailingLists.sentCampaignId). */
export async function deleteMailingListRows(listId: string): Promise<void> {
  await db.delete(mailingLists).where(eq(mailingLists.id, listId))
}

export type CandidateMailingHistoryEntry = { listId: string; stream: string; date: string; sentCampaignId: number | null }

/** Every release a candidate has ever been included in (via any selection, default or personal),
 * newest first (TASK-05 groundwork — visibility into publication history before any pause-rule
 * enforcement is built on top of it). */
export async function getMailingListsForCandidate(candidateId: string): Promise<CandidateMailingHistoryEntry[]> {
  if (!candidateId) return []

  const entryRows = await db
    .select({ selectionId: selectionEntries.selectionId })
    .from(selectionEntries)
    .where(eq(selectionEntries.candidateId, candidateId))
  const selectionIds = [...new Set(entryRows.map((r) => r.selectionId))]
  if (!selectionIds.length) return []

  const selectionRows = await db
    .select({ listId: selections.listId })
    .from(selections)
    .where(inArray(selections.id, selectionIds))
  const listIds = [...new Set(selectionRows.map((r) => r.listId))]
  if (!listIds.length) return []

  const headers = await db
    .select({
      listId: mailingLists.id,
      streamName: streams.name,
      targetDate: mailingLists.targetDate,
      sentCampaignId: mailingLists.sentCampaignId,
    })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(inArray(mailingLists.id, listIds))

  return headers
    .map((h) => ({ listId: h.listId, stream: h.streamName ?? "", targetDate: h.targetDate, sentCampaignId: h.sentCampaignId }))
    .sort((a, b) => b.targetDate.localeCompare(a.targetDate))
    .map(({ listId, stream, targetDate, sentCampaignId }) => ({ listId, stream, date: timestampToRu(targetDate), sentCampaignId }))
}

export type MailingListCleanupStatus = { sentCampaignId: number | null; targetDate: string }

/** Batched lookup of just enough mailingLists state to decide whether a throwaway SendPulse
 * address book is safe to clean up — used by the cleanup-adhoc-books cron, which discovers
 * candidate books directly from SendPulse (by naming pattern) and then cross-references each
 * extracted listId here. A listId missing from the returned map means the release row no longer
 * exists (deleteMailingList() only ever allows deleting an unsent release, so a missing row is
 * never one that had a successful campaign). */
export async function getMailingListCleanupStatuses(
  listIds: string[],
): Promise<Map<string, MailingListCleanupStatus>> {
  if (!listIds.length) return new Map()
  const rows = await db
    .select({ id: mailingLists.id, sentCampaignId: mailingLists.sentCampaignId, targetDate: mailingLists.targetDate })
    .from(mailingLists)
    .where(inArray(mailingLists.id, listIds))
  return new Map(rows.map((r) => [r.id, { sentCampaignId: r.sentCampaignId, targetDate: r.targetDate }]))
}

/** Writes the hand-picked recipient-override rows for a release — one row per employer token.
 * Call only when employerTokens.length > 0; leaving this unwritten for a listId is exactly what
 * makes that release default to "whole stream" (see getMailingListRecipientTokens()). */
export async function createMailingListRecipientRows(listId: string, employerTokens: string[]): Promise<void> {
  const tokens = [...new Set(employerTokens)]
  if (!tokens.length) return
  await db.insert(mailingListRecipients).values(tokens.map((employerToken) => ({ listId, employerToken })))
}

/** Hand-picked recipient tokens for a release, or [] if it targets the whole stream (the
 * default — no override rows were ever written for this listId). */
export async function getMailingListRecipientTokens(listId: string): Promise<string[]> {
  const rows = await db
    .select({ employerToken: mailingListRecipients.employerToken })
    .from(mailingListRecipients)
    .where(eq(mailingListRecipients.listId, listId))
  return rows.map((r) => r.employerToken)
}

/** Fully replaces a release's DEFAULT selection — deletes its current selectionEntries and
 * inserts the new set. An empty candidateIds deletes the default selection row entirely (cascade
 * takes its entries with it), making "no default" an explicit, valid state — not just an empty
 * one — consistent with how a release can be built entirely out of personal selections. Creates
 * the default selection row if this release doesn't have one yet and candidateIds is non-empty. */
export async function replaceDefaultSelectionEntries(listId: string, candidateIds: string[]): Promise<void> {
  const existingId = await findDefaultSelectionId(listId)

  if (!candidateIds.length) {
    if (existingId) await db.delete(selections).where(eq(selections.id, existingId))
    return
  }

  const selectionId = existingId ?? crypto.randomUUID()
  if (!existingId) await db.insert(selections).values({ id: selectionId, listId, label: "" })
  await db.delete(selectionEntries).where(eq(selectionEntries.selectionId, selectionId))
  await db.insert(selectionEntries).values(candidateIds.map((candidateId) => ({ selectionId, candidateId })))
}

/** Fully replaces a release's recipient override and keeps the header's recipientLabel in sync
 * with it (the two must always agree) — switching back to "whole stream" also goes through this
 * (employerTokens: [], recipientLabel: "" clears the old rows and the label together). */
export async function replaceMailingListRecipients(
  listId: string,
  employerTokens: string[],
  recipientLabel: string,
): Promise<void> {
  await db.delete(mailingListRecipients).where(eq(mailingListRecipients.listId, listId))
  const tokens = [...new Set(employerTokens)]
  if (tokens.length) {
    await db.insert(mailingListRecipients).values(tokens.map((employerToken) => ({ listId, employerToken })))
  }
  await db.update(mailingLists).set({ recipientLabel }).where(eq(mailingLists.id, listId))
}

/** Creates a new personal ("личная") selection for a release — its own candidate set, visible
 * only to the given employers, never filtered by filterCandidatesForEmployer (the manager
 * hand-picked these candidates for these specific employers; no geo/exclusion second-guessing). */
export async function createPersonalSelection(
  listId: string,
  candidateIds: string[],
  employerTokens: string[],
  label: string,
): Promise<{ selectionId: string }> {
  if (!candidateIds.length) throw new Error("Выберите хотя бы одного кандидата для личной подборки")
  if (!employerTokens.length) throw new Error("Выберите хотя бы одного работодателя для личной подборки")

  const selectionId = crypto.randomUUID()
  await db.insert(selections).values({ id: selectionId, listId, label })
  await db.insert(selectionEntries).values(candidateIds.map((candidateId) => ({ selectionId, candidateId })))
  await db
    .insert(selectionEmployers)
    .values([...new Set(employerTokens)].map((employerToken) => ({ selectionId, employerToken })))
  return { selectionId }
}

/** Fully replaces a personal selection's candidates and target employers (and its label) — same
 * "delete rows, reinsert" pattern as replaceDefaultSelectionEntries/replaceMailingListRecipients. */
export async function updatePersonalSelection(
  selectionId: string,
  candidateIds: string[],
  employerTokens: string[],
  label: string,
): Promise<void> {
  if (!candidateIds.length) throw new Error("Выберите хотя бы одного кандидата для личной подборки")
  if (!employerTokens.length) throw new Error("Выберите хотя бы одного работодателя для личной подборки")

  await db.update(selections).set({ label }).where(eq(selections.id, selectionId))
  await db.delete(selectionEntries).where(eq(selectionEntries.selectionId, selectionId))
  await db.insert(selectionEntries).values(candidateIds.map((candidateId) => ({ selectionId, candidateId })))
  await db.delete(selectionEmployers).where(eq(selectionEmployers.selectionId, selectionId))
  await db
    .insert(selectionEmployers)
    .values([...new Set(employerTokens)].map((employerToken) => ({ selectionId, employerToken })))
}

/** Deletes a personal selection — cascade takes its selectionEntries/selectionEmployers with it.
 * Unlike the default selection, a personal one is never implicitly removed by emptying its
 * candidate list; it's always an explicit action (see release-detail-modal.tsx's "Удалить личную
 * подборку"). */
export async function deletePersonalSelection(selectionId: string): Promise<void> {
  await db.delete(selections).where(eq(selections.id, selectionId))
}

/** Reads one selection directly by id, regardless of default/personal — used by the standalone
 * "Просмотреть подборку" page (app/selection/[selectionId]/page.tsx), which lets an editor inspect
 * any подборка's content without going through a specific employer's token. Never filtered (the
 * page itself never applies filterCandidatesForEmployer — see that page for why). */
export async function getSelectionById(
  selectionId: string,
): Promise<{ selectionId: string; listId: string; label: string; stream: string; date: string; employerTokens: string[]; entries: MailingListEntry[] } | null> {
  const rows = await db.select({ id: selections.id, listId: selections.listId, label: selections.label }).from(selections).where(eq(selections.id, selectionId)).limit(1)
  const row = rows[0]
  if (!row) return null

  const header = await db
    .select({ streamName: streams.name, targetDate: mailingLists.targetDate })
    .from(mailingLists)
    .leftJoin(streams, eq(mailingLists.streamId, streams.id))
    .where(eq(mailingLists.id, row.listId))
    .limit(1)
  const h = header[0]
  const stream = h?.streamName ?? ""
  const date = h ? timestampToRu(h.targetDate) : ""

  const employerRows = await db.select({ employerToken: selectionEmployers.employerToken }).from(selectionEmployers).where(eq(selectionEmployers.selectionId, selectionId))
  const employerTokens = employerRows.map((r) => r.employerToken)

  const entryRows = await db.select({ candidateId: selectionEntries.candidateId }).from(selectionEntries).where(eq(selectionEntries.selectionId, selectionId))
  const candidateIds = new Set(entryRows.map((r) => r.candidateId))
  const allProfiles = await getCandidates()
  const entries: MailingListEntry[] = allProfiles
    .filter((p) => candidateIds.has(p.id))
    .map((profile) => ({ profile, mailingStream: stream }))

  return { selectionId, listId: row.listId, label: row.label, stream, date, employerTokens, entries }
}

/** Fetches the actual send audience of a release (narrowed recipients if any, otherwise every
 * confirmed subscriber of its stream) and returns those with no applicable selection at all —
 * neither a personal one scoped to them nor a default to fall back on. [] whenever a default
 * exists (it covers everyone) or the release doesn't exist. This is the authoritative check
 * publishMailingList() gates on; the editor UI's roster table mirrors the same logic client-side
 * for an instant warning while the manager is still building the release. */
export async function getEmployersWithoutSelection(listId: string): Promise<Employer[]> {
  const meta = await getMailingListMeta(listId)
  if (!meta) return []

  const list = await getMailingList(listId)
  if (!list || list.default) return []

  const coveredTokens = new Set(list.personal.flatMap((s) => s.employerTokens))

  const recipientTokens = await getMailingListRecipientTokens(listId)
  const audience = recipientTokens.length
    ? (await Promise.all(recipientTokens.map((t) => getEmployerByToken(t)))).filter((e): e is Employer => Boolean(e))
    : confirmedEmployersForStream(await getEmployers(), { name: meta.stream })

  return audience.filter((e) => !coveredTokens.has(e.token))
}
