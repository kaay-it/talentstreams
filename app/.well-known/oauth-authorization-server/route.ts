import { NextResponse } from "next/server"

/** RFC 8414 authorization server metadata — lets Claude Desktop/claude.ai (and any other
 * spec-compliant MCP client) discover how to log into our MCP server (TASK-64) without being
 * told any URL by hand beyond the one /api/mcp endpoint itself. */
export async function GET() {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  return NextResponse.json({
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/api/oauth/authorize`,
    token_endpoint: `${appUrl}/api/oauth/token`,
    registration_endpoint: `${appUrl}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  })
}
