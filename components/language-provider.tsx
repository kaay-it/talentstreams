"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

export type Locale = "ru" | "en"

const STORAGE_KEY = "ts-locale"

type LanguageContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

/** Scoped to the public home page (and its registration modals) only — the editor stays
 * Russian-only for now. Defaults to "ru" on the server and first client render (avoids a
 * hydration mismatch), then picks up a stored preference right after mount. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru")

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored === "ru" || stored === "en") setLocaleState(stored)
    } catch {
      // localStorage unavailable (private mode, blocked) — stay on the default locale
    }
  }, [])

  function setLocale(next: Locale) {
    setLocaleState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // best-effort persistence only
    }
  }

  return <LanguageContext.Provider value={{ locale, setLocale }}>{children}</LanguageContext.Provider>
}

export function useLocale(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLocale() must be used within a LanguageProvider")
  return ctx
}
