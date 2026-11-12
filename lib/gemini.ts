import "server-only"

const API = "https://generativelanguage.googleapis.com/v1beta"
const MODEL = "models/gemini-embedding-001"
const OUTPUT_DIM = 768
const BATCH_CHUNK_SIZE = 50 // requests per batchEmbedContents call — stays well under free-tier RPM

/** Gates the "Найти дубли" section on /editor/settings — mirrors isSheetsConfigured(). */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

/**
 * Embeds texts in as few batchEmbedContents calls as needed, in input order. Best-effort, never
 * throws: on any failure (missing key, network error, non-2xx, malformed response, quota
 * exhaustion) logs via console.warn and leaves `null` for every text in the failed chunk — never
 * a partial-garbage array, so callers can tell "no embedding" from "zero vector". A failed chunk
 * doesn't stop later chunks from being tried.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) { console.warn("[gemini] GEMINI_API_KEY not set"); return texts.map(() => null) }
  if (texts.length === 0) return []

  const results: (number[] | null)[] = new Array(texts.length).fill(null)
  for (let start = 0; start < texts.length; start += BATCH_CHUNK_SIZE) {
    const chunk = texts.slice(start, start + BATCH_CHUNK_SIZE)
    try {
      const res = await fetch(`${API}/${MODEL}:batchEmbedContents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          requests: chunk.map((text) => ({
            model: MODEL,
            content: { parts: [{ text }] },
            outputDimensionality: OUTPUT_DIM,
          })),
        }),
      })
      if (!res.ok) {
        console.warn(`[gemini] batchEmbedContents status=${res.status}`, await res.text().catch(() => ""))
        continue
      }
      const json = (await res.json()) as { embeddings?: { values: number[] }[] }
      json.embeddings?.forEach((e, i) => { results[start + i] = e.values ?? null })
    } catch (err) {
      console.warn("[gemini] batchEmbedContents failed:", err)
    }
  }
  return results
}
