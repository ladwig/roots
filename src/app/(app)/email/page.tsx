import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { EmptyState, PageHeader } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { createCampaign } from "./actions"

export default async function CampaignsPage({ searchParams }: PageProps<"/email">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("email.manage")
  const creating = canManage && param(sp, "new") === "1"
  const { data } = await ctx.supabase
    .from("email_campaigns")
    .select("id, name, subject, status, send_at, recipients, updated_at")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200)

  return (
    <>
      <PageHeader area="communication" title={t("email.tabs.campaigns")} primary={canManage ? { href: withParams(sp, { new: "1" }), label: t("email.newCampaign") } : undefined} />
      <Notice error={!creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <DataTable
        rows={data ?? []}
        rowKey={(r) => r.id}
        rowHref={(r) => `/email/${r.id}`}
        empty={
          <EmptyState
            area="communication"
            title={t("email.emptyCampaigns")}
            text={t("email.emptyCampaignsText")}
            action={
              canManage && (
                <Button render={<Link href={withParams(sp, { new: "1" })} scroll={false} />} nativeButton={false} size="sm">
                  <PlusIcon /> {t("email.newCampaign")}
                </Button>
              )
            }
          />
        }
        columns={[
          {
            header: t("email.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.subject}</span>
              </span>
            ),
          },
          {
            header: t("email.status"),
            cell: (r) => (
              <Badge variant={r.status === "sent" ? "default" : r.status === "draft" ? "outline" : "secondary"}>
                {t.dynamic(`email.statuses.${r.status}`)}
                {r.status === "scheduled" && r.send_at ? ` · ${t.date(r.send_at, { dateStyle: "short", timeStyle: "short" })}` : ""}
              </Badge>
            ),
          },
          { header: t("email.recipients"), cell: (r) => (r.status === "draft" || r.status === "scheduled" ? "–" : r.recipients) },
        ]}
      />
      {creating && (
        <UrlSheet params={["new"]} title={t("email.newCampaign")}>
          <Notice error={param(sp, "error")} />
          <form action={createCampaign} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="c-name">{t("email.name")}</Label>
              <Input id="c-name" name="name" required maxLength={200} placeholder={t("email.namePlaceholder")} />
            </div>
            <SubmitButton className="justify-self-end">{t("email.create")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
    </>
  )
}

export const instant = false
