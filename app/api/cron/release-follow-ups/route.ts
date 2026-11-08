import { type NextRequest, NextResponse } from "next/server"
import { runReleaseFollowUps, getReleaseFollowUpSettings } from "@/app/actions"

/**
 * Daily cron (vercel.json) — unlike the candidate digest's once-a-month schedule, this needs to
 * run often: each release only sits in its [3, 21]-day eligibility window once (see
 * FOLLOW_UP_MIN/MAX_DAYS_AFTER_SEND, app/actions.ts), and a daily check catches newly-eligible
 * employers close to the 3-day mark instead of days late. Safe to run as often as needed —
 * runReleaseFollowUps() never re-messages a (release, employer) pair it already evaluated. Gated
 * by the autoSendEnabled toggle in /editor/settings (components/release-follow-up-section.tsx) —
 * a manager can turn off the automatic schedule without disabling the manual "Отправить сейчас"
 * button, which calls the same runReleaseFollowUps() directly and ignores this gate.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const settings = await getReleaseFollowUpSettings()
  if (!settings.autoSendEnabled) {
    return NextResponse.json({ skipped: true, reason: "auto-send disabled in /editor/settings" })
  }

  const run = await runReleaseFollowUps("cron")
  return NextResponse.json({ run })
}
