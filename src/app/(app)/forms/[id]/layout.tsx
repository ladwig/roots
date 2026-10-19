import { notFound } from "next/navigation"
import { PageHeader } from "@/components/page"
import { ExternalLinkIcon } from "lucide-react"
import { NavLink } from "@/components/nav-link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"

export default async function FormLayout({ children, params }: LayoutProps<"/forms/[id]">) {
  const { id } = await params
  const ctx = await requirePerm("forms.view")
  if (!ctx.modules.has("forms")) notFound()
  const t = await getT()
  const { data: form } = await ctx.supabase.from("forms").select("title, slug, status").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle()
  if (!form) notFound()
  return (
    <div className="grid max-w-6xl gap-6">
      <PageHeader
        crumbs={[{ href: "/forms", label: t("forms.title") }, { label: form.title }]}
        title={form.title}
        badge={<Badge variant={form.status === "published" ? "default" : "outline"}>{t.dynamic(`forms.statuses.${form.status}`)}</Badge>}
        actions={
          form.status === "published" && (
            <Button render={<a href={siteUrl(ctx.org.slug, `/f/${form.slug}`, ctx.org.site_domain)} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
              <ExternalLinkIcon /> {t("forms.openPublic")}
            </Button>
          )
        }
      />
      <nav aria-label={form.title} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        <NavLink href={`/forms/${id}`} exact>
          {t("forms.tabs.builder")}
        </NavLink>
        <NavLink href={`/forms/${id}/submissions`}>{t("forms.tabs.submissions")}</NavLink>
      </nav>
      {children}
    </div>
  )
}

export const instant = false
