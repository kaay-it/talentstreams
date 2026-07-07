"use server"

import { appendEmployerRow, appendCandidateRow } from "@/lib/sheets"

export type EmployerData = {
  name: string
  company: string
  email: string
  phone: string
  primaryContact: "email" | "telegram" | "whatsapp" | "linkedin"
  telegram: string
  linkedin: string
  streams: string[]
}

export type CandidateData = {
  name: string
  email: string
  phone: string
  resumeUrl: string
  coverLetter: string
}

export async function registerCandidate(data: CandidateData): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email.trim()) throw new Error("Укажите email")

  await appendCandidateRow([
    new Date().toISOString(),
    data.name,
    data.email,
    data.phone,
    data.resumeUrl,
    data.coverLetter,
  ])
}

export async function registerEmployer(data: EmployerData): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email || !data.phone) throw new Error("Email и телефон обязательны")
  if (!data.streams.length) throw new Error("Выберите хотя бы один стрим")
  if (data.primaryContact === "telegram" && !data.telegram.trim()) {
    throw new Error("Укажите Telegram-имя")
  }
  if (data.primaryContact === "linkedin" && !data.linkedin.trim()) {
    throw new Error("Укажите LinkedIn-профиль")
  }

  await appendEmployerRow([
    new Date().toISOString(),
    data.name,
    data.company,
    data.email,
    data.phone,
    data.primaryContact,
    data.telegram || "",
    data.linkedin || "",
    data.streams.join(", "),
  ])
}
