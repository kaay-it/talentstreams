// One-off backfill: fills candidateResumes (TASK-32) from the existing resumeUrl column in
// Sheets, for candidates who already had a resume before the version-history feature shipped.
// Idempotent — safe to re-run, skips any (candidateId, url) pair already recorded.
//
// Run with: NODE_OPTIONS="--conditions=react-server" npx tsx scripts/backfill-resume-history.ts
// (the react-server condition is needed so the "server-only" import in lib/sheets.ts /
// lib/db/resumes.ts resolves to its no-op stub instead of throwing under plain Node.)
import { config } from "dotenv"

config({ path: ".env.local" })
config({ path: ".env" })

async function main() {
  const { getCandidates } = await import("../lib/sheets")
  const { addResumeVersion, getResumeVersions } = await import("../lib/db/resumes")
  const { isOwnFileUrl } = await import("../lib/blob")

  const candidates = await getCandidates()

  let inserted = 0
  let skippedNoId = 0
  let skippedNoResume = 0
  let skippedAlready = 0

  for (const c of candidates) {
    if (!c.id) {
      skippedNoId++
      continue
    }
    if (!c.resumeUrl) {
      skippedNoResume++
      continue
    }

    const existing = await getResumeVersions(c.id)
    if (existing.some((v) => v.url === c.resumeUrl)) {
      skippedAlready++
      continue
    }

    const parsedTimestamp = c.timestamp ? new Date(c.timestamp) : null
    const createdAt = parsedTimestamp && !isNaN(parsedTimestamp.getTime()) ? parsedTimestamp : undefined

    await addResumeVersion({
      candidateId: c.id,
      kind: isOwnFileUrl(c.resumeUrl) ? "file" : "link",
      url: c.resumeUrl,
      createdAt,
    })
    inserted++
  }

  console.log("Backfill complete:", {
    totalCandidates: candidates.length,
    inserted,
    skippedNoId,
    skippedNoResume,
    skippedAlready,
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
