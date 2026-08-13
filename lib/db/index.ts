import "server-only"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

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
