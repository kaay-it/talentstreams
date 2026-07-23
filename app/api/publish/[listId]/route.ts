import { type NextRequest, NextResponse } from "next/server"
import { publishMailingList } from "@/app/actions"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  return handle(req, await params)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  return handle(req, await params)
}

async function handle(req: NextRequest, { listId }: { listId: string }) {
  const editorSecret = process.env.EDITOR_SECRET
  if (editorSecret) {
    const token =
      req.nextUrl.searchParams.get("token") ??
      req.headers.get("x-editor-token")
    if (token !== editorSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const result = await publishMailingList(listId)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error"
    console.error("[publish API]", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
