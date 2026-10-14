import { Choice } from "@/components/choice"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import type { Tables } from "@/lib/supabase/types"
import { saveCourse } from "./actions"

export function CourseForm({ t, c, locations, disabled }: { t: T; c?: Tables<"courses"> | null; locations: { id: string; name: string }[]; disabled?: boolean }) {
  return (
    <form action={saveCourse} className="grid gap-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <FormCard id="details" title={t("courses.details")}>
      <div className="grid gap-2">
        <Label htmlFor="c-title">{t("courses.titleLabel")}</Label>
        <Input id="c-title" name="title" required maxLength={200} defaultValue={c?.title ?? ""} disabled={disabled} placeholder={t("courses.titlePlaceholder")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="c-instructor">{t("courses.instructor")}</Label>
          <Input id="c-instructor" name="instructor" maxLength={200} defaultValue={c?.instructor ?? ""} disabled={disabled} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-capacity">{t("courses.capacity")}</Label>
          <TypedInput kind="number" id="c-capacity" name="capacity" min={1} max={10000} inputMode="numeric" defaultValue={c?.capacity ?? ""} placeholder={t("courses.unlimited")} disabled={disabled} />
        </div>
        {locations.length > 0 && (
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="c-location">{t("courses.location")}</Label>
            <Choice id="c-location" name="location_id" label={t("courses.location")} defaultValue={c?.location_id} disabled={disabled} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="c-description">{t("courses.description")}</Label>
        <Textarea id="c-description" name="description" rows={3} maxLength={5000} defaultValue={c?.description ?? ""} disabled={disabled} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="track_attendance" value="1" defaultChecked={c?.track_attendance ?? true} disabled={disabled} className="size-4" />
        {t("courses.trackAttendance")}
      </label>
      </FormCard>
      {!disabled && <SaveBar label={c ? undefined : t("courses.create")} always={!c} />}
    </form>
  )
}
