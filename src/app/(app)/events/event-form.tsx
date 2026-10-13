import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { T } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { loadFields, type CustomValues } from "@/lib/custom-fields"
import type { Tables } from "@/lib/supabase/types"
import { toLocalInput } from "@/lib/time"

type Ev = Tables<"events">

// Event form (new event drawer + the event page) and the status badge (list + page).
export function StatusBadge({ t, status }: { t: T; status: string }) {
  const variant = status === "published" ? "default" : status === "cancelled" ? "destructive" : "secondary"
  return <Badge variant={variant}>{t.dynamic(`eventsPage.statuses.${status}`)}</Badge>
}

export async function EventForm({ t, action, ev, disabled }: { t: T; action: (fd: FormData) => Promise<void>; ev?: Ev; disabled?: boolean }) {
  const ctx = await getContext()
  const [{ data: locations }, defs] = await Promise.all([
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    loadFields(ctx.supabase, ctx.org.id, "events"),
  ])
  return (
    <form action={action} className="grid gap-4">
      {ev && <input type="hidden" name="id" value={ev.id} />}
      <fieldset disabled={disabled} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="ev-title">{t("eventsPage.titleLabel")}</Label>
          <Input id="ev-title" name="title" defaultValue={ev?.title} required maxLength={200} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ev-starts">{t("eventsPage.startsAt")}</Label>
            <Input
              id="ev-starts"
              name="starts_at"
              type="datetime-local"
              defaultValue={ev ? toLocalInput(ev.starts_at) : undefined}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ev-ends">{t("eventsPage.endsAt")}</Label>
            <Input id="ev-ends" name="ends_at" type="datetime-local" defaultValue={ev?.ends_at ? toLocalInput(ev.ends_at) : undefined} />
          </div>
        </div>
        {(locations?.length ?? 0) > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="ev-location">{t("locations.title")}</Label>
            <NativeSelect id="ev-location" name="location" defaultValue={ev?.location_id ?? ""} className="w-full">
              <NativeSelectOption value="">–</NativeSelectOption>
              {locations?.map((l) => (
                <NativeSelectOption key={l.id} value={l.id}>
                  {l.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="ev-venue">{t("eventsPage.venueName")}</Label>
          <Input id="ev-venue" name="venue_name" defaultValue={ev?.venue_name ?? ""} maxLength={200} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-address">{t("eventsPage.venueAddress")}</Label>
          <Input id="ev-address" name="venue_address" defaultValue={ev?.venue_address ?? ""} maxLength={500} autoComplete="off" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-description">{t("eventsPage.description")}</Label>
          <textarea
            id="ev-description"
            name="description"
            defaultValue={ev?.description ?? ""}
            maxLength={20000}
            rows={6}
            className="rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ev-capacity">{t("eventsPage.capacity")}</Label>
          <Input id="ev-capacity" name="capacity" type="number" min={1} step={1} defaultValue={ev?.capacity ?? ""} className="sm:max-w-40" />
        </div>
        <CustomFieldInputs defs={defs} values={ev?.custom as CustomValues | undefined} idPrefix="ev-custom" />
        <div className="grid gap-2">
          <Label htmlFor="ev-slug">{t("eventsPage.slug")}</Label>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <span className="shrink-0">/e/</span>
            <Input id="ev-slug" name="slug" defaultValue={ev?.slug} placeholder="sommerfest-2026" pattern="[a-z0-9][a-z0-9\-]{0,78}[a-z0-9]" />
          </div>
        </div>
        {!disabled && (
          <SubmitButton className="justify-self-start">
            {ev ? t("common.save") : t("eventsPage.new")}
          </SubmitButton>
        )}
      </fieldset>
    </form>
  )
}

