import { notFound } from "next/navigation"
import { ImageForm } from "@/components/image-form"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { restoreEvent, setEventStatus, trashEvent, updateEvent, updateEventImage } from "../actions"
import { EventForm } from "../event-form"

// Event overview: publishing, image, all details, cancel / trash. (Header and tabs: ./layout.tsx.)
export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<SearchParams> }) {
  const { eventId } = await params
  const ctx = await requirePerm("events.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("events.manage")
  const { data: ev } = await ctx.supabase.from("events").select("*").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle()
  if (!ev) notFound()

  if (ev.deleted_at)
    return (
      <div className="grid max-w-xl gap-3">
        <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">
          {t("eventsPage.deletedOn", { date: t.date(ev.deleted_at), purge: t.date(new Date(new Date(ev.deleted_at).getTime() + 30 * 86_400_000)) })}
        </p>
        {canManage && (
          <form action={restoreEvent}>
            <input type="hidden" name="id" value={ev.id} />
            <SubmitButton>{t("eventsPage.restore")}</SubmitButton>
          </form>
        )}
      </div>
    )

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="grid min-w-0 gap-4">
        <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
        {!canManage && <p className="text-sm text-muted-foreground">{t("eventsPage.readOnly")}</p>}
        <EventForm t={t} action={updateEvent} ev={ev} disabled={!canManage} />
      </div>
      <aside className="grid min-w-0 gap-6">
        {canManage && (
          <section className="grid gap-2">
            {ev.status !== "published" ? (
              <form action={setEventStatus}>
                <input type="hidden" name="id" value={ev.id} />
                <input type="hidden" name="status" value="published" />
                <SubmitButton>{t("eventsPage.publish")}</SubmitButton>
              </form>
            ) : (
              <form action={setEventStatus}>
                <input type="hidden" name="id" value={ev.id} />
                <input type="hidden" name="status" value="draft" />
                <SubmitButton variant="outline">{t("eventsPage.unpublish")}</SubmitButton>
              </form>
            )}
          </section>
        )}
        {canManage && (
          <ImageForm action={updateEventImage} id="ev-image" label={t("eventsPage.image")} hint={t("eventsPage.imageHint")} name={ev.title} path={ev.image_path} square hidden={{ id: ev.id }} />
        )}
        {canManage && (
          <section className="grid gap-3 rounded-lg border border-destructive/30 p-3">
            <h2 className="font-medium text-destructive">{t("admin.dangerZone")}</h2>
            {ev.status === "published" && (
              <form action={setEventStatus} className="grid gap-2">
                <input type="hidden" name="id" value={ev.id} />
                <input type="hidden" name="status" value="cancelled" />
                <p className="text-sm text-muted-foreground">{t("eventsPage.cancelConfirm")}</p>
                <SubmitButton variant="destructive" size="sm" className="justify-self-start">
                  {t("eventsPage.cancel")}
                </SubmitButton>
              </form>
            )}
            <form action={trashEvent}>
              <input type="hidden" name="id" value={ev.id} />
              <SubmitButton variant="outline" size="sm">
                {t("eventsPage.toTrash")}
              </SubmitButton>
            </form>
          </section>
        )}
      </aside>
    </div>
  )
}

export const instant = false
