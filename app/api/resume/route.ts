import { NextRequest, NextResponse } from "next/server"

if (process.env.NODE_ENV !== "production") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"
}

const BLOB_HOST = "blob.vercel-storage.com"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get("url")
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 })

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  if (!parsed.hostname.endsWith(BLOB_HOST)) {
    return NextResponse.json({ error: "Not a blob URL" }, { status: 400 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not set" }, { status: 500 })

  try {
    const fileRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Blob fetch failed: ${fileRes.status}` },
        { status: 502 },
      )
    }
    const filename = parsed.pathname.split("/").pop() ?? "resume"
    const contentType = fileRes.headers.get("content-type") || "application/octet-stream"
    return new NextResponse(fileRes.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error("[/api/resume]", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
