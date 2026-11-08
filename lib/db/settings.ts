import "server-only"
import { eq } from "drizzle-orm"
import { db } from "./index"
import { settings } from "./schema"

/** Raw string value for a setting, or null if it was never written. Callers parse/default as
 * needed — see getBooleanSetting() for the common boolean case. */
export async function getSetting(name: string): Promise<string | null> {
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.name, name)).limit(1)
  return rows[0]?.value ?? null
}

/** Upsert by name (unique) — a setting always has exactly one row once written. */
export async function setSetting(name: string, type: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ name, type, value })
    .onConflictDoUpdate({ target: settings.name, set: { type, value } })
}

/** "true"/"false" string in the row, parsed; defaultValue when the setting was never written. */
export async function getBooleanSetting(name: string, defaultValue: boolean): Promise<boolean> {
  const v = await getSetting(name)
  return v === null ? defaultValue : v === "true"
}
