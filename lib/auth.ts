import "server-only"
import { cookies, headers } from "next/headers"
import { SignJWT, jwtVerify } from "jose"

const COOKIE_NAME = "ts_editor_session"
const HEADER_NAME = "x-editor-token"

function signingKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("SESSION_SECRET не задан в переменных окружения")
  return new TextEncoder().encode(secret)
}

export async function signEditorSession(): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(signingKey())
}

async function verifyEditorSession(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, signingKey(), { algorithms: ["HS256"] })
    return true
  } catch {
    return false
  }
}

/**
 * Первая строка каждого editor-only Server Action в app/actions.ts. Пропускает при валидной
 * куке (браузер/редактор, выставлена proxy.ts из ?secret=) ИЛИ заголовке x-editor-token,
 * совпадающем с EDITOR_SECRET (curl/сервер-к-серверу, та же конвенция, что была в publish-роуте).
 * Если EDITOR_SECRET не задан вовсе — не гейтит, как и сегодняшние постраничные проверки.
 */
export async function requireEditorAuth(): Promise<void> {
  const editorSecret = process.env.EDITOR_SECRET
  if (!editorSecret) return

  const headerToken = (await headers()).get(HEADER_NAME)
  if (headerToken === editorSecret) return

  const cookie = (await cookies()).get(COOKIE_NAME)?.value
  if (cookie && (await verifyEditorSession(cookie))) return

  throw new Error("Unauthorized")
}

export const EDITOR_SESSION_COOKIE_NAME = COOKIE_NAME
export const EDITOR_TOKEN_HEADER_NAME = HEADER_NAME
