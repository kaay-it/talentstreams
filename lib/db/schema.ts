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
  name:                text("name").notNull().default(""),
  companyId:           integer("companyId").references(() => companies.id, { onDelete: "set null" }),
  email:               text("email").notNull().default(""),
  phone:               text("phone").notNull().default(""),
  primaryContact:      text("primaryContact").notNull().default(""),
  telegram:            text("telegram").notNull().default(""),
  linkedin:            text("linkedin").notNull().default(""),
  streams:             text("streams").array().notNull().default([]),
  status:              text("status").notNull().default("На проверке"),
  country:             text("country").notNull().default(""),
  additionalCountries: text("additionalCountries").array().notNull().default([]),
  timestamp:           timestamp("timestamp").defaultNow().notNull(),
  // Telegram user id (SendPulse contact's telegram_id, numeric but stored as text — no
  // arithmetic done on it) — nullable, synced opportunistically from SendPulse whenever
  // /editor/employers checks connection status; null if never connected or no longer found.
  // Portability groundwork: this is what a future self-hosted bot would message directly via
  // the Telegram Bot API, independent of SendPulse (see lib/sendpulse.ts telegram functions).
  telegramId:          text("telegramId"),
})

export const mailingListEntries = pgTable("mailingListEntries", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  listId:      text("listId").notNull(),
  streamId:    integer("streamId").references(() => streams.id, { onDelete: "set null" }),
  targetDate:  date("targetDate", { mode: "string" }).notNull(),
  candidateId: text("candidateId").references(() => candidates.id, { onDelete: "set null" }),
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
  email:                 text("email").notNull().default(""),
  phone:                 text("phone").notNull().default(""),
  stream:                text("stream").array().notNull().default([]),
  level:                 text("level").notNull().default(""),
  countryPrimary:        text("countryPrimary").notNull().default(""),
  countryDesired:        text("countryDesired").notNull().default(""),
  summary:               text("summary").notNull().default(""),
  excludedCompanies:     text("excludedCompanies").array().notNull().default([]),
  excludedIndustries:    text("excludedIndustries").array().notNull().default([]),
  status:                text("status").notNull().default("На проверке"),
  // ISO "YYYY-MM-DD", no time component; null = not set (candidate always passes the availability filter).
  activeSince:           date("activeSince", { mode: "string" }),
  registrationTimestamp: timestamp("registrationTimestamp").defaultNow().notNull(),
  coverLetter:           text("coverLetter").notNull().default(""),
  resumeUrl:             text("resumeUrl").notNull().default(""),
})
