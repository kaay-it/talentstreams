"use client"

import { useEffect, useRef, useState } from "react"
import { searchCompanies } from "@/app/actions"

const inputCls =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"

// Must match SEARCH_MIN_LENGTH in lib/db/companies.ts — searchCompanies() ignores shorter queries anyway.
const SEARCH_MIN_LENGTH = 3

/** Free-text "Компания" input with a suggestions dropdown backed by searchCompanies() —
 * picking a suggestion or typing a brand-new name are both valid; the server resolves the
 * submitted text to a company via findOrCreateCompanyByName() (case-insensitive). */
export function CompanyAutocompleteInput({
  value,
  onChange,
  required,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  placeholder?: string
}) {
  const [suggestions, setSuggestions] = useState<{ id: number; name: string }[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const query = value.trim()
    if (query.length < SEARCH_MIN_LENGTH) {
      setSuggestions([])
      return
    }
    let active = true
    const timer = setTimeout(() => {
      searchCompanies(query).then((rows) => {
        if (active) setSuggestions(rows)
      })
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        required={required}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputCls}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-card py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(s.name)
                  setOpen(false)
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-card-foreground hover:bg-muted"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
