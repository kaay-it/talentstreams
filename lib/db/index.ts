import "server-only"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

// Corporate proxy intercepts TLS — disable cert verification in local dev only
if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  return drizzle(neon(url), { schema })
}

type Db = ReturnType<typeof createDb>
let _db: Db | undefined

export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    if (!_db) _db = createDb()
    return (_db as unknown as Record<string | symbol, unknown>)[prop]
  },
})
