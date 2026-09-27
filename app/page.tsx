import { isSheetsConfigured } from "@/lib/sheets"
import { getStreams } from "@/lib/db/streams"
import { LanguageProvider } from "@/components/language-provider"
import { HomePageContent } from "@/components/home-page-content"

export default async function HomePage() {
  const configured = isSheetsConfigured()
  const streams = configured ? await getStreams() : []

  return (
    <LanguageProvider>
      <HomePageContent configured={configured} streams={streams} />
    </LanguageProvider>
  )
}
