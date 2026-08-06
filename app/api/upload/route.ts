import { put } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"

const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
]
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  const formData = await req.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 })
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Допустимые форматы: PDF, DOC, DOCX" }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "Файл не должен превышать 5 МБ" }, { status: 400 })
  }

  const ext = file.name.split(".").pop() ?? "pdf"
  const filename = `resumes/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`

  const blob = await put(filename, file, {
    access: "private",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  })

  const appUrl = (process.env.APP_URL || "").replace(/\/$/, "")
  const proxyUrl = appUrl
    ? `${appUrl}/api/resume?url=${encodeURIComponent(blob.url)}`
    : blob.url

  return NextResponse.json({ url: proxyUrl })
}
