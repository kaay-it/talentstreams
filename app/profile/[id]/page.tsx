import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getCandidateById } from "@/lib/db/candidates"
import { getResumeVersions } from "@/lib/db/resumes"
import { ProfileView } from "@/components/profile-view"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ secret?: string }>
}): Promise<Metadata> {
  const { id } = await params
  const { secret } = await searchParams
  const editorSecret = process.env.EDITOR_SECRET
  const isEditor = !editorSecret || secret === editorSecret

  try {
    const profile = await getCandidateById(id)
    if (!profile) return { title: "Профиль не найден", robots: { index: false, follow: false } }
    // Anonymous visitors (no valid ?secret=) never see the real name in metadata either —
    // it would otherwise leak via the page <title>/description regardless of the blurred UI.
    const title = isEditor ? profile.name : "Профиль кандидата"
    return {
      title: `${title}${isEditor && profile.title ? ` — ${profile.title}` : ""}`,
      description: isEditor ? `Визитка ${profile.name}` : "Анонимная визитка кандидата",
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
  searchParams: Promise<{ back?: string; secret?: string }>
}) {
  const { id } = await params
  const { back, secret } = await searchParams

  const editorSecret = process.env.EDITOR_SECRET
  // No EDITOR_SECRET configured at all (e.g. local dev) → no gating is set up anywhere else in
  // the app either, so default to the full view rather than blurring for everyone.
  const isEditor = !editorSecret || secret === editorSecret

  let profile = null
  try {
    profile = await getCandidateById(id)
  } catch {
    profile = null
  }

  if (!profile) notFound()

  const resumes = await getResumeVersions(id)

  return <ProfileView profile={profile} resumes={resumes} isEditor={isEditor} backUrl={back ?? "/"} />
}
