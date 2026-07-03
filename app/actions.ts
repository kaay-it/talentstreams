"use server"

import { appendEmployerRow } from "@/lib/sheets"

export type EmployerData = {
  name: string
  company: string
  email: string
  phone: string
  primaryContact: "email" | "telegram" | "whatsapp"
  telegram: string
  streams: string[]
}

export async function registerEmployer(data: EmployerData): Promise<void> {
  if (!data.name.trim()) throw new Error("Укажите имя")
  if (!data.email || !data.phone) throw new Error("Email и телефон обязательны")
  if (!data.streams.length) throw new Error("Выберите хотя бы один стрим")
  if (data.primaryContact === "telegram" && !data.telegram.trim()) {
    throw new Error("Укажите Telegram-имя")
  }

  await appendEmployerRow([
    new Date().toISOString(),
    data.name,
    data.company,
    data.email,
    data.phone,
    data.primaryContact,
    data.telegram || "",
    data.streams.join(", "),
  ])
}
