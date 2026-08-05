import "server-only"
import { asc, eq } from "drizzle-orm"
import { db } from "./index"
import { streams } from "./schema"

export type StreamRecord = { id: number; name: string; type: string; description: string }

export async function getStreams(): Promise<string[]> {
  try {
    const rows = await db.select({ name: streams.name }).from(streams).orderBy(asc(streams.id))
    return rows.map((r) => r.name)
  } catch {
    return []
  }
}

export async function getStreamsDetailed(): Promise<StreamRecord[]> {
  try {
    const rows = await db
      .select({ id: streams.id, name: streams.name, type: streams.type, description: streams.description })
      .from(streams)
      .orderBy(asc(streams.id))
    return rows
  } catch {
    return []
  }
}

export async function updateStreamRecord(
  id: number,
  data: { name: string; type: string; description: string },
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
