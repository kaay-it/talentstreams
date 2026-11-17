import { NextRequest, NextResponse } from "next/server"
import { registerClient } from "@/lib/mcp-oauth"

/** Dynamic Client Registration (RFC 7591) — intentionally open, no auth check: a client_id by
 * itself grants nothing, real access still requires the EDITOR_SECRET login at
 * /api/oauth/authorize. This is the standard trust model for DCR (same as e.g. big OAuth
 * providers' public DCR endpoints). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { client_name?: string; redirect_uris?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "Body must be JSON" }, { status: 400 })
  }

  try {
    const client = await registerClient(body.client_name, body.redirect_uris ?? [])
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      { status: 201 },
    )
  } catch (err) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: String((err as Error).message) }, { status: 400 })
  }
}
