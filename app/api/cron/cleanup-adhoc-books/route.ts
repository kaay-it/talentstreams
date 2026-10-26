import { type NextRequest, NextResponse } from "next/server"
import { getMailingListCleanupStatuses } from "@/lib/db/mailing-lists"
import { getToken, getCampaignStatus, listAllAddressBooks, deleteAddressBook } from "@/lib/sendpulse"

// `${stream} — ${date} — ${listId}`, see publishMailingList() — the last " — "-separated segment
// of a throwaway book's name is always a mailingLists.id (crypto.randomUUID()).
const ADHOC_BOOK_PATTERN = / — ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

// How long an unsent release's throwaway book is left alone before being swept up as abandoned.
// Must comfortably outlast any realistic same-day retry window (TASK-43 + the no-delete-on-
// failure fix both exist specifically so a manager can keep clicking "Отправить" over minutes to
// hours without losing SendPulse's indexing progress on a brand-new contact) — picked generously
// wide on purpose, there is no cost to waiting an extra day or two before cleaning up.
const ABANDONED_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Daily sweep (vercel.json cron) that deletes throwaway SendPulse address books a restricted
 * release's publishMailingList() built (`${stream} — ${date} — ${listId}`, TASK-40). Discovers
 * candidates directly from SendPulse by naming pattern (not by querying Neon first) so it also
 * catches books whose release row no longer exists — three independent reasons a book is safe to
 * delete:
 *
 * 1. The release was sent and SendPulse reports the campaign fully processed (status 3 — the one
 *    value confirmed by direct testing). Can't delete right after sending: SendPulse rejects
 *    deleting a book still attached to a pending/moderation campaign, which can sit in moderation
 *    for an unknown stretch — far beyond what a single serverless invocation (10s hard cap on
 *    Vercel Hobby) can wait out with an in-request retry.
 * 2. The release row no longer exists in Neon — deleteMailingList() only ever allows deleting an
 *    unsent release, so a missing row never had a successful campaign attached.
 * 3. The release still exists, was never sent, and hasn't been touched in a while
 *    (ABANDONED_THRESHOLD_MS) — genuinely abandoned, not just mid-retry.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Не удалось получить токен SendPulse" }, { status: 500 })

  const allBooks = await listAllAddressBooks(token)
  const candidates = allBooks
    .map((b) => {
      const m = b.name.match(ADHOC_BOOK_PATTERN)
      return m ? { bookId: b.id, bookName: b.name, listId: m[1] } : null
    })
    .filter((x): x is { bookId: number; bookName: string; listId: string } => x !== null)

  const statuses = await getMailingListCleanupStatuses(candidates.map((c) => c.listId))
  const now = Date.now()
  const results: { listId: string; bookName: string; outcome: string }[] = []

  for (const { bookId, bookName, listId } of candidates) {
    try {
      const meta = statuses.get(listId)

      if (!meta) {
        await deleteAddressBook(bookId, token)
        results.push({ listId, bookName, outcome: "deleted (release no longer exists)" })
        continue
      }

      if (meta.sentCampaignId !== null) {
        const campaignStatus = await getCampaignStatus(meta.sentCampaignId, token)
        if (campaignStatus !== 3) {
          results.push({ listId, bookName, outcome: `skipped (campaign status=${campaignStatus})` })
          continue
        }
        await deleteAddressBook(bookId, token)
        results.push({ listId, bookName, outcome: "deleted (campaign fully sent)" })
        continue
      }

      const lastTouchedMs = new Date(meta.targetDate).getTime()
      if (Number.isNaN(lastTouchedMs) || now - lastTouchedMs <= ABANDONED_THRESHOLD_MS) {
        results.push({ listId, bookName, outcome: "skipped (unsent, still recent)" })
        continue
      }
      await deleteAddressBook(bookId, token)
      results.push({ listId, bookName, outcome: "deleted (unsent, abandoned)" })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[cleanup-adhoc-books] ${listId} failed:`, message)
      results.push({ listId, bookName, outcome: `error: ${message}` })
    }
  }

  console.log("[cleanup-adhoc-books]", results)
  return NextResponse.json({ checked: candidates.length, results })
}
