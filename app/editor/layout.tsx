import { Suspense } from "react"
import { EditorNav } from "@/components/editor-nav"

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-52 shrink-0 border-r bg-card flex flex-col">
        <div className="px-4 py-5 border-b">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">TalentStreams</p>
          <p className="mt-0.5 text-sm font-semibold text-card-foreground">Редактор</p>
        </div>
        <Suspense>
          <EditorNav />
        </Suspense>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  )
}
