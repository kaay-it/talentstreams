import { getStreams } from "@/lib/db/streams"
import { getIndustries } from "@/lib/db/industries"
import { getCompanySizes } from "@/lib/db/company-sizes"
import { LanguageProvider } from "@/components/language-provider"
import { HomePageContent } from "@/components/home-page-content"

export default async function HomePage() {
  const [streams, industries, companySizes] = await Promise.all([getStreams(), getIndustries(), getCompanySizes()])

  return (
    <LanguageProvider>
      <HomePageContent
        streams={streams}
        industries={industries.map((i) => i.name)}
        companySizes={companySizes.map((s) => ({ label: s.label, rangeHint: s.rangeHint }))}
      />
    </LanguageProvider>
  )
}
