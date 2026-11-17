import { NextRequest, NextResponse } from "next/server"
import { getClient, createAuthorizationCode, deleteExpiredCodes } from "@/lib/mcp-oauth"

type AuthParams = {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
  codeChallengeMethod: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function errorPage(message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>TalentStreams — ошибка</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;color:#1a1a1a">` +
      `<h1 style="font-size:18px">Не удалось выполнить вход</h1><p>${escapeHtml(message)}</p></body></html>`,
    { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  )
}

function loginPage(params: AuthParams, clientName: string | null, errorMessage?: string): NextResponse {
  const requireSecret = !!process.env.EDITOR_SECRET
  const hidden = [
    ["client_id", params.clientId],
    ["redirect_uri", params.redirectUri],
    ["state", params.state],
    ["code_challenge", params.codeChallenge],
    ["code_challenge_method", params.codeChallengeMethod],
  ]
    .map(([name, value]) => `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`)
    .join("")

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>TalentStreams — доступ MCP</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:420px;margin:80px auto 0;padding:0 20px;color:#1a1a1a">
  <h1 style="font-size:20px;margin-bottom:4px">TalentStreams</h1>
  <p style="color:#555;margin-top:0">${clientName ? escapeHtml(clientName) : "ИИ-ассистент"} запрашивает доступ к правке кандидатов.</p>
  ${errorMessage ? `<p style="color:#b00020;font-size:14px">${escapeHtml(errorMessage)}</p>` : ""}
  <form method="post">
    ${hidden}
    ${
      requireSecret
        ? `<label style="display:block;font-size:14px;margin-bottom:6px">Код доступа редактора</label>
           <input type="password" name="secret" autofocus required style="width:100%;padding:8px;font-size:14px;box-sizing:border-box;border:1px solid #ccc;border-radius:6px">`
        : `<p style="font-size:13px;color:#888">EDITOR_SECRET не задан — вход открыт без проверки.</p>`
    }
    <button type="submit" style="margin-top:14px;padding:8px 16px;font-size:14px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer">Войти</button>
  </form>
</body></html>`

  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } })
}

async function parseAndValidate(searchParams: URLSearchParams): Promise<{ params: AuthParams; clientName: string | null } | NextResponse> {
  const clientId = searchParams.get("client_id") ?? ""
  const redirectUri = searchParams.get("redirect_uri") ?? ""
  const state = searchParams.get("state") ?? ""
  const codeChallenge = searchParams.get("code_challenge") ?? ""
  const codeChallengeMethod = searchParams.get("code_challenge_method") ?? ""
  const responseType = searchParams.get("response_type") ?? ""

  if (responseType !== "code") return errorPage("Поддерживается только response_type=code.")
  if (!clientId || !redirectUri || !codeChallenge) return errorPage("Запрос авторизации неполный.")
  if (codeChallengeMethod !== "S256") return errorPage("Поддерживается только code_challenge_method=S256.")

  // Invalid client_id/redirect_uri must show an error directly, never redirect to an
  // unvalidated URI — that redirect is exactly the open-redirect vulnerability PKCE/OAuth
  // registration is meant to prevent.
  const client = await getClient(clientId)
  if (!client) return errorPage("Неизвестный client_id.")
  if (!client.redirectUris.includes(redirectUri)) return errorPage("redirect_uri не совпадает с зарегистрированным для этого клиента.")

  return { params: { clientId, redirectUri, state, codeChallenge, codeChallengeMethod }, clientName: client.clientName }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  void deleteExpiredCodes().catch(() => {})
  const result = await parseAndValidate(req.nextUrl.searchParams)
  if (result instanceof NextResponse) return result
  return loginPage(result.params, result.clientName)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData()
  const params: AuthParams = {
    clientId: String(form.get("client_id") ?? ""),
    redirectUri: String(form.get("redirect_uri") ?? ""),
    state: String(form.get("state") ?? ""),
    codeChallenge: String(form.get("code_challenge") ?? ""),
    codeChallengeMethod: String(form.get("code_challenge_method") ?? ""),
  }

  // Re-validate independently of what the (client-controlled) hidden fields claim.
  const revalidated = await parseAndValidate(new URLSearchParams({ ...params, response_type: "code" }))
  if (revalidated instanceof NextResponse) return revalidated

  const editorSecret = process.env.EDITOR_SECRET
  const submittedSecret = String(form.get("secret") ?? "")
  if (editorSecret && submittedSecret !== editorSecret) {
    return loginPage(revalidated.params, revalidated.clientName, "Неверный код доступа.")
  }

  const code = await createAuthorizationCode({
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
  })

  const redirectTarget = new URL(params.redirectUri)
  redirectTarget.searchParams.set("code", code)
  if (params.state) redirectTarget.searchParams.set("state", params.state)
  return NextResponse.redirect(redirectTarget.toString(), 302)
}
