import { type NextRequest, NextResponse } from "next/server"
import { runCandidateDigest, getCandidateDigestSettings } from "@/app/actions"

/**
 * Weekly cron (vercel.json, every Monday) that only actually sends on the first Monday of the
 * month — Vercel Cron has no native "Nth weekday" schedule, so the route itself no-ops on every
 * other Monday. Gated by the autoSendEnabled toggle in /editor/settings (components/
 * candidate-digest-section.tsx) — a manager can turn off the automatic schedule without
 * disabling the manual "Отправить сейчас" button, which calls the same runCandidateDigest()
 * directly and ignores this gate.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  if (now.getUTCDay() !== 1 || now.getUTCDate() > 7) {
    return NextResponse.json({ skipped: true, reason: "not the first Monday of the month" })
  }

  const settings = await getCandidateDigestSettings()
  if (!settings.autoSendEnabled) {
    return NextResponse.json({ skipped: true, reason: "auto-send disabled in /editor/settings" })
  }

  const run = await runCandidateDigest("cron")
  return NextResponse.json({ run })
}
