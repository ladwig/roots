import { MultiSelect } from "@/components/multi-select"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"

export type ChoiceOption = { value: string; label: string }

/**
 * Pick one value; the control follows the number of options so every screen decides the same way:
 * ≤ 5 → segmented buttons (all visible, one tap) · 6–15 → dropdown · > 15 → search dropdown.
 * Posts `name` like a select. Not `required` → an empty choice ("–") is offered.
 */
export function Choice({ name, options, defaultValue, required, disabled, id, label, className }: { name: string; options: ChoiceOption[]; defaultValue?: string | null; required?: boolean; disabled?: boolean; id?: string; label?: string; className?: string }) {
  if (options.length <= 5)
    return (
      <div role="radiogroup" id={id} aria-label={label} className={cn("flex flex-wrap gap-1 rounded-lg bg-muted p-1 has-disabled:opacity-60", className)}>
        {!required && <Segment name={name} value="" label="–" checked={!defaultValue} disabled={disabled} />}
        {options.map((o) => (
          <Segment key={o.value} name={name} value={o.value} label={o.label} checked={defaultValue === o.value} disabled={disabled} required={required} />
        ))}
      </div>
    )
  if (options.length <= 15)
    return (
      <NativeSelect id={id} name={name} defaultValue={defaultValue ?? ""} required={required} disabled={disabled} aria-label={label} className={cn("w-full", className)}>
        {!required && <NativeSelectOption value="">–</NativeSelectOption>}
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    )
  return <MultiSelect id={id} name={name} options={options} defaultValue={defaultValue ? [defaultValue] : []} single disabled={disabled} />
}

function Segment({ name, value, label, checked, disabled, required }: { name: string; value: string; label: string; checked: boolean; disabled?: boolean; required?: boolean }) {
  return (
    <label className="relative flex min-h-7 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground transition-colors select-none hover:text-foreground has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/50">
      <input type="radio" name={name} value={value} defaultChecked={checked} disabled={disabled} required={required} className="sr-only" />
      {label}
    </label>
  )
}
