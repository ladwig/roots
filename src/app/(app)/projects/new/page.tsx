import { NewPage } from "@/components/new-page"
import { SaveBar } from "@/components/save-bar"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, type SearchParams } from "@/lib/url"
import { projectBasics } from "@/projects/load"
import { createProjectAction } from "../actions"
import { ProjectFields } from "../project-form"

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("projects.manage")
  const t = await getT()
  const sp = await searchParams
  const [basics, defs] = await Promise.all([projectBasics(ctx), loadFields(ctx.supabase, ctx.org.id, "projects")])
  return (
    <NewPage list={{ href: "/projects", label: t("projects.title") }} title={t("projects.newProject")} error={param(sp, "error")}>
      <form action={createProjectAction} className="grid gap-6">
        <input type="hidden" name="back" value="/projects/new" />
        <ProjectFields t={t} statuses={basics.projectStatuses} team={basics.team} defs={defs} />
        <SaveBar label={t("projects.createProject")} always />
      </form>
    </NewPage>
  )
}

export const instant = false
