export const BLOB_HOST = "blob.vercel-storage.com"

/**
 * True if `url` points at our own Vercel Blob storage — either a direct blob URL,
 * or our `/api/resume?url=` proxy wrapping one. Anything else (an external link the
 * candidate typed in) is not "ours".
 */
export function isOwnFileUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.hostname.endsWith(BLOB_HOST)) return true

  if (parsed.pathname === "/api/resume") {
    const inner = parsed.searchParams.get("url")
    if (!inner) return false
    try {
      return new URL(inner).hostname.endsWith(BLOB_HOST)
    } catch {
      return false
    }
  }

  return false
}

/**
 * Best-effort display name for a resume file URL — the blob's own pathname segment
 * (e.g. "1754460447259-a1b2c3d4.pdf"). Not the human filename the candidate originally
 * uploaded — Vercel Blob never stores that separately, only our generated path — but a
 * more honest fallback than a blank field when the real filename wasn't passed through.
 */
export function blobFilenameFromUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return ""
  }

  const inner = parsed.pathname === "/api/resume" ? parsed.searchParams.get("url") : null
  try {
    const target = new URL(inner ?? url)
    return decodeURIComponent(target.pathname.split("/").pop() ?? "")
  } catch {
    return ""
  }
}
