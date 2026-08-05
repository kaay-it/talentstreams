import "server-only"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// Corporate proxy intercepts TLS — disable cert verification in local dev only
if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
