import "server-only"
import { desc } from "drizzle-orm"
import { db } from "./index"
import { candidateDigestRuns } from "./schema"
import { getBooleanSetting, setSetting } from "./settings"

const AUTO_SEND_SETTING = "candidateDigestAutoSendEnabled"

export type DigestRun = {
  id: number
  startedAt: string
  triggeredBy: "cron" | "manual"
  candidatesTotal: number
  candidatesPrepared: number
  candidatesFailed: number
  campaignId: number | null
}

function toDigestRun(row: typeof candidateDigestRuns.$inferSelect): DigestRun {
  return {
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    triggeredBy: row.triggeredBy as "cron" | "manual",
    candidatesTotal: row.candidatesTotal,
    candidatesPrepared: row.candidatesPrepared,
    candidatesFailed: row.candidatesFailed,
    campaignId: row.campaignId,
  }
}

export async function getCandidateDigestSettings(): Promise<{ autoSendEnabled: boolean }> {
  return { autoSendEnabled: await getBooleanSetting(AUTO_SEND_SETTING, true) }
}

export async function setCandidateDigestAutoSend(enabled: boolean): Promise<void> {
  await setSetting(AUTO_SEND_SETTING, "boolean", String(enabled))
}

/** Most recent runs first — cron and manual alike. */
export async function getCandidateDigestRuns(): Promise<DigestRun[]> {
  const rows = await db.select().from(candidateDigestRuns).orderBy(desc(candidateDigestRuns.startedAt))
  return rows.map(toDigestRun)
}

export async function recordCandidateDigestRun(data: {
  triggeredBy: "cron" | "manual"
  candidatesTotal: number
  candidatesPrepared: number
  candidatesFailed: number
  campaignId: number | null
}): Promise<DigestRun> {
  const [row] = await db.insert(candidateDigestRuns).values(data).returning()
  return toDigestRun(row)
}
