import "server-only"
import { eq } from "drizzle-orm"
import { db } from "./index"
import { mailingListEntries, streams } from "./schema"
import { getStreamIdByName } from "./streams"
import { getProfiles, type Profile } from "../sheets"

export type MailingListEntry = {
  profile: Profile
  /** Stream value from the mailing list, same for every entry in one list. */
  mailingStream: string
}

export type MailingList = {
  listId: string
  stream: string
  /** ru-RU text, e.g. "21.07.2026" — matches the display format used in SendPulse campaign names. */
  date: string
  entries: MailingListEntry[]
}

export type MailingListSummary = {
  listId: string
  streamId: number | null
  stream: string
  date: string
  candidateCount: number
}

/** Formats an ISO "YYYY-MM-DD" date as ru-RU text ("21.07.2026") — the display format everywhere
 * this app already shows a mailing-list date (SendPulse campaign names, email body, editor UI). */
function isoToRu(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${d}.${m}.${y}`
}

/**
 * Fetch a mailing list by its ID, preserving per-entry stream and the list date.
 * Returns null if the list does not exist or contains no candidates.
 */
export async function getMailingList(listId: string): Promise<MailingList | null> {
  const rows = await db
    .select({
      candidateId: mailingListEntries.candidateId,
      targetDate: mailingListEntries.targetDate,
      streamName: streams.name,
    })
    .from(mailingListEntries)
    .leftJoin(streams, eq(mailingListEntries.streamId, streams.id))
    .where(eq(mailingListEntries.listId, listId))
  if (!rows.length) return null

  const stream = rows[0].streamName ?? ""
  const date = isoToRu(rows[0].targetDate)

  const candidateIds = new Set<string>()
  for (const row of rows) {
    if (row.candidateId) candidateIds.add(row.candidateId)
  }
  if (!candidateIds.size) return null

  const allProfiles = await getProfiles()
  const entries: MailingListEntry[] = allProfiles
    .filter((p) => candidateIds.has(p.id))
    .map((p) => ({ profile: p, mailingStream: stream }))

  return { listId, stream, date, entries }
}

/** Lightweight metadata-only lookup — no candidate/Profile join. Use this instead of
 * getMailingList() wherever only the stream/date are needed (campaign naming, sent-release checks). */
export async function getMailingListMeta(
  listId: string,
): Promise<{ listId: string; stream: string; date: string } | null> {
  const rows = await db
    .select({ streamName: streams.name, targetDate: mailingListEntries.targetDate })
    .from(mailingListEntries)
    .leftJoin(streams, eq(mailingListEntries.streamId, streams.id))
    .where(eq(mailingListEntries.listId, listId))
    .limit(1)
  const row = rows[0]
  return row ? { listId, stream: row.streamName ?? "", date: isoToRu(row.targetDate) } : null
}

/** Fetch all mailing lists grouped by List ID (no profile data, fast), newest date first. */
export async function getMailingLists(): Promise<MailingListSummary[]> {
  try {
    const rows = await db
      .select({
        listId: mailingListEntries.listId,
        streamId: mailingListEntries.streamId,
        streamName: streams.name,
        targetDate: mailingListEntries.targetDate,
        candidateId: mailingListEntries.candidateId,
      })
      .from(mailingListEntries)
      .leftJoin(streams, eq(mailingListEntries.streamId, streams.id))

    const byListId = new Map<string, { streamId: number | null; stream: string; targetDate: string; candidateIds: Set<string> }>()
    for (const row of rows) {
      if (!byListId.has(row.listId)) {
        byListId.set(row.listId, {
          streamId: row.streamId,
          stream: row.streamName ?? "",
          targetDate: row.targetDate,
          candidateIds: new Set(),
        })
      }
      if (row.candidateId) byListId.get(row.listId)!.candidateIds.add(row.candidateId)
    }

    return Array.from(byListId.entries())
      .map(([listId, { streamId, stream, targetDate, candidateIds }]) => ({
        listId,
        streamId,
        stream,
        targetDate,
        candidateCount: candidateIds.size,
      }))
      .sort((a, b) => b.targetDate.localeCompare(a.targetDate))
      .map(({ listId, streamId, stream, targetDate, candidateCount }) => ({
        listId,
        streamId,
        stream,
        date: isoToRu(targetDate),
        candidateCount,
      }))
  } catch {
    return []
  }
}

/**
 * Creates a new mailing list ("release"): one row per candidate, all sharing the same generated
 * List ID/stream/date — the same shape a manager would type by hand, just written in one batch
 * insert instead of row by row. `date` is ISO "YYYY-MM-DD" (straight from an <input type="date">).
 */
export async function createMailingListRows(data: {
  stream: string
  date: string
  candidateIds: string[]
}): Promise<{ listId: string }> {
  if (!data.candidateIds.length) throw new Error("Выберите хотя бы одного кандидата")

  const streamId = await getStreamIdByName(data.stream)
  if (streamId === null) throw new Error(`Стрим не найден: ${data.stream}`)

  const listId = crypto.randomUUID()
  await db.insert(mailingListEntries).values(
    data.candidateIds.map((candidateId) => ({
      listId,
      streamId,
      targetDate: data.date,
      candidateId,
    })),
  )

  return { listId }
}

/** Permanently deletes every row of a mailing list ("release"). Callers must ensure the release
 * was never sent (app/actions.ts checks SendPulse campaigns) — deleting a sent release would
 * desync it from a campaign already delivered to employers. */
export async function deleteMailingListRows(listId: string): Promise<void> {
  await db.delete(mailingListEntries).where(eq(mailingListEntries.listId, listId))
}

export type CandidateMailingHistoryEntry = { listId: string; stream: string; date: string }

/** Every release a candidate has ever been included in, newest first (TASK-05 groundwork —
 * visibility into publication history before any pause-rule enforcement is built on top of it). */
export async function getMailingListsForCandidate(candidateId: string): Promise<CandidateMailingHistoryEntry[]> {
  if (!candidateId) return []

  const rows = await db
    .select({ listId: mailingListEntries.listId, streamName: streams.name, targetDate: mailingListEntries.targetDate })
    .from(mailingListEntries)
    .leftJoin(streams, eq(mailingListEntries.streamId, streams.id))
    .where(eq(mailingListEntries.candidateId, candidateId))

  const byListId = new Map<string, { stream: string; targetDate: string }>()
  for (const row of rows) {
    if (!byListId.has(row.listId)) byListId.set(row.listId, { stream: row.streamName ?? "", targetDate: row.targetDate })
  }

  return Array.from(byListId.entries())
    .map(([listId, { stream, targetDate }]) => ({ listId, stream, targetDate }))
    .sort((a, b) => b.targetDate.localeCompare(a.targetDate))
    .map(({ listId, stream, targetDate }) => ({ listId, stream, date: isoToRu(targetDate) }))
}
