import { config } from "dotenv"
import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import { migrate } from "drizzle-orm/neon-http/migrator"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

config({ path: ".env.local" })
config({ path: ".env" })

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const sql = neon(url)
const db = drizzle(sql)

await migrate(db, {
  migrationsFolder: join(__dirname, "../lib/db/migrations"),
})

console.log("Migration complete")
