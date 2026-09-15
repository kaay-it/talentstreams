import "server-only"
import { desc, eq, inArray } from "drizzle-orm"
import { db } from "./index"
import { candidateResumes } from "./schema"
import { blobFilenameFromUrl } from "../blob"

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
  /** Backdate the entry (backfill only) — defaults to now for real-time writes. */
  createdAt?: Date
}): Promise<void> {
  if (!data.candidateId || !data.url) return
  const filename = data.filename || (data.kind === "file" ? blobFilenameFromUrl(data.url) : "")
  await db.insert(candidateResumes).values({
    candidateId: data.candidateId,
    kind: data.kind,
    filename,
    url: data.url,
    ...(data.createdAt && { createdAt: data.createdAt }),
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

/** Deletes every resume version row for a candidate (used when the candidate itself is deleted). */
export async function deleteResumeVersions(candidateId: string): Promise<void> {
  if (!candidateId) return
  await db.delete(candidateResumes).where(eq(candidateResumes.candidateId, candidateId))
}

/** Deletes a single resume version row (used when the editor removes one file/link from the history list). */
export async function deleteResumeVersion(id: string): Promise<void> {
  await db.delete(candidateResumes).where(eq(candidateResumes.id, id))
}

/**
 * Resume versions for many candidates at once, grouped by candidateId (each group newest
 * first) — one query instead of one-per-candidate, for list pages showing several candidates.
 */
export async function getResumeVersionsForCandidates(
  candidateIds: string[],
): Promise<Record<string, ResumeVersion[]>> {
  const ids = [...new Set(candidateIds.filter(Boolean))]
  if (!ids.length) return {}

  const rows = await db
    .select()
    .from(candidateResumes)
    .where(inArray(candidateResumes.candidateId, ids))
    .orderBy(desc(candidateResumes.createdAt))

  const grouped: Record<string, ResumeVersion[]> = {}
  for (const r of rows) {
    const version: ResumeVersion = {
      id: r.id,
      candidateId: r.candidateId,
      kind: r.kind as ResumeVersionKind,
      filename: r.filename,
      url: r.url,
      createdAt: r.createdAt.toISOString(),
    }
    ;(grouped[r.candidateId] ??= []).push(version)
  }
  return grouped
}
