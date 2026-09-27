"use client"

import { useLocale } from "@/components/language-provider"

export function LanguageToggle() {
  const { locale, setLocale } = useLocale()

  return (
    <div className="inline-flex items-center rounded-full border p-0.5 text-xs font-medium">
      <button
        type="button"
        onClick={() => setLocale("ru")}
        aria-pressed={locale === "ru"}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          locale === "ru" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        RU
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          locale === "en" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        EN
      </button>
    </div>
  )
}
