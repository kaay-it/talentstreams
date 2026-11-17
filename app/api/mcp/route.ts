import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { verifyAccessToken } from "@/lib/mcp-oauth"
import { searchCandidates, getCandidateById, type CandidateStatus } from "@/lib/db/candidates"
import { getResumeVersions } from "@/lib/db/resumes"
import { resolveBlobUrl } from "@/lib/blob"
import { fetchResumeBlobBytes } from "@/lib/resume-blob"
import {
  approveCandidateWorkflow,
  rejectCandidateWorkflow,
  pauseCandidateWorkflow,
  updateCandidateWorkflow,
  type UpdateCandidateData,
} from "@/lib/candidate-workflows"

export const dynamic = "force-dynamic"

const CANDIDATE_STATUSES = ["На проверке", "Активный", "Отклонён", "Не публиковать"] as const

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true }
}

/**
 * Builds a fresh MCP server with every candidate tool (TASK-64) — called once per request
 * (stateless transport, see WebStandardStreamableHTTPServerTransport's own doc comment: a
 * stateless transport instance can't be reused across requests, so neither can the server
 * connected to it). Tools call straight into lib/db/candidates.ts / lib/candidate-workflows.ts —
 * the same functions the editor's Server Actions call, minus requireEditorAuth() (this route
 * gates access its own way, via the OAuth bearer token checked in the handler below).
 */
function buildMcpServer(): McpServer {
  const server = new McpServer({ name: "talentstreams-candidates", version: "1.0.0" })

  server.registerTool(
    "ping",
    { title: "Ping", description: "Connectivity check — replies with pong." },
    async () => textResult("pong"),
  )

  server.registerTool(
    "search_candidates",
    {
      title: "Search candidates",
      description: "Searches candidates by name/email/phone substring, status, stream, level, registration date range, or missing summary.",
      inputSchema: {
        query: z.string().optional().describe("Substring match against name, email, phone"),
        status: z.enum(CANDIDATE_STATUSES).optional(),
        stream: z.string().optional(),
        level: z.string().optional(),
        registeredFrom: z.string().optional().describe("ISO date YYYY-MM-DD, inclusive"),
        registeredTo: z.string().optional().describe("ISO date YYYY-MM-DD, inclusive"),
        summaryEmpty: z.boolean().optional().describe("Only candidates with no summary written yet"),
      },
    },
    async (args) => {
      const results = await searchCandidates({ ...args, status: args.status as CandidateStatus | undefined })
      return textResult(JSON.stringify(results, null, 2))
    },
  )

  server.registerTool(
    "get_candidate",
    { title: "Get candidate", description: "Full details for one candidate by id.", inputSchema: { id: z.string() } },
    async ({ id }) => {
      const candidate = await getCandidateById(id)
      if (!candidate) return errorResult(`Кандидат с id=${id} не найден.`)
      return textResult(JSON.stringify(candidate, null, 2))
    },
  )

  server.registerTool(
    "update_candidate",
    {
      title: "Update candidate",
      description: "Updates one or more fields of a candidate. Omitted fields keep their current value. Does not change status — use approve_candidate/reject_candidate/pause_candidate for that.",
      inputSchema: {
        id: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        coverLetter: z.string().optional(),
        stream: z.array(z.string()).optional(),
        level: z.string().optional(),
        countryPrimary: z.string().optional(),
        countryDesired: z.string().optional(),
        activeSince: z.string().optional().describe("ru-RU date, e.g. 21.07.2026, or empty string to clear"),
        title: z.string().optional(),
        summary: z.string().optional(),
        excludedCompanies: z.array(z.string()).optional(),
        excludedStreams: z.array(z.string()).optional(),
      },
    },
    async ({ id, ...patch }) => {
      const existing = await getCandidateById(id)
      if (!existing) return errorResult(`Кандидат с id=${id} не найден.`)

      const merged: UpdateCandidateData = {
        candidateId: id,
        resumeUrl: "",
        resumeVersionChanged: false,
        name: patch.name ?? existing.name,
        email: patch.email ?? existing.email,
        phone: patch.phone ?? existing.phone,
        coverLetter: patch.coverLetter ?? existing.coverLetter,
        stream: patch.stream ?? existing.stream,
        level: patch.level ?? existing.level,
        countryPrimary: patch.countryPrimary ?? existing.countryPrimary,
        countryDesired: patch.countryDesired ?? existing.countryDesired,
        activeSince: patch.activeSince ?? existing.activeSince,
        title: patch.title ?? existing.title,
        summary: patch.summary ?? existing.summary,
        excludedCompanies: patch.excludedCompanies ?? existing.excludedCompanies,
        excludedStreams: patch.excludedStreams ?? existing.excludedStreams,
      }

      const result = await updateCandidateWorkflow(id, merged)
      if (!result.ok) return errorResult(result.error)
      return textResult(`Кандидат ${merged.name} обновлён.`)
    },
  )

  server.registerTool(
    "approve_candidate",
    {
      title: "Approve candidate",
      description: "Confirms a candidate (status → Активный) and syncs them to the SendPulse \"Candidates\" book.",
      inputSchema: { id: z.string(), activeSince: z.string().optional().describe("ru-RU date; leave empty to default to today if not already set") },
    },
    async ({ id, activeSince }) => {
      await approveCandidateWorkflow(id, activeSince)
      return textResult(`Кандидат ${id} подтверждён.`)
    },
  )

  server.registerTool(
    "reject_candidate",
    { title: "Reject candidate", description: "Rejects a candidate and removes them from the SendPulse \"Candidates\" book.", inputSchema: { id: z.string() } },
    async ({ id }) => {
      await rejectCandidateWorkflow(id)
      return textResult(`Кандидат ${id} отклонён.`)
    },
  )

  server.registerTool(
    "pause_candidate",
    {
      title: "Pause candidate",
      description: "Manually pauses a candidate (status → Не публиковать) without rejecting them — stays in SendPulse/digest.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      await pauseCandidateWorkflow(id)
      return textResult(`Кандидат ${id} поставлен на паузу.`)
    },
  )

  server.registerTool(
    "list_candidate_resumes",
    {
      title: "List candidate resumes",
      description: "Metadata for every resume version a candidate has (file or link), newest first — no file content.",
      inputSchema: { candidateId: z.string() },
    },
    async ({ candidateId }) => {
      const versions = await getResumeVersions(candidateId)
      return textResult(JSON.stringify(versions, null, 2))
    },
  )

  server.registerTool(
    "get_candidate_resume",
    {
      title: "Get candidate resume",
      description: "Returns a candidate's resume for summarization: a link version comes back as plain text (the URL), a file version comes back as the actual embedded file content.",
      inputSchema: { candidateId: z.string(), versionId: z.string().optional().describe("Defaults to the newest version") },
    },
    async ({ candidateId, versionId }) => {
      const versions = await getResumeVersions(candidateId)
      if (versions.length === 0) return textResult("У кандидата нет резюме.")
      const version = versionId ? versions.find((v) => v.id === versionId) : versions[0]
      if (!version) return errorResult(`Версия резюме versionId=${versionId} не найдена.`)

      if (version.kind === "link") {
        return textResult(`Ссылка на резюме${version.filename ? ` (${version.filename})` : ""}: ${version.url}`)
      }

      const blobUrl = resolveBlobUrl(version.url)
      if (!blobUrl) return errorResult("Не удалось определить файл резюме по сохранённому URL.")
      const file = await fetchResumeBlobBytes(blobUrl)
      if (!file) return errorResult("Не удалось загрузить файл резюме из хранилища.")

      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              uri: version.url,
              mimeType: file.contentType,
              blob: Buffer.from(file.bytes).toString("base64"),
            },
          },
        ],
      }
    },
  )

  return server
}

async function handleMcpRequest(req: NextRequest): Promise<Response> {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""

  if (!token || !(await verifyAccessToken(token))) {
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: { "WWW-Authenticate": `Bearer resource_metadata="${appUrl}/.well-known/oauth-protected-resource"` },
      },
    )
  }

  // Stateless mode: a fresh transport + server per request (the transport itself refuses to be
  // reused — see WebStandardStreamableHTTPServerTransport.handleRequest()).
  const transport = new WebStandardStreamableHTTPServerTransport()
  const server = buildMcpServer()
  await server.connect(transport)
  return transport.handleRequest(req)
}

export const GET = handleMcpRequest
export const POST = handleMcpRequest
export const DELETE = handleMcpRequest
