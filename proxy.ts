import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { signEditorSession, EDITOR_SESSION_COOKIE_NAME, EDITOR_TOKEN_HEADER_NAME } from "@/lib/auth"

export async function proxy(request: NextRequest) {
  const editorSecret = process.env.EDITOR_SECRET
  const secretParam = request.nextUrl.searchParams.get("secret")

  if (editorSecret && secretParam === editorSecret) {
    // Пробрасываем заголовок на ТЕКУЩИЙ запрос — SSR-чтения на этой же странице видят его сразу,
    // кука ниже долетит до браузера только со следующего запроса.
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set(EDITOR_TOKEN_HEADER_NAME, editorSecret)
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    response.cookies.set(EDITOR_SESSION_COOKIE_NAME, await signEditorSession(), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    })
    return response
  }

  return NextResponse.next()
}

export const config = { matcher: ["/editor/:path*"] }
