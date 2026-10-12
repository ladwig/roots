import { Trash2Icon } from "lucide-react"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AUTOMATION_EVENTS } from "@/email/events"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param } from "@/lib/url"
import { deleteAutomation, saveAutomation } from "../actions"

const textareaClass =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"

// Automations: event + delay → email to the person it's about. Several on the same event with different delays
// make a sequence ("welcome now, info after 7 days, survey after 30").
export default async function AutomationsPage({ searchParams }: PageProps<"/email/automations">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("email.manage")
  const events = AUTOMATION_EVENTS.filter((e) => ctx.modules.has(e.module))
  const { data } = await ctx.supabase.from("email_automations").select("*").eq("org_id", ctx.org.id).order("event_type").order("delay_minutes")

  return (
    <>
      <div>
        <h1 className="font-heading text-2xl font-semibold">{t("email.tabs.automations")}</h1>
        <p className="text-sm text-muted-foreground">{t("email.automationsHint")}</p>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ul className="grid gap-3">
        {(data ?? []).map((a) => (
          <li key={a.id} className="rounded-lg border p-4">
            <AutomationForm t={t} a={a} events={events} disabled={!canManage} />
          </li>
        ))}
        {canManage && (
          <li className="rounded-lg border border-dashed p-4">
            <h2 className="mb-3 font-medium">{t("email.newAutomation")}</h2>
            <AutomationForm t={t} events={events} />
          </li>
        )}
      </ul>
    </>
  )
}

function AutomationForm({ t, a, events, disabled }: { t: T; a?: Tables<"email_automations">; events: typeof AUTOMATION_EVENTS; disabled?: boolean }) {
  const key = a?.id ?? "new"
  const d = a?.delay_minutes ?? 0
  const [delay, unit] = d % 1440 === 0 ? [d / 1440, "days"] : d % 60 === 0 ? [d / 60, "hours"] : [d, "minutes"]
  const ev = events.find((e) => e.type === a?.event_type)
  return (
    <div className="flex flex-wrap items-start gap-3">
      <form action={saveAutomation} className="grid flex-1 gap-3">
        {a && <input type="hidden" name="id" value={a.id} />}
        <fieldset disabled={disabled} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr_1fr]">
            <Field id={`a-name-${key}`} name="name" label={t("email.name")} required maxLength={200} defaultValue={a?.name ?? ""} placeholder={t("email.automationPlaceholder")} />
            <div className="grid gap-2">
              <Label htmlFor={`a-ev-${key}`}>{t("email.trigger")}</Label>
              <NativeSelect id={`a-ev-${key}`} name="event_type" defaultValue={a?.event_type ?? events[0]?.type} className="w-full">
                {events.map((e) => (
                  <NativeSelectOption key={e.type} value={e.type}>
                    {t.dynamic(`events.types.${e.type}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <Field id={`a-delay-${key}`} name="delay" type="number" min={0} label={t("email.delay")} defaultValue={delay} />
            <div className="grid gap-2">
              <Label htmlFor={`a-unit-${key}`}>{t("email.unit")}</Label>
              <NativeSelect id={`a-unit-${key}`} name="unit" defaultValue={unit} className="w-full">
                {(["minutes", "hours", "days"] as const).map((u) => (
                  <NativeSelectOption key={u} value={u}>
                    {t(`email.units.${u}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <Field id={`a-subject-${key}`} name="subject" label={t("email.subject")} required maxLength={300} defaultValue={a?.subject ?? ""} />
          <div className="grid gap-2">
            <Label htmlFor={`a-body-${key}`}>{t("email.body")}</Label>
            <textarea id={`a-body-${key}`} name="body" rows={6} required maxLength={50000} defaultValue={a?.body ?? ""} className={textareaClass} />
            <p className="text-xs text-muted-foreground">
              {t("email.bodyHelp")}
              {ev?.vars.length ? ` ${t("email.eventVars", { vars: ev.vars.map((v) => `{${v}}`).join(", ") })}` : ""}
            </p>
          </div>
        </fieldset>
        {!disabled && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="active" defaultChecked={a?.active ?? true} className="size-4" /> {t("email.active")}
            </label>
            <SubmitButton size="sm" variant={a ? "outline" : "default"}>
              {a ? t("email.save") : t("email.create")}
            </SubmitButton>
          </div>
        )}
      </form>
      {a && !disabled && (
        <form action={deleteAutomation}>
          <input type="hidden" name="id" value={a.id} />
          <Tooltip>
            <TooltipTrigger render={<SubmitButton size="icon-sm" variant="ghost" aria-label={t("email.delete")} />}>
              <Trash2Icon />
            </TooltipTrigger>
            <TooltipContent>{t("email.delete")}</TooltipContent>
          </Tooltip>
        </form>
      )}
    </div>
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
