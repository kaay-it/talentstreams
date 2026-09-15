export const BLOB_HOST = "blob.vercel-storage.com"

function tryParseUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * The actual Vercel Blob URL behind `url` — itself if already a direct blob URL, or
 * unwrapped from our `/api/resume?url=` proxy. Returns null if `url` isn't ours at all
 * (an external link the candidate typed in).
 */
export function resolveBlobUrl(url: string): string | null {
  const parsed = tryParseUrl(url)
  if (!parsed) return null

  if (parsed.hostname.endsWith(BLOB_HOST)) return url

  if (parsed.pathname === "/api/resume") {
    const inner = parsed.searchParams.get("url")
    if (!inner) return null
    const innerParsed = tryParseUrl(inner)
    if (innerParsed && innerParsed.hostname.endsWith(BLOB_HOST)) return inner
  }

  return null
}

/** True if `url` points at our own Vercel Blob storage (directly or via the resume proxy). */
export function isOwnFileUrl(url: string): boolean {
  return resolveBlobUrl(url) !== null
}

/**
 * Best-effort display name for a resume file URL — the blob's own pathname segment
 * (e.g. "1754460447259-a1b2c3d4.pdf"). Not the human filename the candidate originally
 * uploaded — Vercel Blob never stores that separately, only our generated path — but a
 * more honest fallback than a blank field when the real filename wasn't passed through.
 */
export function blobFilenameFromUrl(url: string): string {
  const target = resolveBlobUrl(url) ?? url
  const parsed = tryParseUrl(target)
  if (!parsed) return ""
  return decodeURIComponent(parsed.pathname.split("/").pop() ?? "")
}

/**
 * Appends the human filename to an `/api/resume` proxy URL so the browser downloads/saves
 * it under that name instead of the blob's own generated path (e.g. "1754460447259-a1b2c3d4.pdf").
 * No-op for URLs that don't go through our proxy (external links candidates typed in).
 */
export function withDownloadFilename(url: string, filename: string): string {
  if (!filename || resolveBlobUrl(url) === null) return url
  const parsed = tryParseUrl(url)
  if (!parsed || parsed.pathname !== "/api/resume") return url
  parsed.searchParams.set("filename", filename)
  return parsed.toString()
}
