import { SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { toLocalInput } from "@/lib/time"
import type { Tables } from "@/lib/supabase/types"
import { priceInput } from "@/tickets/price"
import { saveList } from "./actions"

// New / edit list. Event lists can be tied to an artist and to a ticket type (entries get free tickets).
export async function ListForm({ eventId, list }: { eventId: string | null; list?: Tables<"guest_lists"> }) {
  const ctx = await getContext()
  const t = await getT()
  const ev = list?.event_id ?? eventId
  const [{ data: events }, { data: artists }, { data: types }] = await Promise.all([
    list || eventId
      ? Promise.resolve({ data: [] })
      : ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).gte("starts_at", new Date().toISOString()).order("starts_at").limit(50),
    ctx.supabase.from("artists").select("id, name").eq("org_id", ctx.org.id).is("deleted_at", null).order("name").limit(500),
    ev && ctx.modules.has("tickets") ? ctx.supabase.from("ticket_types").select("id, name").eq("event_id", ev).order("position") : Promise.resolve({ data: [] }),
  ])
  return (
    <form action={saveList} className="grid gap-4">
      {list && <input type="hidden" name="id" value={list.id} />}
      {(list || eventId) && <input type="hidden" name="event" value={ev ?? ""} />}
      <div className="grid gap-2">
        <Label htmlFor="gl-name">{t("guestlists.name")}</Label>
        <Input id="gl-name" name="name" defaultValue={list?.name} required maxLength={100} placeholder={t("guestlists.namePlaceholder")} />
      </div>
      {!list && !eventId && (
        <div className="grid gap-2">
          <Label htmlFor="gl-event">{t("guestlists.event")}</Label>
          <NativeSelect id="gl-event" name="event" defaultValue="" className="w-full">
            <NativeSelectOption value="">{t("guestlists.permanentOption")}</NativeSelectOption>
            {events?.map((e) => (
              <NativeSelectOption key={e.id} value={e.id}>
                {e.title} · {t.date(e.starts_at, { dateStyle: "short" })}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="gl-price">{t("guestlists.doorPriceEur")}</Label>
          <Input id="gl-price" name="door_price" inputMode="decimal" defaultValue={list?.door_price ? priceInput(list.door_price) : "0"} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gl-quota">{t("guestlists.quota")}</Label>
          <Input id="gl-quota" name="quota" type="number" min={1} defaultValue={list?.quota ?? ""} placeholder="∞" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gl-per">{t("guestlists.perSubmission")}</Label>
          <Input id="gl-per" name="per_submission" type="number" min={1} max={50} defaultValue={list?.per_submission ?? 5} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="gl-artist">{t("guestlists.artist")}</Label>
          <NativeSelect id="gl-artist" name="artist" defaultValue={list?.artist_id ?? ""} className="w-full">
            <NativeSelectOption value="">–</NativeSelectOption>
            {artists?.map((a) => (
              <NativeSelectOption key={a.id} value={a.id}>
                {a.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gl-closes">{t("guestlists.closesAt")}</Label>
          <Input id="gl-closes" name="link_closes_at" type="datetime-local" defaultValue={list?.link_closes_at ? toLocalInput(list.link_closes_at) : undefined} />
        </div>
      </div>
      {ev && (types?.length ?? 0) > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="gl-type">{t("guestlists.ticketType")}</Label>
          <NativeSelect id="gl-type" name="ticket_type" defaultValue={list?.ticket_type_id ?? ""} className="w-full">
            <NativeSelectOption value="">{t("guestlists.noTickets")}</NativeSelectOption>
            {types?.map((ty) => (
              <NativeSelectOption key={ty.id} value={ty.id}>
                {ty.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-muted-foreground">{t("guestlists.ticketHint")}</p>
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="gl-notes">{t("guestlists.notes")}</Label>
        <Input id="gl-notes" name="notes" defaultValue={list?.notes ?? ""} maxLength={2000} />
      </div>
      <SubmitButton className="justify-self-start">{list ? t("common.save") : t("guestlists.new")}</SubmitButton>
    </form>
  )
}
