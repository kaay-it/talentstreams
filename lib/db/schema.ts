import { pgTable, serial, integer, text, timestamp, date } from "drizzle-orm/pg-core"

export const streams = pgTable("streams", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull().unique(),
  type:        text("type").notNull().default(""),
  description: text("description").notNull().default(""),
  status:      text("status").notNull().default("Активный"),
})

export const candidateResumes = pgTable("candidateResumes", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidateId: text("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  kind:        text("kind").notNull(), // "file" | "link"
  filename:    text("filename").notNull().default(""),
  url:         text("url").notNull(),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
})

export const companies = pgTable("companies", {
  id:   serial("id").primaryKey(),
  name: text("name").notNull().unique(),
})

export const employers = pgTable("employers", {
  token:               text("token").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // No default on name/email/phone/primaryContact/country — registerEmployer() always validates
  // and supplies a real value for all five before the row is ever created, so '' is never a
  // reachable state for them. A default would just let a future bug silently insert an empty
  // value instead of Postgres loudly rejecting the missing column. telegram/linkedin keep theirs
  // below — '' there is a real state (employer picked a different contact method).
  name:                text("name").notNull(),
  companyId:           integer("companyId").references(() => companies.id, { onDelete: "set null" }),
  email:               text("email").notNull().unique(),
  phone:               text("phone").notNull().unique(),
  primaryContact:      text("primaryContact").notNull(),
  telegram:            text("telegram").notNull().default(""),
  linkedin:            text("linkedin").notNull().default(""),
  streams:             text("streams").array().notNull().default([]),
  status:              text("status").notNull().default("На проверке"),
  country:             text("country").notNull(),
  additionalCountries: text("additionalCountries").array().notNull().default([]),
  timestamp:           timestamp("timestamp").defaultNow().notNull(),
  // Telegram user id (SendPulse contact's telegram_id, numeric but stored as text — no
  // arithmetic done on it) — nullable, synced opportunistically from SendPulse whenever
  // /editor/employers checks connection status; null if never connected or no longer found.
  // Portability groundwork: this is what a future self-hosted bot would message directly via
  // the Telegram Bot API, independent of SendPulse (see lib/sendpulse.ts telegram functions).
  telegramId:          text("telegramId"),
})

// Header row for a mailing-list "выпуск" (release) — one row per listId, shared by every
// mailingListEntries/mailingListRecipients row of that release.
export const mailingLists = pgTable("mailingLists", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  streamId:  integer("streamId").references(() => streams.id, { onDelete: "set null" }),
  // timestamp, not date — mode: "string" (same reasoning as candidates.activeSince: avoids a
  // JS Date timezone round-trip shifting the day). Full date+time groundwork for a future
  // send-scheduling feature; the UI only picks a date today, time defaults to midnight.
  targetDate: timestamp("targetDate", { mode: "string" }).notNull(),
  // Names of the companies a narrowed release was sent to ("" = whole stream, the default) —
  // readability only (SendPulse campaign name suffix, editor UI badge), never the source of
  // truth for "was this release sent" (that's sentCampaignId below).
  recipientLabel: text("recipientLabel").notNull().default(""),
  // The real SendPulse campaign id, written once on the first successful send (publishMailingList()).
  // NULL = never sent. The only source of truth for "was this release sent" across the app —
  // replaces the old fragile convention of matching a `${stream} — ${date}` string against
  // SendPulse's campaign list, which could never actually guarantee it was THIS release.
  sentCampaignId: integer("sentCampaignId"),
})

// Legacy content table — superseded by selections/selectionEntries below (every release's
// candidates now live in its default selection instead). Kept only until the backfill into
// selections is verified on real data and this table is dropped in a follow-up migration;
// no code reads or writes it anymore.
export const mailingListEntries = pgTable("mailingListEntries", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  listId:      text("listId").notNull().references(() => mailingLists.id, { onDelete: "cascade" }),
  candidateId: text("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
})

// A "подборка" — a reusable content set, prepared ahead of time for a stream in /editor/selections
// (built independently of any release), then picked (not authored) when creating/editing a
// release. listId is null while sitting in the pool; attaching it to a release sets it, detaching
// clears it back to null (ON DELETE SET NULL — deleting a release returns its selections to the
// pool rather than destroying them, same as an explicit detach). A release can have at most one
// ATTACHED selection with no selectionEmployers rows (the default, shown to anyone without a
// personal override) and any number with ≥1 selectionEmployers row (personal, shown only to
// those employers, bypassing filterCandidatesForEmployer entirely — the manager hand-picked
// these candidates for these employers on purpose, no geo/exclusion second-guessing). A release
// legitimately has zero default selections if every subscriber got a personal one. Composition
// (candidates/employers) is only ever edited in /editor/selections, never from a release's own
// UI, attached or not — the release side is purely a picker.
export const selections = pgTable("selections", {
  id:         text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // Which stream this подборка was prepared for — the only thing that still makes sense before
  // it's ever attached to a release (a release's own streamId isn't available yet at that point).
  streamId:   integer("streamId").notNull().references(() => streams.id, { onDelete: "cascade" }),
  listId:     text("listId").references(() => mailingLists.id, { onDelete: "set null" }),
  // The подборка's own date — set at creation (same "stream, then date, then build the list" flow
  // releases used to have), editable afterward, and independent of whichever release it later
  // gets attached to (that release has its own targetDate for the actual send). mode: "string",
  // same reasoning as mailingLists.targetDate/candidates.activeSince (avoids a JS Date timezone
  // round-trip shifting the day).
  targetDate: timestamp("targetDate", { mode: "string" }).notNull(),
  // Manager-facing label only (e.g. company names) — never the source of truth for default vs
  // personal, that's whether selectionEmployers has any rows for this selection.
  label:      text("label").notNull().default(""),
})

export const selectionEntries = pgTable("selectionEntries", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  selectionId: text("selectionId").notNull().references(() => selections.id, { onDelete: "cascade" }),
  candidateId: text("candidateId").notNull().references(() => candidates.id, { onDelete: "cascade" }),
})

export const selectionEmployers = pgTable("selectionEmployers", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  selectionId:   text("selectionId").notNull().references(() => selections.id, { onDelete: "cascade" }),
  employerToken: text("employerToken").notNull().references(() => employers.token, { onDelete: "cascade" }),
})

// Recipient override for a release — presence of any row for a listId means "narrowed to these
// employers", absence means the default "whole stream" send. Never written for ordinary releases.
export const mailingListRecipients = pgTable("mailingListRecipients", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  listId:        text("listId").notNull().references(() => mailingLists.id, { onDelete: "cascade" }),
  employerToken: text("employerToken").notNull().references(() => employers.token, { onDelete: "cascade" }),
})

export const contactRequests = pgTable("contactRequests", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  timestamp:     timestamp("timestamp").defaultNow().notNull(),
  listId:        text("listId").notNull().default(""),
  streamId:      integer("streamId").references(() => streams.id, { onDelete: "set null" }),
  candidateId:   text("candidateId").references(() => candidates.id, { onDelete: "set null" }),
  employerToken: text("employerToken").notNull().references(() => employers.token, { onDelete: "cascade" }),
  status:        text("status").notNull().default("Новый запрос"),
})

export const candidates = pgTable("candidates", {
  id:                    text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:                  text("name").notNull().default(""),
  title:                 text("title").notNull().default(""),
  // Nullable, unique — NULL means "not provided" (legacy rows only; registration always requires
  // an email). A plain UNIQUE constraint lets any number of rows have NULL (Postgres never treats
  // two NULLs as equal), which a '' sentinel default could not — the 2nd empty-string row would
  // collide. "" <-> null coercion happens at this module's boundary; external type stays string.
  email:                 text("email").unique(),
  // Same nullable+unique reasoning as email — phone is optional at registration, so many
  // candidates legitimately have none.
  phone:                 text("phone").unique(),
  stream:                text("stream").array().notNull().default([]),
  level:                 text("level").notNull().default(""),
  countryPrimary:        text("countryPrimary").notNull().default(""),
  countryDesired:        text("countryDesired").notNull().default(""),
  summary:               text("summary").notNull().default(""),
  excludedCompanies:     text("excludedCompanies").array().notNull().default([]),
  excludedStreams:       text("excludedStreams").array().notNull().default([]),
  status:                text("status").notNull().default("На проверке"),
  // ISO "YYYY-MM-DD", no time component; null = not set (candidate always passes the availability filter).
  activeSince:           date("activeSince", { mode: "string" }),
  registrationTimestamp: timestamp("registrationTimestamp").defaultNow().notNull(),
  coverLetter:           text("coverLetter").notNull().default(""),
  // No resumeUrl column — candidateResumes is the sole source of truth for a candidate's resume;
  // "current" is simply the newest row (see getResumeVersions()'s ORDER BY createdAt DESC).
})
