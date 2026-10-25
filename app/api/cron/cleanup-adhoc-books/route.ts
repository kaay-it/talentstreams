import { type NextRequest, NextResponse } from "next/server"
import { getSentRestrictedMailingLists } from "@/lib/db/mailing-lists"
import { getToken, getCampaignStatus, getBookId, deleteAddressBook } from "@/lib/sendpulse"

/**
 * Daily sweep (vercel.json cron) that deletes the throwaway SendPulse address book a restricted
 * release's publishMailingList() built (`${stream} — ${date} — ${listId}`, TASK-40). That book
 * can't be deleted right after the campaign is created — confirmed by testing: SendPulse rejects
 * deleting a book still attached to a pending/moderation campaign, and the campaign can sit in
 * moderation for an unknown, possibly long, stretch — far beyond what a single serverless
 * invocation (10s hard cap on Vercel Hobby) can wait out with an in-request retry. This runs
 * later, out of band, once SendPulse reports the campaign as fully processed (status 3 — the one
 * value confirmed by direct testing against every real campaign in this account, sent or not).
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const token = await getToken()
  if (!token) return NextResponse.json({ error: "Не удалось получить токен SendPulse" }, { status: 500 })

  const lists = await getSentRestrictedMailingLists()
  const results: { listId: string; bookName: string; outcome: string }[] = []

  for (const list of lists) {
    const bookName = `${list.stream} — ${list.date} — ${list.listId}`
    try {
      const campaignStatus = await getCampaignStatus(list.sentCampaignId, token)
      if (campaignStatus !== 3) {
        results.push({ listId: list.listId, bookName, outcome: `skipped (campaign status=${campaignStatus})` })
        continue
      }
      const bookId = await getBookId(bookName, token)
      if (bookId === null) {
        results.push({ listId: list.listId, bookName, outcome: "already gone" })
        continue
      }
      await deleteAddressBook(bookId, token)
      results.push({ listId: list.listId, bookName, outcome: "deleted" })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[cleanup-adhoc-books] ${list.listId} failed:`, message)
      results.push({ listId: list.listId, bookName, outcome: `error: ${message}` })
    }
  }

  console.log("[cleanup-adhoc-books]", results)
  return NextResponse.json({ checked: lists.length, results })
}
