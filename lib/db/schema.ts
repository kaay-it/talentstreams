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
  candidateId: text("candidateId").notNull(),
  kind:        text("kind").notNull(), // "file" | "link"
  filename:    text("filename").notNull().default(""),
  url:         text("url").notNull(),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
})

export const employers = pgTable("employers", {
  token:               text("token").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:                text("name").notNull().default(""),
  company:             text("company").notNull().default(""),
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
})

export const mailingListEntries = pgTable("mailingListEntries", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  listId:      text("listId").notNull(),
  streamId:    integer("streamId").references(() => streams.id, { onDelete: "set null" }),
  targetDate:  date("targetDate", { mode: "string" }).notNull(),
  candidateId: text("candidateId").notNull().default(""),
})

export const contactRequests = pgTable("contactRequests", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  timestamp:     timestamp("timestamp").defaultNow().notNull(),
  listId:        text("listId").notNull().default(""),
  streamId:      integer("streamId").references(() => streams.id, { onDelete: "set null" }),
  candidateId:   text("candidateId").notNull().default(""),
  employerToken: text("employerToken").notNull().references(() => employers.token, { onDelete: "cascade" }),
  status:        text("status").notNull().default("Новый запрос"),
})
