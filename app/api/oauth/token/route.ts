import { NextRequest, NextResponse } from "next/server"
import { redeemAuthorizationCode, refreshAccessToken } from "@/lib/mcp-oauth"

function invalidGrant(description: string): NextResponse {
  return NextResponse.json({ error: "invalid_grant", error_description: description }, { status: 400 })
}

function tokenResponse(tokens: { accessToken: string; refreshToken: string; expiresIn: number }): NextResponse {
  return NextResponse.json({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
  })
}

/** Token endpoint — both grants a public (no client secret) MCP client needs: exchanging a
 * freshly-authorized code for tokens, and later refreshing them (TASK-64). Body is standard
 * OAuth form-encoding, not JSON. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData()
  const grantType = String(form.get("grant_type") ?? "")
  const clientId = String(form.get("client_id") ?? "")

  if (grantType === "authorization_code") {
    const code = String(form.get("code") ?? "")
    const redirectUri = String(form.get("redirect_uri") ?? "")
    const codeVerifier = String(form.get("code_verifier") ?? "")
    if (!code || !clientId || !redirectUri || !codeVerifier) return invalidGrant("Missing required parameters")

    const tokens = await redeemAuthorizationCode({ code, clientId, redirectUri, codeVerifier })
    if (!tokens) return invalidGrant("Authorization code is invalid, expired, or already used")
    return tokenResponse(tokens)
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") ?? "")
    if (!refreshToken || !clientId) return invalidGrant("Missing required parameters")

    const tokens = await refreshAccessToken({ refreshToken, clientId })
    if (!tokens) return invalidGrant("Refresh token is invalid or expired")
    return tokenResponse(tokens)
  }

  return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 })
}
