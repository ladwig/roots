import { notFound } from "next/navigation"
import { FileList } from "@/components/file-list"
import { ImageForm } from "@/components/image-form"
import { Notice } from "@/components/notice"
import { FormCard, RecordLayout } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { restoreEvent, setEventStatus, updateEvent, updateEventImage } from "../actions"
import { EventForm } from "../event-form"

// Event overview: all details, image, cancelling. (Header with publish + trash, and the tabs: ./layout.tsx.)
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
    <>
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <RecordLayout
        aside={
          <>
            {ctx.can("org.files.view") && (
              <FormCard id="files" title={t("files.title")}>
                <FileList ctx={ctx} entity="events" entityId={ev.id} back={`/events/${ev.id}`} />
              </FormCard>
            )}
            {canManage && (
            <>
              <FormCard id="image" title={t("eventsPage.image")}>
                <ImageForm action={updateEventImage} id="ev-image" label={t("eventsPage.image")} hint={t("eventsPage.imageHint")} name={ev.title} path={ev.image_path} square hidden={{ id: ev.id }} />
              </FormCard>
              {ev.status === "published" && (
                <FormCard id="cancel" title={t("eventsPage.cancel")} description={t("eventsPage.cancelConfirm")}>
                  <form action={setEventStatus}>
                    <input type="hidden" name="id" value={ev.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <SubmitButton variant="destructive" size="sm">
                      {t("eventsPage.cancel")}
                    </SubmitButton>
                  </form>
                </FormCard>
              )}
            </>
            )}
          </>
        }
      >
        {!canManage && <p className="text-sm text-muted-foreground">{t("eventsPage.readOnly")}</p>}
        <EventForm t={t} action={updateEvent} ev={ev} disabled={!canManage} />
      </RecordLayout>
    </>
  )
}

export const instant = false
