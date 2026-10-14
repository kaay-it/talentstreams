import { notFound } from "next/navigation"
import { getCompaniesWithEmployers } from "@/lib/db/companies"
import { CompaniesSection } from "@/components/companies-section"

export const dynamic = "force-dynamic"

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>
}) {
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET
  if (editorSecret && secret !== editorSecret) notFound()

  const companies = await getCompaniesWithEmployers()

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Компании</h1>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {companies.length} {companyPlural(companies.length)}
        </span>
      </div>

      <CompaniesSection companies={companies} />
    </div>
  )
}

function companyPlural(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "компания"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "компании"
  return "компаний"
}
