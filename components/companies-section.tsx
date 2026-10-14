"use client"

import { Fragment, useState } from "react"
import { Briefcase, ChevronDown, ChevronUp, User } from "lucide-react"
import type { CompanyWithEmployees } from "@/lib/db/companies"

const STATUS_STYLE: Record<string, string> = {
  "На проверке": "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400",
  "Подтверждён": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Отклонён": "bg-muted text-muted-foreground",
}

export function CompaniesSection({ companies }: { companies: CompanyWithEmployees[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (!companies.length) {
    return (
      <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
        Компании не найдены в базе данных.
      </div>
    )
  }

  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Компания</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground w-32">Люди</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((company) => {
            const isExpanded = expandedIds.has(company.id)
            return (
              <Fragment key={company.id}>
                <tr
                  onClick={() => toggleExpanded(company.id)}
                  className="border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3.5 font-medium">
                    <div className="flex items-center gap-2">
                      {company.employers.length > 0 ? (
                        isExpanded ? <ChevronUp className="size-3.5 text-muted-foreground/60 shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground/60 shrink-0" />
                      ) : (
                        <span className="size-3.5 shrink-0" />
                      )}
                      <Briefcase className="size-3.5 text-muted-foreground/50 shrink-0" />
                      {company.name}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{company.employers.length}</td>
                </tr>
                {isExpanded && company.employers.length > 0 && (
                  <tr className="border-b bg-muted/10">
                    <td colSpan={2} className="px-4 py-2">
                      <ul className="space-y-1 pl-9">
                        {company.employers.map((e) => (
                          <li key={e.token} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <User className="size-3 shrink-0" />
                            <span className="text-foreground">{e.name}</span>
                            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[e.status] ?? "bg-muted text-muted-foreground"}`}>
                              {e.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
