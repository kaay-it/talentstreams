import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCandidateById } from "@/lib/db/candidates"
import { ProfileView } from "@/components/profile-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  try {
    const profile = await getCandidateById(id)
    if (!profile) return { title: "Профиль не найден", robots: { index: false, follow: false } }
    return {
      title: `${profile.name}${profile.title ? ` — ${profile.title}` : ""}`,
      description: `Визитка ${profile.name}`,
      robots: { index: false, follow: false },
    }
  } catch {
    return { title: "Профиль", robots: { index: false, follow: false } }
  }
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ back?: string }>
}) {
  const { id } = await params
  const { back } = await searchParams

  let profile = null
  try {
    profile = await getCandidateById(id)
  } catch {
    profile = null
  }

  if (!profile) notFound()

  return <ProfileView profile={profile} backUrl={back ?? "/"} />
}
