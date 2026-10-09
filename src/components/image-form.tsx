import { Picture } from "@/components/picture"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { SubmitButton } from "@/components/submit-button"

// Upload / remove one picture (profile picture, org logo). `hidden` fields go along with both buttons.
export async function ImageForm(props: {
  action: (formData: FormData) => Promise<void>
  id: string
  label: string
  hint: string
  name: string
  path?: string | null
  square?: boolean
  hidden?: Record<string, string>
}) {
  const t = await getT()
  const hidden = Object.entries(props.hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)
  return (
    <div className="grid gap-2">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        <Picture path={props.path} name={props.name} size="lg" square={props.square} />
        <form action={props.action} className="flex flex-wrap items-center gap-2">
          {hidden}
          <Input id={props.id} name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" required className="max-w-60" />
          <SubmitButton size="sm">
            {t("common.upload")}
          </SubmitButton>
        </form>
        {props.path && (
          <form action={props.action}>
            {hidden}
            <input type="hidden" name="remove" value="1" />
            <SubmitButton size="sm" variant="ghost">
              {t("common.removeImage")}
            </SubmitButton>
          </form>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{props.hint}</p>
    </div>
  )
}
