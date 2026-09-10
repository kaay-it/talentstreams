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
