import "server-only"
import { asc, eq } from "drizzle-orm"
import { db } from "./index"
import { streams } from "./schema"

export type StreamStatus = "Активный" | "Архивный"

export type StreamRecord = { id: number; name: string; type: string; description: string; status: StreamStatus }

/** Active stream names only — used everywhere a stream is picked for something new
 * (registration forms, release creation, candidate/employer stream assignment/filters).
 * An archived stream is retired from all of these by design. */
export async function getStreams(): Promise<string[]> {
  try {
    const rows = await db
      .select({ name: streams.name })
      .from(streams)
      .where(eq(streams.status, "Активный"))
      .orderBy(asc(streams.id))
    return rows.map((r) => r.name)
  } catch {
    return []
  }
}

/** All streams (active + archived) — used only by the streams admin page itself. */
export async function getStreamsDetailed(): Promise<StreamRecord[]> {
  try {
    const rows = await db
      .select({ id: streams.id, name: streams.name, type: streams.type, description: streams.description, status: streams.status })
      .from(streams)
      .orderBy(asc(streams.id))
    return rows as StreamRecord[]
  } catch {
    return []
  }
}

export async function getStreamById(id: number): Promise<StreamRecord | null> {
  const rows = await db
    .select({ id: streams.id, name: streams.name, type: streams.type, description: streams.description, status: streams.status })
    .from(streams)
    .where(eq(streams.id, id))
    .limit(1)
  return (rows[0] as StreamRecord) ?? null
}

export async function getStreamIdByName(name: string): Promise<number | null> {
  if (!name) return null
  const rows = await db.select({ id: streams.id }).from(streams).where(eq(streams.name, name)).limit(1)
  return rows[0]?.id ?? null
}

export async function updateStreamRecord(
  id: number,
  data: Partial<{ name: string; type: string; description: string; status: StreamStatus }>,
): Promise<void> {
  await db.update(streams).set(data).where(eq(streams.id, id))
}

export async function createStreamRecord(data: {
  name: string
  type: string
  description: string
}): Promise<void> {
  await db.insert(streams).values(data)
}

export async function deleteStreamRecord(id: number): Promise<void> {
  await db.delete(streams).where(eq(streams.id, id))
}
