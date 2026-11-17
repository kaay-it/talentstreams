import { NextResponse } from "next/server"

/** RFC 9728 protected-resource metadata for /api/mcp (TASK-64) — a 401 from that route points
 * here via WWW-Authenticate, and this document points back at our one authorization server. */
export async function GET() {
  const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")
  return NextResponse.json({
    resource: `${appUrl}/api/mcp`,
    authorization_servers: [appUrl],
  })
}
