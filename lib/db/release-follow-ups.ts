import "server-only"
import { desc, inArray } from "drizzle-orm"
import { db } from "./index"
import { releaseFollowUps, releaseFollowUpRuns } from "./schema"
import { getBooleanSetting, setSetting } from "./settings"

const AUTO_SEND_SETTING = "releaseFollowUpAutoSendEnabled"

export type FollowUpRun = {
  id: number
  startedAt: string
  triggeredBy: "cron" | "manual"
  releasesChecked: number
  employersEvaluated: number
  feedbackSent: number
  reminderSent: number
  failed: number
}

function toFollowUpRun(row: typeof releaseFollowUpRuns.$inferSelect): FollowUpRun {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    triggeredBy: row.triggeredBy as "cron" | "manual",
    releasesChecked: row.releasesChecked,
    employersEvaluated: row.employersEvaluated,
    feedbackSent: row.feedbackSent,
    reminderSent: row.reminderSent,
    failed: row.failed,
  }
}

export async function getReleaseFollowUpSettings(): Promise<{ autoSendEnabled: boolean }> {
  return { autoSendEnabled: await getBooleanSetting(AUTO_SEND_SETTING, true) }
}

export async function setReleaseFollowUpAutoSend(enabled: boolean): Promise<void> {
  await setSetting(AUTO_SEND_SETTING, "boolean", String(enabled))
}

/** Most recent runs first — cron and manual alike. */
export async function getReleaseFollowUpRuns(): Promise<FollowUpRun[]> {
  const rows = await db.select().from(releaseFollowUpRuns).orderBy(desc(releaseFollowUpRuns.startedAt))
  return rows.map(toFollowUpRun)
}

export async function recordReleaseFollowUpRun(data: {
  triggeredBy: "cron" | "manual"
  releasesChecked: number
  employersEvaluated: number
  feedbackSent: number
  reminderSent: number
  failed: number
}): Promise<FollowUpRun> {
  const [row] = await db.insert(releaseFollowUpRuns).values(data).returning()
  return toFollowUpRun(row)
}

/** (listId, employerToken) pairs already evaluated for these releases, as `${listId}|${employerToken}`
 * keys — runReleaseFollowUps() (app/actions.ts) skips any pair already in this set, cron or manual,
 * so a release is only ever evaluated once per employer regardless of how many times the job runs
 * during its eligibility window. */
export async function getEvaluatedFollowUpKeys(listIds: string[]): Promise<Set<string>> {
  if (!listIds.length) return new Set()
  const rows = await db
    .select({ listId: releaseFollowUps.listId, employerToken: releaseFollowUps.employerToken })
    .from(releaseFollowUps)
    .where(inArray(releaseFollowUps.listId, listIds))
  return new Set(rows.map((r) => `${r.listId}|${r.employerToken}`))
}

export async function recordFollowUpOutcome(listId: string, employerToken: string, outcome: "feedback" | "reminder" | "skipped"): Promise<void> {
  await db.insert(releaseFollowUps).values({ listId, employerToken, outcome }).onConflictDoNothing()
}
