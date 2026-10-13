import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { CourseForm } from "../course-form"

export default async function NewCoursePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("courses.manage")
  if (!ctx.modules.has("courses")) notFound()
  const t = await getT()
  const sp = await searchParams
  const { data: locations } = await ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name")
  return (
    <NewPage list={{ href: "/courses", label: t("courses.nav") }} title={t("courses.new")} error={param(sp, "error")}>
      <CourseForm t={t} locations={locations ?? []} />
    </NewPage>
  )
}

export const instant = false
