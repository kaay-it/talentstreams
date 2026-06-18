import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getProfile, isSheetsConfigured } from "@/lib/sheets"
import { ProfileView } from "@/components/profile-view"

// Always render fresh from the sheet on request.
export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const profile = await getProfile(id)
    if (!profile) return { title: "Профиль не найден" }
    return {
      title: `${profile.name}${profile.title ? ` — ${profile.title}` : ""}`,
      description: profile.bio || `Визитка ${profile.name}`,
    }
  } catch {
    return { title: "Профиль" }
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!isSheetsConfigured()) {
    notFound()
  }

  let profile = null
  try {
    profile = await getProfile(id)
  } catch {
    profile = null
  }

  if (!profile) {
    notFound()
  }

  return <ProfileView profile={profile} />
}
