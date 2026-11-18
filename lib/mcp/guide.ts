import "server-only"
import { readFileSync } from "fs"
import path from "path"

export type GuideName = "candidate-summary" | "candidate-screening"

const cache = new Map<GuideName, string>()

/**
 * Loads lib/mcp/guides/<name>.md once per warm serverless instance — a module-level cache (one
 * entry per guide), since each file's content never changes between requests and the MCP route
 * builds a fresh McpServer per request (stateless transport) that would otherwise re-read it
 * every call.
 *
 * Explicitly traced into the Vercel bundle via next.config.mjs's `outputFileTracingIncludes`
 * (a glob over the whole lib/mcp/guides/ folder, so every guide added there is covered without
 * touching next.config.mjs again) — a plain fs.readFileSync() built from a process.cwd() path
 * isn't guaranteed to be picked up by Next's automatic static file tracing (it only reliably
 * detects literal string arguments). Returns null (never throws) if a file is missing from the
 * bundle for any reason — callers turn that into a clear tool-level error instead of a 500.
 */
export function loadGuideTemplate(name: GuideName): string | null {
  const cached = cache.get(name)
  if (cached !== undefined) return cached
  try {
    const content = readFileSync(path.join(process.cwd(), "lib/mcp/guides", `${name}.md`), "utf-8")
    cache.set(name, content)
    return content
  } catch (err) {
    console.error(`[MCP] failed to read "${name}" guide:`, err)
    return null
  }
}

/** Thin alias kept so get_summary_guide's call site and behavior don't change. */
export function loadCandidateSummaryGuideTemplate(): string | null {
  return loadGuideTemplate("candidate-summary")
}

/** Fills the guide's {{STREAMS}}/{{LEVELS}} placeholders with the app's real, current values —
 * callers fetch those from the same source the rest of the app uses (getStreams() for streams;
 * getDistinctLevels() for level, which has no fixed enum anywhere in TalentStreams). */
export function fillCandidateSummaryGuide(template: string, streams: string[], levels: string[]): string {
  return template.replace("{{STREAMS}}", streams.join(", ")).replace("{{LEVELS}}", levels.join(", "))
}
