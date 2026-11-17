import "server-only"

/**
 * Fetches a candidate's resume file from Vercel Blob, server-side — same auth as
 * app/api/resume/route.ts (BLOB_READ_WRITE_TOKEN as a bearer header), but buffered into memory
 * instead of streamed, since the caller (the MCP get_candidate_resume tool, TASK-64) needs the
 * whole file to base64-embed it in a tool result, not to pipe it to a browser response. Resumes
 * are small enough (a few hundred KB, rarely more than a couple MB) that buffering is fine.
 * Returns null on any failure — the tool surfaces that as a plain text result, not a thrown error.
 */
export async function fetchResumeBlobBytes(blobUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return null
  try {
    const res = await fetch(blobUrl, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const contentType = res.headers.get("content-type") || "application/octet-stream"
    const bytes = await res.arrayBuffer()
    return { bytes, contentType }
  } catch {
    return null
  }
}
