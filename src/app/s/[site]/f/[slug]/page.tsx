import { notFound } from "next/navigation"
import { getT } from "@/i18n/server"
import { param } from "@/lib/url"
import { TemplatePage } from "@/sites/public"
import { getSite } from "../../data"
import type { PublicForm } from "./data"
import { FormRenderer } from "./form-renderer"

export default async function PublicFormPage({ params, searchParams }: PageProps<"/s/[site]/f/[slug]">) {
  const { site, slug } = await params
  const sp = await searchParams
  const s = await getSite(site)
  if (!s) notFound()
  const { data } = await s.db.rpc("public_form", { p_org: s.org.id, p_slug: slug })
  if (!data) notFound()
  const form = data as unknown as PublicForm
  const t = await getT()
  const body = () =>
    param(sp, "done") ? (
      <p className="rounded-lg border bg-muted px-4 py-3 whitespace-pre-line">{form.success_text || t("forms.thanks")}</p>
    ) : (
      <FormRenderer form={form} site={site} slug={slug} org={s.org.name} />
    )
  // The org's own form page design (website builder), else the standard page below.
  const designed = await TemplatePage({ site, kind: "form", context: { form: { title: form.title, intro: form.intro } }, render: { form: body } })
  if (designed) return designed

  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-12">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">{s.org.name}</p>
        <h1 className="font-heading text-2xl font-semibold">{form.title}</h1>
      </header>
      {!param(sp, "done") && form.intro && <p className="whitespace-pre-line text-muted-foreground">{form.intro}</p>}
      {body()}
    </main>
  )
}
