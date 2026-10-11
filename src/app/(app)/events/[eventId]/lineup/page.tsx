import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeftIcon, ListChecksIcon, Trash2Icon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { toLocalInput } from "@/lib/time"
import { param, withParams } from "@/lib/url"
import { artistGuestList, deleteSlot, saveArtist, saveSlot } from "./actions"

const textarea =
  "rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"

export default async function LineupPage({ params, searchParams }: PageProps<"/events/[eventId]/lineup">) {
  const ctx = await requirePerm("events.view")
  if (!ctx.modules.has("events")) notFound()
  const { eventId } = await params
  const sp = await searchParams
  const t = await getT()
  const canManage = ctx.can("events.manage")
  const guestlists = ctx.modules.has("guestlists") && ctx.can("guestlists.manage")
  const [{ data: ev }, { data: slots }, { data: artists }] = await Promise.all([
    ctx.supabase.from("events").select("id, title, starts_at").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("event_slots").select("*, artists(id, name)").eq("event_id", eventId).order("starts_at"),
    ctx.supabase.from("artists").select("*").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(1000),
  ])
  if (!ev) notFound()
  const editingSlot = slots?.find((s) => s.id === param(sp, "slot"))
  const creating = canManage && param(sp, "new") === "slot"
  const editingArtist = canManage ? artists?.find((a) => a.id === param(sp, "artist")) : undefined
  const time = (v: string) => t.date(v, { weekday: "short", hour: "2-digit", minute: "2-digit" })

  return (
    <div className="grid max-w-5xl gap-6">
      <div className="grid gap-1">
        <Link href={`/events?edit=${ev.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {ev.title}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-2xl font-semibold">{t("lineup.title")}</h1>
          {canManage && (
            <Button render={<Link href={withParams(sp, { new: "slot", slot: undefined })} scroll={false} />} nativeButton={false} size="sm">
              {t("lineup.newSlot")}
            </Button>
          )}
        </div>
      </div>
      <Notice error={!creating && !editingSlot && !editingArtist ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <DataTable
        rows={slots ?? []}
        rowKey={(s) => s.id}
        rowHref={canManage ? (s) => withParams(sp, { slot: s.id, new: undefined }) : undefined}
        empty={t("lineup.empty")}
        columns={[
          {
            header: t("lineup.time"),
            cell: (s) => (
              <span className="whitespace-nowrap tabular-nums">
                {time(s.starts_at)}
                {s.ends_at && ` – ${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`}
              </span>
            ),
          },
          {
            header: t("lineup.act"),
            cell: (s) => (
              <span className="font-medium">
                {s.artists?.name ?? s.title}
                {s.artists && s.title && <span className="font-normal text-muted-foreground"> · {s.title}</span>}
                {!s.public && <Badge variant="secondary" className="ml-2">{t("lineup.internal")}</Badge>}
              </span>
            ),
          },
          { header: t("lineup.stage"), cell: (s) => s.stage },
        ]}
      />

      {(creating || (canManage && editingSlot)) && (
        <UrlSheet params={["new", "slot"]} title={editingSlot ? (editingSlot.artists?.name ?? editingSlot.title ?? "") : t("lineup.newSlot")}>
          <Notice error={param(sp, "error")} />
          <SlotForm t={t} eventId={ev.id} defaultStart={ev.starts_at} slot={editingSlot} artists={artists ?? []} />
          {editingSlot?.artists && (
            <div className="flex flex-wrap gap-2">
              <Button render={<Link href={withParams(sp, { artist: editingSlot.artists.id, slot: undefined })} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                {t("lineup.editArtist")}
              </Button>
              {guestlists && (
                <form action={artistGuestList}>
                  <input type="hidden" name="event" value={ev.id} />
                  <input type="hidden" name="artist" value={editingSlot.artists.id} />
                  <SubmitButton size="sm" variant="outline">
                    <ListChecksIcon /> {t("lineup.guestList")}
                  </SubmitButton>
                </form>
              )}
            </div>
          )}
          {editingSlot && (
            <form action={deleteSlot}>
              <input type="hidden" name="event" value={ev.id} />
              <input type="hidden" name="id" value={editingSlot.id} />
              <SubmitButton size="sm" variant="ghost">
                <Trash2Icon /> {t("lineup.deleteSlot")}
              </SubmitButton>
            </form>
          )}
        </UrlSheet>
      )}
      {editingArtist && (
        <UrlSheet params={["artist"]} title={editingArtist.name}>
          <Notice error={param(sp, "error")} />
          <form action={saveArtist} className="grid gap-4">
            <input type="hidden" name="event" value={ev.id} />
            <input type="hidden" name="id" value={editingArtist.id} />
            <div className="grid gap-2">
              <Label htmlFor="a-name">{t("lineup.artistName")}</Label>
              <Input id="a-name" name="name" defaultValue={editingArtist.name} required maxLength={200} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-desc">{t("lineup.description")}</Label>
              <textarea id="a-desc" name="description" rows={4} defaultValue={editingArtist.description ?? ""} maxLength={5000} className={textarea} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-links">{t("lineup.links")}</Label>
              <textarea id="a-links" name="links" rows={2} defaultValue={editingArtist.links.join("\n")} className={textarea} placeholder="https://soundcloud.com/…" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="a-notes">{t("lineup.notes")}</Label>
              <textarea id="a-notes" name="notes" rows={3} defaultValue={editingArtist.notes ?? ""} maxLength={5000} className={textarea} placeholder={t("lineup.notesPlaceholder")} />
            </div>
            <SubmitButton className="justify-self-start">{t("common.save")}</SubmitButton>
          </form>
        </UrlSheet>
      )}
    </div>
  )
}

function SlotForm({ t, eventId, defaultStart, slot, artists }: { t: T; eventId: string; defaultStart: string; slot?: Tables<"event_slots">; artists: Tables<"artists">[] }) {
  return (
    <form action={saveSlot} className="grid gap-4">
      <input type="hidden" name="event" value={eventId} />
      {slot && <input type="hidden" name="id" value={slot.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="s-artist">{t("lineup.artist")}</Label>
          <NativeSelect id="s-artist" name="artist" defaultValue={slot?.artist_id ?? ""} className="w-full">
            <NativeSelectOption value="">–</NativeSelectOption>
            {artists.map((a) => (
              <NativeSelectOption key={a.id} value={a.id}>
                {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-new">{t("lineup.orNewArtist")}</Label>
          <Input id="s-new" name="new_artist" maxLength={200} placeholder={t("lineup.newArtistPlaceholder")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="s-title">{t("lineup.slotTitle")}</Label>
          <Input id="s-title" name="title" defaultValue={slot?.title ?? ""} maxLength={200} placeholder={t("lineup.slotTitlePlaceholder")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-stage">{t("lineup.stage")}</Label>
          <Input id="s-stage" name="stage" defaultValue={slot?.stage ?? ""} maxLength={100} placeholder="Main Floor" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="s-start">{t("lineup.start")}</Label>
          <Input id="s-start" name="starts_at" type="datetime-local" required defaultValue={toLocalInput(slot?.starts_at ?? defaultStart)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="s-end">{t("lineup.end")}</Label>
          <Input id="s-end" name="ends_at" type="datetime-local" defaultValue={slot?.ends_at ? toLocalInput(slot.ends_at) : undefined} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="public" value="1" defaultChecked={slot?.public ?? true} className="size-4" />
        {t("lineup.publicLabel")}
      </label>
      <div className="grid gap-2">
        <Label htmlFor="s-notes">{t("lineup.notes")}</Label>
        <Input id="s-notes" name="notes" defaultValue={slot?.notes ?? ""} maxLength={2000} />
      </div>
      <SubmitButton className="justify-self-start">{slot ? t("common.save") : t("lineup.newSlot")}</SubmitButton>
    </form>
  )
}

export const instant = false
