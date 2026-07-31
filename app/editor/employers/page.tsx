import { notFound } from "next/navigation"
import { Info } from "lucide-react"
import { getEmployers } from "@/lib/sheets"
import { EmployerSection } from "@/components/employer-section"

export const dynamic = "force-dynamic"

export default async function EmployersPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET

  if (editorSecret && secret !== editorSecret) {
    notFound()
  }

  const employers = await getEmployers()

  return (
    <div className="px-6 py-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Работодатели</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {employers.length} {employerPlural(employers.length)}
        </span>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-xl border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Работодатели регистрируются через форму на главной странице и попадают в статус «На проверке».
          После подтверждения они добавляются в адресные книги SendPulse и начинают получать рассылки.
          Отклонённые заявки в рассылку не включаются.
        </p>
      </div>

      <EmployerSection employers={employers} />
    </div>
  )
}

function employerPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "работодатель"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "работодателя"
  return "работодателей"
}
