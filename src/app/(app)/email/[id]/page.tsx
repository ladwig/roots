import { notFound } from "next/navigation"
import { CalendarXIcon, FlaskConicalIcon, SendIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Notice } from "@/components/notice"
import { FormCard, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmailBodyField } from "@/components/email-body-field"
import { TagSelect } from "@/components/tag-select"
import { BASE_PLACEHOLDERS, type Format } from "@/email/render"
import { resolveAudience, type Audience } from "@/email/server"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { toLocalInput } from "@/lib/time"
import { param } from "@/lib/url"
import { saveCampaign, trashCampaign, unscheduleCampaign } from "../actions"

export default async function CampaignPage({ params, searchParams }: PageProps<"/email/[id]">) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const canManage = ctx.can("email.manage")
  const { data: c } = await ctx.supabase.from("email_campaigns").select("*").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle()
  if (!c) notFound()
  const audience = c.audience as Audience
  const editable = canManage && (c.status === "draft" || c.status === "scheduled")
  const [reach, stats, { data: tagRows }] = await Promise.all([
    editable && (audience.tags?.length || audience.members) ? resolveAudience(ctx.supabase, ctx.org.id, audience).then((r) => r.length) : Promise.resolve(null),
    !editable
      ? ctx.supabase.from("email_sends").select("status, delivery").eq("campaign_id", id).limit(50000).then(({ data }) => data ?? [])
      : Promise.resolve([] as { status: string; delivery: string | null }[]),
    ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id }),
  ])
  const allTags = (tagRows ?? []) as unknown as string[]
  const count = (s: string) => stats.filter((x) => x.status === s).length
  const delivered = (d: string) => stats.filter((x) => x.delivery === d).length

  const statsLine = !editable
    ? [
        t("email.stats", { sent: count("sent"), queued: count("queued") + count("sending"), failed: count("failed"), skipped: count("skipped") }),
        stats.some((x) => x.delivery) ? t("email.deliveryStats", { delivered: delivered("delivered"), bounced: delivered("bounced"), complained: delivered("complained") }) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/email", label: t("email.tabs.campaigns") }, { label: c.name }]}
        title={c.name}
        badge={
          <Badge variant={c.status === "sent" ? "default" : "outline"}>
            {t.dynamic(`email.statuses.${c.status}`)}
            {c.status === "scheduled" && c.send_at ? ` · ${t.date(c.send_at, { dateStyle: "short", timeStyle: "short" })}` : ""}
          </Badge>
        }
        meta={statsLine}
        menu={
          canManage &&
          (c.status === "scheduled" || c.status !== "sending") && (
            <ActionsMenu>
              {c.status === "scheduled" && (
                <MenuSubmit form="unschedule" icon={<CalendarXIcon />}>
                  {t("email.unschedule")}
                </MenuSubmit>
              )}
              {c.status !== "sending" && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="trash-campaign" icon={<Trash2Icon />} destructive>
                    {t("email.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
      />
      {canManage && (
        <>
          <form id="unschedule" action={unscheduleCampaign} hidden>
            <input type="hidden" name="id" value={c.id} />
          </form>
          <form id="trash-campaign" action={trashCampaign} hidden>
            <input type="hidden" name="id" value={c.id} />
          </form>
        </>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <form action={saveCampaign}>
        <input type="hidden" name="id" value={c.id} />
        <RecordLayout
          aside={
            <>
              <FormCard id="audience" title={t("email.audience")} description={reach == null ? t("email.audienceHint") : t("email.reach", { count: reach })}>
                <fieldset disabled={!editable} className="grid gap-3">
                  <div className="grid gap-2">
                    <Label>{t("email.audienceTags")}</Label>
                    <TagSelect name="tags" options={allTags} defaultValue={audience.tags ?? []} disabled={!editable} />
                  </div>
                  {ctx.modules.has("members") && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="members" value="active" defaultChecked={audience.members === "active"} className="size-4 accent-primary" />
                      {t("email.audienceMembers")}
                    </label>
                  )}
                </fieldset>
              </FormCard>
              {editable && (
                <FormCard id="send" title={t("email.sending")}>
                  <SubmitButton name="intent" value="test" variant="outline" size="sm" className="justify-self-start">
                    <FlaskConicalIcon /> {t("email.sendTest")}
                  </SubmitButton>
                  <div className="grid gap-2">
                    <Label htmlFor="c-at">{t("email.sendAt")}</Label>
                    <div className="flex flex-wrap gap-2">
                      <Input id="c-at" name="send_at" type="datetime-local" defaultValue={c.send_at ? toLocalInput(c.send_at) : ""} className="w-auto flex-1" />
                      <SubmitButton name="intent" value="schedule" variant="outline" size="sm">
                        {t("email.schedule")}
                      </SubmitButton>
                    </div>
                  </div>
                  <SubmitButton name="intent" value="send">
                    <SendIcon /> {t("email.sendNow")}
                  </SubmitButton>
                </FormCard>
              )}
            </>
          }
        >
          <FormCard id="content" title={t("email.content")}>
            <fieldset disabled={!editable} className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="c-name" name="name" label={t("email.name")} defaultValue={c.name} required maxLength={200} />
                <Field id="c-subject" name="subject" label={t("email.subject")} defaultValue={c.subject} maxLength={300} />
              </div>
              <EmailBodyField id="c-body" format={c.format as Format} body={c.body} placeholders={BASE_PLACEHOLDERS} disabled={!editable} />
            </fieldset>
          </FormCard>
          {editable && <SaveBar />}
        </RecordLayout>
      </form>
    </>
  )
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  )
}

export const instant = false
