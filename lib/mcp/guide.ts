import "server-only"
import { readFileSync } from "fs"
import path from "path"

const GUIDE_PATH = path.join(process.cwd(), "lib/mcp/guides/candidate-summary.md")

let cachedTemplate: string | null = null

/**
 * Loads lib/mcp/guides/candidate-summary.md once per warm serverless instance — a module-level
 * cache, since the content never changes between requests and the MCP route builds a fresh
 * McpServer per request (stateless transport) that would otherwise re-read the file every call.
 *
 * Explicitly traced into the Vercel bundle via next.config.mjs's `outputFileTracingIncludes` —
 * a plain fs.readFileSync() built from a process.cwd() path isn't guaranteed to be picked up by
 * Next's automatic static file tracing (it only reliably detects literal string arguments).
 * Returns null (never throws) if the file is missing from the bundle for any reason — the
 * get_summary_guide tool turns that into a clear tool-level error instead of a 500.
 */
export function loadCandidateSummaryGuideTemplate(): string | null {
  if (cachedTemplate !== null) return cachedTemplate
  try {
    cachedTemplate = readFileSync(GUIDE_PATH, "utf-8")
    return cachedTemplate
  } catch (err) {
    console.error("[MCP] failed to read candidate-summary guide:", err)
    return null
  }
}

/** Fills the guide's {{STREAMS}}/{{LEVELS}} placeholders with the app's real, current values —
 * callers fetch those from the same source the rest of the app uses (getStreams() for streams;
 * getDistinctLevels() for level, which has no fixed enum anywhere in TalentStreams). */
export function fillCandidateSummaryGuide(template: string, streams: string[], levels: string[]): string {
  return template.replace("{{STREAMS}}", streams.join(", ")).replace("{{LEVELS}}", levels.join(", "))
}
