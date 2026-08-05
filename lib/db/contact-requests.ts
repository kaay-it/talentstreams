import "server-only"
import { desc, eq } from "drizzle-orm"
import { db } from "./index"
import { contactRequests } from "./schema"

export type ContactRequestStatus =
  | "Новый запрос"
  | "Кандидату написали"
  | "Кандидат не отвечает"
  | "Связаться с Аленой"
  | "Кандидату интересно"
  | "Кандидату не интересно"
  | "Контакты переданы"
  | "Взяли в работу"
  | "Завершён"

export type ContactRequest = {
  id: string
  timestamp: string
  listId: string
  stream: string
  candidateId: string
  employerToken: string
  employerName: string
  company: string
  employerEmail: string
  status: ContactRequestStatus
}

export async function appendContactRequest(data: {
  listId: string
  stream: string
  candidateId: string
  employerToken: string
  employerName: string
  employerCompany: string
  employerEmail: string
}): Promise<void> {
  await db.insert(contactRequests).values({
    listId: data.listId,
    stream: data.stream,
    candidateId: data.candidateId,
    employerToken: data.employerToken,
    employerName: data.employerName,
    company: data.employerCompany,
    employerEmail: data.employerEmail,
  })
}

export async function getContactRequests(): Promise<ContactRequest[]> {
  const rows = await db
    .select()
    .from(contactRequests)
    .orderBy(desc(contactRequests.timestamp))

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp.toISOString(),
    listId: r.listId,
    stream: r.stream,
    candidateId: r.candidateId,
    employerToken: r.employerToken,
    employerName: r.employerName,
    company: r.company,
    employerEmail: r.employerEmail,
    status: r.status as ContactRequestStatus,
  }))
}

export async function updateContactRequestStatus(id: string, status: ContactRequestStatus): Promise<void> {
  await db.update(contactRequests).set({ status }).where(eq(contactRequests.id, id))
}
