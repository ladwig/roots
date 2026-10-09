import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { formatValue, type CustomValues, type FieldDef } from "@/lib/custom-fields"

// Inputs for an entity's custom fields (form names "custom.<key>", read back with readCustom()).
export function CustomFieldInputs({ defs, values, idPrefix }: { defs: FieldDef[]; values?: CustomValues; idPrefix: string }) {
  if (!defs.length) return null
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {defs.map((d) => {
        const id = `${idPrefix}-${d.key}`
        const name = `custom.${d.key}`
        const value = formatValue(values?.[d.key])
        if (d.type === "boolean")
          return (
            <label key={d.key} className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name={name} value="1" defaultChecked={value === "1"} className="size-4" />
              {d.label}
            </label>
          )
        return (
          <div key={d.key} className="grid gap-2">
            <Label htmlFor={id}>
              {d.label}
              {d.required && <span aria-hidden> *</span>}
            </Label>
            {d.type === "select" ? (
              <NativeSelect id={id} name={name} defaultValue={value} required={d.required} className="w-full">
                <NativeSelectOption value="">–</NativeSelectOption>
                {d.options.map((o) => (
                  <NativeSelectOption key={o} value={o}>
                    {o}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : (
              <Input
                id={id}
                name={name}
                defaultValue={value}
                required={d.required}
                type={d.type === "number" ? "number" : d.type === "date" ? "date" : d.type === "email" ? "email" : d.type === "url" ? "url" : "text"}
                step={d.type === "number" ? "any" : undefined}
                maxLength={d.type === "text" ? 2000 : undefined}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
