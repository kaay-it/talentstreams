import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { verifyAccessToken } from "@/lib/mcp-oauth"
import { searchCandidates, getCandidateById, getDistinctLevels, type CandidateStatus } from "@/lib/db/candidates"
import { getResumeVersions } from "@/lib/db/resumes"
import { getStreams } from "@/lib/db/streams"
import { resolveBlobUrl } from "@/lib/blob"
import { fetchResumeBlobBytes } from "@/lib/resume-blob"
import { loadCandidateSummaryGuideTemplate, fillCandidateSummaryGuide, loadGuideTemplate } from "@/lib/mcp/guide"
import {
  approveCandidateWorkflow,
  rejectCandidateWorkflow,
  pauseCandidateWorkflow,
  updateCandidateWorkflow,
  type UpdateCandidateData,
} from "@/lib/candidate-workflows"

export const dynamic = "force-dynamic"

const CANDIDATE_STATUSES = ["На проверке", "Активный", "Отклонён", "Не публиковать"] as const

const SERVER_INSTRUCTIONS = `TalentStreams MCP.
- Перед написанием или правкой summary кандидата вызови get_summary_guide и следуй ему.
- Никогда не вызывай update_candidate без явного подтверждения пользователя: сначала покажи черновик на ревью.
- approve_candidate / reject_candidate / pause_candidate — только по прямой просьбе пользователя.
- search_candidates возвращает страницы; при большом total сужай фильтры или листай offset.
- Перед скринингом или отсевом кандидатов вызови get_screening_guide и следуй ему.
- Результат скрининга — только рекомендация на ревью; reject/approve/pause — только после явного подтверждения пользователя по конкретным кандидатам.`

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] }
}

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true }
}

/** Drops "" and [] values so a compact JSON item doesn't carry empty keys — used only for
 * search_candidates' short cards, where response size is the whole point (TASK-65). */
function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === "") continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key as keyof T] = value as T[keyof T]
  }
  return out
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
  const server = new McpServer({ name: "talentstreams-candidates", version: "1.0.0" }, { instructions: SERVER_INSTRUCTIONS })

  server.registerTool(
    "ping",
    { title: "Ping", description: "Connectivity check — replies with pong.", annotations: { readOnlyHint: true } },
    async () => textResult("pong"),
  )

  server.registerTool(
    "search_candidates",
    {
      title: "Search candidates",
      description:
        "Searches candidates by name/email/phone substring, status, stream, level, registration date range, or missing summary. " +
        "Paginated: returns {total, limit, offset, items} with short cards (max 50 per page, default 20) — call get_candidate(id) for full details on one candidate.",
      annotations: { readOnlyHint: true },
      inputSchema: {
        query: z.string().optional().describe("Substring match against name, email, phone"),
        status: z.enum(CANDIDATE_STATUSES).optional(),
        stream: z.string().optional(),
        level: z.string().optional(),
        registeredFrom: z.string().optional().describe("ISO date YYYY-MM-DD, inclusive"),
        registeredTo: z.string().optional().describe("ISO date YYYY-MM-DD, inclusive"),
        summaryEmpty: z.boolean().optional().describe("Only candidates with no summary written yet"),
        limit: z.number().int().min(1).max(50).default(20).describe("Page size, max 50"),
        offset: z.number().int().min(0).default(0).describe("Items to skip, for paging through a large total"),
      },
    },
    async (args) => {
      const result = await searchCandidates({ ...args, status: args.status as CandidateStatus | undefined })
      const compact = {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        items: result.items.map(omitEmpty),
      }
      return textResult(JSON.stringify(compact))
    },
  )

  server.registerTool(
    "get_candidate",
    {
      title: "Get candidate",
      description: "Full details for one candidate by id.",
      annotations: { readOnlyHint: true },
      inputSchema: { id: z.string() },
    },
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
      annotations: { destructiveHint: true },
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
      annotations: { destructiveHint: true },
      inputSchema: { id: z.string(), activeSince: z.string().optional().describe("ru-RU date; leave empty to default to today if not already set") },
    },
    async ({ id, activeSince }) => {
      await approveCandidateWorkflow(id, activeSince)
      return textResult(`Кандидат ${id} подтверждён.`)
    },
  )

  server.registerTool(
    "reject_candidate",
    {
      title: "Reject candidate",
      description: "Rejects a candidate and removes them from the SendPulse \"Candidates\" book.",
      annotations: { destructiveHint: true },
      inputSchema: { id: z.string() },
    },
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
      annotations: { destructiveHint: true },
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
      annotations: { readOnlyHint: true },
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
      annotations: { readOnlyHint: true },
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

  server.registerTool(
    "get_summary_guide",
    {
      title: "Get candidate summary guide",
      description: "Формат, правила и эталоны саммари кандидата. Вызывать перед написанием или правкой summary.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const template = loadCandidateSummaryGuideTemplate()
      if (!template) return errorResult("Гайд по саммари недоступен на сервере — файл не найден в развёрнутом приложении.")
      const [streams, levels] = await Promise.all([getStreams(), getDistinctLevels()])
      return textResult(fillCandidateSummaryGuide(template, streams, levels))
    },
  )

  server.registerPrompt(
    "candidate_summary",
    {
      title: "Candidate summary",
      description: "Написать саммари кандидата по гайду, показать черновик на ревью и сохранить только после подтверждения.",
      argsSchema: { candidateId: z.string() },
    },
    async ({ candidateId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Напиши саммари для кандидата ${candidateId}. Сначала вызови get_summary_guide и следуй ему: ` +
              `get_candidate(${candidateId}), затем list_candidate_resumes/get_candidate_resume для резюме. ` +
              `Покажи черновик саммари и предлагаемые значения title/stream/level (если они сейчас пустые) пользователю на ревью. ` +
              `Не вызывай update_candidate, пока пользователь явно не подтвердит черновик — после правок по комментариям снова покажи на ревью перед сохранением.`,
          },
        },
      ],
    }),
  )

  server.registerTool(
    "get_screening_guide",
    {
      title: "Get candidate screening guide",
      description: 'Критерии отсева, формат отчёта и правила скрининга кандидатов. Вызывать перед проверкой/отсевом кандидатов или разбором очереди "На проверке".',
      annotations: { readOnlyHint: true },
    },
    async () => {
      const template = loadGuideTemplate("candidate-screening")
      if (!template) return errorResult("Гайд по скринингу недоступен на сервере — файл не найден в развёрнутом приложении.")
      return textResult(template)
    },
  )

  server.registerPrompt(
    "candidate_screening",
    {
      title: "Candidate screening",
      description: "Проверить одного кандидата или пакет из очереди «На проверке» по гайду скрининга, показать результат на ревью — ничего не менять в базе.",
      argsSchema: { candidateId: z.string().optional() },
    },
    async ({ candidateId }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: candidateId
              ? `Проверь кандидата ${candidateId} по гайду скрининга. Сначала вызови get_screening_guide и следуй ему, затем get_candidate(${candidateId}), list_candidate_resumes/get_candidate_resume для резюме. Покажи результат по формату гайда на ревью. Ничего не меняй в базе — reject_candidate/approve_candidate/pause_candidate только после явного подтверждения пользователя.`
              : `Пройди скрининг первой страницы кандидатов со статусом "На проверке". Сначала вызови get_screening_guide и следуй ему, затем search_candidates(status: "На проверке") за первую страницу; для каждого кандидата — get_candidate и резюме (list_candidate_resumes/get_candidate_resume), проверка по критериям гайда. Покажи пакетный отчёт (сводная таблица + детали по «рекомендую отклонить» и «нужна ручная проверка») на ревью. Ничего не меняй в базе — reject_candidate/approve_candidate/pause_candidate только после явного подтверждения пользователя по конкретным кандидатам.`,
          },
        },
      ],
    }),
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
