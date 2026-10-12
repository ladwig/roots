import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { resolveAudience, type Audience } from "@/email/server"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { toLocalInput } from "@/lib/time"
import { param } from "@/lib/url"
import { saveCampaign, trashCampaign, unscheduleCampaign } from "../actions"

const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

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
  const [reach, stats] = await Promise.all([
    editable && (audience.tags?.length || audience.members) ? resolveAudience(ctx.supabase, ctx.org.id, audience).then((r) => r.length) : Promise.resolve(null),
    !editable
      ? ctx.supabase.from("email_sends").select("status").eq("campaign_id", id).limit(50000).then(({ data }) => data ?? [])
      : Promise.resolve([] as { status: string }[]),
  ])
  const count = (s: string) => stats.filter((x) => x.status === s).length

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl font-semibold">{c.name}</h1>
        <Badge variant={c.status === "sent" ? "default" : "outline"}>{t.dynamic(`email.statuses.${c.status}`)}</Badge>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {!editable && (
        <p className="text-sm text-muted-foreground">
          {t("email.stats", { sent: count("sent"), queued: count("queued") + count("sending"), failed: count("failed"), skipped: count("skipped") })}
        </p>
      )}
      <form action={saveCampaign} className="grid gap-4">
        <input type="hidden" name="id" value={c.id} />
        <fieldset disabled={!editable} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="c-name" name="name" label={t("email.name")} defaultValue={c.name} required maxLength={200} />
            <Field id="c-subject" name="subject" label={t("email.subject")} defaultValue={c.subject} maxLength={300} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-body">{t("email.body")}</Label>
            <textarea id="c-body" name="body" rows={14} defaultValue={c.body} maxLength={50000} className={textareaClass} aria-describedby="c-body-help" />
            <p id="c-body-help" className="text-xs text-muted-foreground">
              {t("email.bodyHelp")}
            </p>
          </div>
          <fieldset className="grid gap-3 rounded-lg border p-4">
            <legend className="px-1 font-medium">{t("email.audience")}</legend>
            <Field id="c-tags" name="tags" label={t("email.audienceTags")} defaultValue={(audience.tags ?? []).join(", ")} />
            {ctx.modules.has("members") && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="members" value="active" defaultChecked={audience.members === "active"} className="size-4" />
                {t("email.audienceMembers")}
              </label>
            )}
            <p className="text-xs text-muted-foreground">{reach == null ? t("email.audienceHint") : t("email.reach", { count: reach })}</p>
          </fieldset>
        </fieldset>
        {editable && (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="save" variant="outline">
                {t("email.save")}
              </SubmitButton>
              <SubmitButton name="intent" value="test" variant="outline">
                {t("email.sendTest")}
              </SubmitButton>
              <SubmitButton name="intent" value="send">
                {t("email.sendNow")}
              </SubmitButton>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field id="c-at" name="send_at" type="datetime-local" label={t("email.sendAt")} defaultValue={c.send_at ? toLocalInput(c.send_at) : ""} />
              <SubmitButton name="intent" value="schedule" variant="outline">
                {t("email.schedule")}
              </SubmitButton>
            </div>
          </div>
        )}
      </form>
      {canManage && c.status === "scheduled" && (
        <form action={unscheduleCampaign}>
          <input type="hidden" name="id" value={c.id} />
          <SubmitButton variant="ghost" size="sm">
            {t("email.unschedule")}
          </SubmitButton>
        </form>
      )}
      {canManage && c.status !== "sending" && (
        <form action={trashCampaign}>
          <input type="hidden" name="id" value={c.id} />
          <SubmitButton variant="outline" size="sm">
            {t("email.toTrash")}
          </SubmitButton>
        </form>
      )}
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
