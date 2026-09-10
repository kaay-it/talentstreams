import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core"

export const streams = pgTable("streams", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull().unique(),
  type:        text("type").notNull().default(""),
  description: text("description").notNull().default(""),
})

export const candidateResumes = pgTable("candidateResumes", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  candidateId: text("candidateId").notNull(),
  kind:        text("kind").notNull(), // "file" | "link"
  filename:    text("filename").notNull().default(""),
  url:         text("url").notNull(),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
})

export const contactRequests = pgTable("contactRequests", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  timestamp:     timestamp("timestamp").defaultNow().notNull(),
  listId:        text("listId").notNull().default(""),
  stream:        text("stream").notNull().default(""),
  candidateId:   text("candidateId").notNull().default(""),
  employerToken: text("employerToken").notNull().default(""),
  employerName:  text("employerName").notNull().default(""),
  company:       text("company").notNull().default(""),
  employerEmail: text("employerEmail").notNull().default(""),
  status:        text("status").notNull().default("Новый запрос"),
})
