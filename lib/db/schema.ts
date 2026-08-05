import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

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
