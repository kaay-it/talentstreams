import { getStreams } from "@/lib/db/streams"
import { LanguageProvider } from "@/components/language-provider"
import { HomePageContent } from "@/components/home-page-content"

export default async function HomePage() {
  const streams = await getStreams()

  return (
    <LanguageProvider>
      <HomePageContent streams={streams} />
    </LanguageProvider>
  )
}
