import "server-only"
import { desc, eq } from "drizzle-orm"
import { db } from "./index"
import { candidateResumes } from "./schema"

export type ResumeVersionKind = "file" | "link"

export type ResumeVersion = {
  id: string
  candidateId: string
  kind: ResumeVersionKind
  filename: string
  url: string
  createdAt: string
}

/** Records a resume version for a candidate — called whenever resumeUrl actually changes (registration or editor). */
export async function addResumeVersion(data: {
  candidateId: string
  kind: ResumeVersionKind
  filename?: string
  url: string
}): Promise<void> {
  if (!data.candidateId || !data.url) return
  await db.insert(candidateResumes).values({
    candidateId: data.candidateId,
    kind: data.kind,
    filename: data.filename ?? "",
    url: data.url,
  })
}

/** All resume versions for a candidate, newest first. */
export async function getResumeVersions(candidateId: string): Promise<ResumeVersion[]> {
  if (!candidateId) return []
  const rows = await db
    .select()
    .from(candidateResumes)
    .where(eq(candidateResumes.candidateId, candidateId))
    .orderBy(desc(candidateResumes.createdAt))

  return rows.map((r) => ({
    id: r.id,
    candidateId: r.candidateId,
    kind: r.kind as ResumeVersionKind,
    filename: r.filename,
    url: r.url,
    createdAt: r.createdAt.toISOString(),
  }))
}
