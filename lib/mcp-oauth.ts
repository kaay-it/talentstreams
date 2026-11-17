import "server-only"
import { createHash } from "crypto"
import { and, eq, gt, lt } from "drizzle-orm"
import { db } from "./db"
import { mcpOauthClients, mcpOauthCodes, mcpOauthTokens } from "./db/schema"

const CODE_TTL_MS = 5 * 60 * 1000
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000

export type McpOauthClient = {
  clientId: string
  clientName: string | null
  redirectUris: string[]
}

function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri)
    return parsed.protocol === "https:" || parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost"
  } catch {
    return false
  }
}

/** Dynamic Client Registration (RFC 7591) — open registration, no auth: the client_id this
 * hands out is not itself sensitive, actual access still requires the EDITOR_SECRET login at
 * /api/oauth/authorize. Throws on invalid input (route handler turns that into a 400). */
export async function registerClient(clientName: string | undefined, redirectUris: string[]): Promise<McpOauthClient> {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new Error("redirect_uris must be a non-empty array")
  }
  if (!redirectUris.every(isValidRedirectUri)) {
    throw new Error("redirect_uris must be https:// (or a loopback) URLs")
  }
  const [row] = await db
    .insert(mcpOauthClients)
    .values({ clientName: clientName?.trim() || null, redirectUris })
    .returning({ clientId: mcpOauthClients.clientId, clientName: mcpOauthClients.clientName, redirectUris: mcpOauthClients.redirectUris })
  return row
}

export async function getClient(clientId: string): Promise<McpOauthClient | null> {
  if (!clientId) return null
  const [row] = await db
    .select({ clientId: mcpOauthClients.clientId, clientName: mcpOauthClients.clientName, redirectUris: mcpOauthClients.redirectUris })
    .from(mcpOauthClients)
    .where(eq(mcpOauthClients.clientId, clientId))
  return row ?? null
}

/** Creates a one-time authorization code after the manager has already authenticated with
 * EDITOR_SECRET on the login screen (app/api/oauth/authorize/route.ts) — this function itself
 * does not check that secret, it only enforces that the redirect_uri is one this exact client
 * registered (the actual anti-hijack check) and that PKCE uses S256. */
export async function createAuthorizationCode(params: {
  clientId: string
  redirectUri: string
  codeChallenge: string
  codeChallengeMethod: string
}): Promise<string> {
  const client = await getClient(params.clientId)
  if (!client) throw new Error("Unknown client_id")
  if (!client.redirectUris.includes(params.redirectUri)) throw new Error("redirect_uri does not match registration")
  if (params.codeChallengeMethod !== "S256") throw new Error("Only S256 code_challenge_method is supported")

  const [row] = await db
    .insert(mcpOauthCodes)
    .values({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    })
    .returning({ code: mcpOauthCodes.code })
  return row.code
}

function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url")
  return computed === challenge
}

type IssuedTokens = { accessToken: string; refreshToken: string; expiresIn: number }

async function issueTokenPair(clientId: string): Promise<IssuedTokens> {
  const [row] = await db
    .insert(mcpOauthTokens)
    .values({ clientId, expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_MS) })
    .returning({ accessToken: mcpOauthTokens.accessToken, refreshToken: mcpOauthTokens.refreshToken })
  return { accessToken: row.accessToken, refreshToken: row.refreshToken, expiresIn: ACCESS_TOKEN_TTL_MS / 1000 }
}

/** Exchanges a one-time authorization code for a token pair. Returns null for any mismatch
 * (unknown/expired code, wrong client/redirect_uri, failed PKCE) — callers turn that into a
 * generic OAuth `invalid_grant` response, never leaking which check failed. */
export async function redeemAuthorizationCode(params: {
  code: string
  clientId: string
  redirectUri: string
  codeVerifier: string
}): Promise<IssuedTokens | null> {
  const [row] = await db.select().from(mcpOauthCodes).where(eq(mcpOauthCodes.code, params.code))
  if (!row) return null
  await db.delete(mcpOauthCodes).where(eq(mcpOauthCodes.code, params.code)) // single use regardless of outcome

  if (row.expiresAt.getTime() < Date.now()) return null
  if (row.clientId !== params.clientId) return null
  if (row.redirectUri !== params.redirectUri) return null
  if (!pkceMatches(params.codeVerifier, row.codeChallenge)) return null

  return issueTokenPair(params.clientId)
}

/** Rotates a refresh token — the old row is deleted and a fresh pair issued, so a stolen
 * refresh token stops working the moment the legitimate client refreshes again. */
export async function refreshAccessToken(params: { refreshToken: string; clientId: string }): Promise<IssuedTokens | null> {
  const [row] = await db
    .select()
    .from(mcpOauthTokens)
    .where(and(eq(mcpOauthTokens.refreshToken, params.refreshToken), eq(mcpOauthTokens.clientId, params.clientId)))
  if (!row) return null
  await db.delete(mcpOauthTokens).where(eq(mcpOauthTokens.accessToken, row.accessToken))
  return issueTokenPair(params.clientId)
}

/** Whether `token` is a currently-valid access token — called on every /api/mcp request. */
export async function verifyAccessToken(token: string): Promise<boolean> {
  if (!token) return false
  const [row] = await db
    .select({ accessToken: mcpOauthTokens.accessToken })
    .from(mcpOauthTokens)
    .where(and(eq(mcpOauthTokens.accessToken, token), gt(mcpOauthTokens.expiresAt, new Date())))
  return !!row
}

/** Revokes every issued MCP token at once (manager-facing "disconnect everything" button,
 * /editor/settings) — every connected Claude client has to log in again afterwards. Does not
 * touch registered clients, so re-login doesn't require re-registering a connector either. */
export async function revokeAllTokens(): Promise<void> {
  await db.delete(mcpOauthTokens)
}

/** Best-effort cleanup of long-expired codes — called opportunistically from the authorize/token
 * routes rather than a dedicated cron, since volume is tiny (one manager, occasional logins). */
export async function deleteExpiredCodes(): Promise<void> {
  await db.delete(mcpOauthCodes).where(lt(mcpOauthCodes.expiresAt, new Date()))
}
