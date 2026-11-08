import "server-only"
import { request } from "node:https"

const API = "https://api.sendpulse.com"

function spRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method,
        headers: body ? { ...headers, "Content-Length": Buffer.byteLength(body) } : headers,
        rejectUnauthorized: false,
      },
      (res) => {
        let text = ""
        res.on("data", (chunk: Buffer) => (text += chunk.toString()))
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }))
      },
    )
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

export const spPost = (url: string, headers: Record<string, string>, body: string) =>
  spRequest("POST", url, headers, body)

export const spGet = (url: string, headers: Record<string, string>) =>
  spRequest("GET", url, headers)

export const spDelete = (url: string, headers: Record<string, string>, body: string) =>
  spRequest("DELETE", url, headers, body)

// ── Token cache ───────────────────────────────────────────────────────────────

let _tokenCache: { value: string; expiresAt: number } | null = null

export async function getToken(): Promise<string | null> {
  const clientId = process.env.SENDPULSE_CLIENT_ID
  const clientSecret = process.env.SENDPULSE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  if (_tokenCache && Date.now() < _tokenCache.expiresAt) return _tokenCache.value

  try {
    const { status, text } = await spPost(
      `${API}/oauth/access_token`,
      { "Content-Type": "application/json" },
      JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    )
    console.log(`[SendPulse] oauth status=${status}`)
    if (status < 200 || status >= 300) return null
    const data = JSON.parse(text) as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    _tokenCache = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    }
    return _tokenCache.value
  } catch (err) {
    console.error("[SendPulse] oauth failed:", err)
    return null
  }
}

// ── Address book cache ────────────────────────────────────────────────────────

type BookEntry = { id: number; emailCount: number }
let _bookCache: Map<string, BookEntry> | null = null
let _bookCacheExpiry = 0

async function loadBookCache(token: string): Promise<void> {
  if (_bookCache && Date.now() < _bookCacheExpiry) return
  const { status, text } = await spGet(
    `${API}/addressbooks?limit=500&offset=0`,
    { Authorization: `Bearer ${token}` },
  )
  if (status >= 200 && status < 300) {
    const books = JSON.parse(text) as Array<{ id: number; name: string; all_email_qty?: number }>
    _bookCache = new Map(books.map((b) => [b.name, { id: b.id, emailCount: b.all_email_qty ?? 0 }]))
    _bookCacheExpiry = Date.now() + 60_000
    console.log(`[SendPulse] loaded ${_bookCache.size} address books`)
  } else {
    console.warn(`[SendPulse] GET /addressbooks status=${status}`, text)
    _bookCache = new Map()
  }
}

export async function getOrCreateBook(name: string, token: string): Promise<number> {
  await loadBookCache(token)

  const existing = _bookCache!.get(name)
  if (existing) return existing.id

  console.log(`[SendPulse] creating address book "${name}"`)
  const { status, text } = await spPost(
    `${API}/addressbooks`,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    JSON.stringify({ bookName: name }),
  )
  if (status < 200 || status >= 300) {
    let message = `Не удалось создать адресную книгу «${name}»`
    try {
      const err = JSON.parse(text) as { error_code?: number; message?: string }
      if (err.error_code === 3030303030) {
        message = `Достигнут лимит адресных книг в SendPulse — обновите тарифный план или удалите неиспользуемые книги`
      }
    } catch { /* ignore */ }
    throw new Error(message)
  }
  const data = JSON.parse(text) as { id: number }
  _bookCache!.set(name, { id: data.id, emailCount: 0 })
  return data.id
}

export async function getBookEmailCount(name: string, token: string): Promise<number> {
  await loadBookCache(token)
  return _bookCache?.get(name)?.emailCount ?? 0
}

/** Look up an address book's id without creating it. Returns null if it doesn't exist. */
export async function getBookId(name: string, token: string): Promise<number | null> {
  await loadBookCache(token)
  return _bookCache?.get(name)?.id ?? null
}

/** Raw list of every address book in the account — bypasses the name-keyed cache (which only
 * ever holds the books some other call has already looked up/created). Used by the
 * cleanup-adhoc-books cron to sweep for throwaway books by naming pattern rather than by
 * cross-referencing a known set of listIds first. */
export async function listAllAddressBooks(token: string): Promise<{ id: number; name: string }[]> {
  try {
    const { status, text } = await spGet(`${API}/addressbooks?limit=500&offset=0`, { Authorization: `Bearer ${token}` })
    if (status < 200 || status >= 300) {
      console.warn(`[SendPulse] GET /addressbooks status=${status}`, text)
      return []
    }
    const books = JSON.parse(text) as Array<{ id: number; name: string }>
    return books.map((b) => ({ id: b.id, name: b.name }))
  } catch (err) {
    console.error("[SendPulse] listAllAddressBooks failed:", err)
    return []
  }
}

/** Permanently deletes a SendPulse address book — tears down the throwaway book built for a
 * narrowed-recipient release send. Best-effort: never throws, just logs, same convention as
 * setTelegramContactState() — cleanup failing must never affect a campaign that already went out. */
export async function deleteAddressBook(bookId: number, token: string): Promise<void> {
  try {
    const { status, text } = await spDelete(`${API}/addressbooks/${bookId}`, { Authorization: `Bearer ${token}` }, "")
    const ok = status >= 200 && status < 300
    if (ok) console.log(`[SendPulse] deleteAddressBook bookId=${bookId} status=${status}`)
    else console.warn(`[SendPulse] deleteAddressBook bookId=${bookId} status=${status}`, text)
    if (_bookCache) {
      for (const [name, entry] of _bookCache) {
        if (entry.id === bookId) {
          _bookCache.delete(name)
          break
        }
      }
    }
  } catch (err) {
    console.error("[SendPulse] deleteAddressBook failed:", err)
  }
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export type Campaign = {
  id: number
  name: string
  status: string
  created?: string
}

/** Raw numeric status of a single campaign straight from SendPulse's campaign-info endpoint — NOT
 * the same field shape as Campaign.status above (that one is typed string but the list endpoint
 * actually returns a number too; this function exists separately for the one value that's been
 * confirmed by direct testing: status 3 means fully processed/delivered — the signal the
 * cleanup-adhoc-books cron needs to know a release's throwaway SendPulse book is safe to delete).
 * Returns null on any failure — callers must treat that as "not yet safe to act on". */
export async function getCampaignStatus(campaignId: number, token: string): Promise<number | null> {
  try {
    const { status, text } = await spGet(`${API}/campaigns/${campaignId}`, { Authorization: `Bearer ${token}` })
    if (status < 200 || status >= 300) {
      console.warn(`[SendPulse] GET /campaigns/${campaignId} status=${status}`, text)
      return null
    }
    const data = JSON.parse(text) as { status?: number }
    return typeof data.status === "number" ? data.status : null
  } catch (err) {
    console.error("[SendPulse] getCampaignStatus failed:", err)
    return null
  }
}

export async function getCampaigns(): Promise<Campaign[]> {
  const token = await getToken()
  if (!token) return []
  try {
    const all: Campaign[] = []
    const limit = 100
    let offset = 0
    while (true) {
      const { status, text } = await spGet(
        `${API}/campaigns?limit=${limit}&offset=${offset}`,
        { Authorization: `Bearer ${token}` },
      )
      if (status < 200 || status >= 300) {
        console.warn(`[SendPulse] GET /campaigns status=${status}`, text)
        break
      }
      const page = JSON.parse(text) as Campaign[]
      all.push(...page)
      if (page.length < limit) break
      offset += limit
    }
    return all
  } catch (err) {
    console.error("[SendPulse] getCampaigns failed:", err)
    return []
  }
}

// ── Telegram chatbot ──────────────────────────────────────────────────────────
// Employers subscribe to the SendPulse Telegram bot via a personal tg.pulse.is link:
// SendPulse saves the `employer_token` query param into the contact's bot variable
// of the same name (the variable must exist in the bot's Audience), so later we can
// find the employer's bot contact by token and message them.

/**
 * Personal "connect Telegram" link for an employer, or null if the bot isn't configured.
 * The token is inserted as-is (UUIDs are URL-safe) so it can also be the `{{employer_token}}`
 * merge tag in campaign emails — URL-encoding would mangle the braces.
 */
export function telegramConnectUrl(employerToken: string): string | null {
  const botName = process.env.SENDPULSE_TG_BOT_NAME
  const flowId = process.env.SENDPULSE_TG_START_FLOW_ID
  if (!botName || !flowId) return null
  return `https://tg.pulse.is/${botName}?start=${flowId}&employer_token=${employerToken}`
}

/** Every SendPulse Telegram contact whose employer_token variable matches — any status.
 * Normally at most one, but nothing guarantees it, so callers decide how to use the list.
 * telegram_id is Telegram's own numeric user id — portable if we ever move off SendPulse
 * to a self-hosted bot (same token, same Bot API), unlike SendPulse's own contact `id`.
 * channel_data.username is the real connected account's @handle — a employer can type any
 * Telegram username at registration and then open the connect link from a *different*
 * account, so this is the only reliable source for "who actually connected" (see
 * getTelegramConnectionInfo()). Username is optional on Telegram, so it can be absent. */
async function getTelegramContactRecords(
  employerToken: string,
  token: string,
): Promise<Array<{ id: string; status: number; telegram_id: number; channel_data?: { username?: string | null } }>> {
  const botId = process.env.SENDPULSE_TG_BOT_ID
  if (!botId) return []
  const params = new URLSearchParams({
    bot_id: botId,
    variable_name: "employer_token",
    variable_value: employerToken,
  })
  const { status, text } = await spGet(
    `${API}/telegram/contacts/getByVariable?${params}`,
    { Authorization: `Bearer ${token}` },
  )
  if (status < 200 || status >= 300) {
    console.warn(`[SendPulse] GET /telegram/contacts/getByVariable status=${status}`, text)
    return []
  }
  const data = JSON.parse(text) as {
    data?: Array<{ id: string; status: number; telegram_id: number; channel_data?: { username?: string | null } }>
  }
  return data.data ?? []
}

/** Returns the SendPulse bot contact_id of the employer, or null if they haven't subscribed. */
async function findTelegramContactId(employerToken: string, token: string): Promise<string | null> {
  const records = await getTelegramContactRecords(employerToken, token)
  // status 1 = active; a contact who blocked the bot can't receive messages anyway
  return records.find((c) => c.status === 1)?.id ?? null
}

export type TelegramConnectionInfo = {
  telegramId: string
  /** Real @username of the connected account, or null if it has none (optional on Telegram).
   * Can differ from employers.telegram — the employer types that at registration, but can end
   * up opening the connect link from a different Telegram account than the one they named. */
  username: string | null
}

/**
 * Which of the given employer tokens have an active Telegram bot connection, their Telegram
 * user id, and their real @username — for the "подключён к Telegram" badge in
 * /editor/employers, and to keep employers.telegramId/telegram in Neon in sync (see
 * app/editor/employers/page.tsx): a token missing from the returned map means "not connected
 * right now", which the page treats as license to clear a stale telegramId it finds — this is
 * what actually removes it once SendPulse no longer reports the contact (deleted via
 * deleteTelegramContact() or by any other means). Best-effort: returns an empty map (never
 * throws) if the bot isn't configured or SendPulse auth fails, same as
 * sendTelegramToEmployer() — Telegram status is informational, not load-bearing for anything
 * else in the app.
 */
export async function getTelegramConnectionInfo(employerTokens: string[]): Promise<Map<string, TelegramConnectionInfo>> {
  const result = new Map<string, TelegramConnectionInfo>()
  if (!employerTokens.length || !process.env.SENDPULSE_TG_BOT_ID) return result
  try {
    const token = await getToken()
    if (!token) return result
    await Promise.all(
      employerTokens.map(async (employerToken) => {
        const records = await getTelegramContactRecords(employerToken, token)
        const active = records.find((c) => c.status === 1)
        if (active) {
          result.set(employerToken, {
            telegramId: String(active.telegram_id),
            username: active.channel_data?.username ?? null,
          })
        }
      }),
    )
    return result
  } catch (err) {
    console.error("[SendPulse] getTelegramConnectionInfo failed:", err)
    return result
  }
}

/** POSTs the given action (enable/disable/delete) for every SendPulse Telegram contact record
 * matching the employer's token — regardless of the record's current status, unlike
 * findTelegramContactId(), since an admin action must still reach an already-disabled
 * contact. Returns true if at least one matching record had status !== 1 (not already active)
 * before the action ran — enableTelegramContact() uses this to tell a genuine reactivation
 * from a no-op (never connected, or already active). Best-effort: never throws, returns false
 * and silently no-ops if the employer never connected or SendPulse auth fails. */
async function setTelegramContactState(employerToken: string, action: "enable" | "disable" | "delete"): Promise<boolean> {
  try {
    const token = await getToken()
    if (!token) return false
    const records = await getTelegramContactRecords(employerToken, token)
    const hadInactive = records.some((r) => r.status !== 1)
    await Promise.all(
      records.map(async (record) => {
        const res = await spPost(
          `${API}/telegram/contacts/${action}`,
          { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          JSON.stringify({ contact_id: record.id }),
        )
        const ok = res.status >= 200 && res.status < 300
        if (ok) console.log(`[SendPulse] telegram ${action} status=${res.status}`)
        else console.warn(`[SendPulse] telegram ${action} status=${res.status}`, res.text)
      }),
    )
    return hadInactive
  } catch (err) {
    console.error(`[SendPulse] telegram ${action} failed:`, err)
    return false
  }
}

/** Re-enables a previously disabled Telegram bot contact — counterpart to
 * disableTelegramContact(), called from confirmEmployer() so an employer who reconnects after
 * being rejected/disabled doesn't need the contact flipped back on manually in SendPulse. Must
 * run before sendTelegramToEmployer() in the same confirm — findTelegramContactId() only
 * matches status === 1 (active), so the welcome message would silently no-op otherwise.
 * Returns true only when a genuinely disabled contact was found and reactivated — false if the
 * employer never connected, or was already active (a true first-time confirm) — so
 * confirmEmployer() can tell "reactivation" from "first connection" and skip re-sending the
 * "approved" message on the former: the employer already got it once before being disabled,
 * and got no "you were disabled" message either, so a silent reactivation is symmetric. */
export async function enableTelegramContact(employerToken: string): Promise<boolean> {
  return setTelegramContactState(employerToken, "enable")
}

/** Disables the employer's Telegram bot contact — campaigns/autoflows stop, but the contact
 * and its employer_token variable stay intact, so re-confirming the employer later (which
 * calls enableTelegramContact()) can find the connection again. Used when an employer is
 * rejected or disabled, never deleted. */
export async function disableTelegramContact(employerToken: string): Promise<void> {
  await setTelegramContactState(employerToken, "disable")
}

/** Permanently removes the employer's Telegram bot contact from SendPulse's audience — used
 * only when the employer record itself is deleted, not on reject/disable (see
 * disableTelegramContact()). */
export async function deleteTelegramContact(employerToken: string): Promise<void> {
  await setTelegramContactState(employerToken, "delete")
}

/**
 * Sends a Telegram message to the employer via the SendPulse bot. Best-effort: returns
 * false (never throws) if the bot isn't configured, the employer hasn't subscribed, or
 * SendPulse fails — Telegram is an optional channel on top of email.
 *
 * Plain text (no button, no photo) goes through `/telegram/contacts/sendText` — confirmed by
 * SendPulse's own OpenAPI spec that this endpoint only accepts `{contact_id, text}`;
 * `parse_mode`/`reply_markup` are silently dropped there (tested directly — both come back
 * `null` in the response even on 200). `button` and/or `photo` route through the richer
 * `/telegram/contacts/send`, which supports `parse_mode: "html"`, `reply_markup.inline_keyboard`,
 * and `type: "photo"` with a `caption` (confirmed working end-to-end against a real contact). Both
 * `button.url` and `photo` must be real reachable HTTPS addresses — Telegram itself rejects
 * `localhost`, and media URLs must be publicly fetchable at send time (per SendPulse's own spec).
 */
export async function sendTelegramToEmployer(
  employerToken: string,
  text: string,
  extra?: { button?: { label: string; url: string }; photo?: string },
): Promise<boolean> {
  try {
    const token = await getToken()
    if (!token) return false
    const contactId = await findTelegramContactId(employerToken, token)
    if (!contactId) return false

    const rich = Boolean(extra?.button || extra?.photo)
    const endpoint = rich ? "/telegram/contacts/send" : "/telegram/contacts/sendText"
    const replyMarkup = extra?.button
      ? { inline_keyboard: [[{ text: extra.button.label, type: "web_url", url: extra.button.url }]] }
      : undefined
    const payload = rich
      ? {
          contact_id: contactId,
          message: extra?.photo
            ? { type: "photo", photo: extra.photo, caption: text, parse_mode: "html", reply_markup: replyMarkup }
            : { type: "text", text, parse_mode: "html", reply_markup: replyMarkup },
        }
      : { contact_id: contactId, text }

    const res = await spPost(
      `${API}${endpoint}`,
      { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      JSON.stringify(payload),
    )
    const ok = res.status >= 200 && res.status < 300
    if (ok) console.log(`[SendPulse] telegram send status=${res.status}`)
    else console.warn(`[SendPulse] telegram send status=${res.status}`, res.text)
    return ok
  } catch (err) {
    console.error("[SendPulse] sendTelegramToEmployer failed:", err)
    return false
  }
}

// ── Transactional email ─────────────────────────────────────────────────────────

/**
 * Sends a single transactional email via SendPulse's SMTP API — for event-triggered,
 * per-recipient email (the candidate consent-request letter in app/actions.ts
 * submitContactRequest()), not for periodic/bulk sends. SendPulse's transactional channel is
 * meant for mail tied to one specific user event, not recurring campaigns — the monthly
 * candidate digest deliberately does NOT use this, it goes through an address book + campaign
 * instead (see runCandidateDigest() in app/actions.ts).
 *
 * `from` is an explicit parameter, not read from env here — there are two distinct senders in
 * this app (employer-facing, candidate-facing) and this function shouldn't decide which one a
 * given call needs.
 *
 * POST /smtp/emails requires `html` Base64-encoded (confirmed against SendPulse's own OpenAPI
 * spec, api.sendpulse.com/.well-known/openapi/smtp.yaml, operationId sendSmtpEmail) — `text`
 * would not need this, but every candidate-facing email in this app is HTML (minimal, see
 * lib/email-templates.ts). `auto_plain_text: true` has SendPulse generate the plain-text part
 * itself, so a second copy of the content doesn't need to be written by hand.
 *
 * Best-effort: never throws, returns false and logs on any failure — a candidate not getting
 * this email must never block or roll back the action that triggered it.
 */
export async function sendTransactionalEmail(
  to: { email: string; name?: string },
  subject: string,
  html: string,
  from: { email: string; name: string },
): Promise<boolean> {
  try {
    const token = await getToken()
    if (!token) return false
    const payload = JSON.stringify({
      email: {
        subject,
        from,
        to: [to],
        html: Buffer.from(html, "utf-8").toString("base64"),
        auto_plain_text: true,
      },
    })
    const res = await spPost(
      `${API}/smtp/emails`,
      { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      payload,
    )
    const ok = res.status >= 200 && res.status < 300
    if (ok) console.log(`[SendPulse] smtp send status=${res.status}`)
    else console.warn(`[SendPulse] smtp send status=${res.status}`, res.text)
    return ok
  } catch (err) {
    console.error("[SendPulse] sendTransactionalEmail failed:", err)
    return false
  }
}
