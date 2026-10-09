"use client"

import { useActionState } from "react"
import { CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"
import { createApiKey } from "./actions"

// New key: name + permissions; afterwards the key is shown exactly once.
export function NewKey({ groups }: { groups: { module: string; label: string; perms: { key: string; label: string }[] }[] }) {
  const t = useT()
  const [state, action] = useActionState(createApiKey, {})
  if (state.key)
    return (
      <div className="grid gap-3 rounded-lg border border-primary p-4">
        <p className="font-medium">{t("api.createdTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("api.createdHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 text-sm break-all">{state.key}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(state.key!).then(() => toast.success(t("api.copied")))}
          >
            <CopyIcon /> {t("api.copy")}
          </Button>
        </div>
      </div>
    )
  return (
    <form action={action} className="grid gap-4 rounded-lg border p-4">
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="key-name">{t("api.name")}</Label>
        <Input id="key-name" name="name" required maxLength={100} placeholder={t("api.namePlaceholder")} />
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{t("api.permissions")}</legend>
        {groups.map((g) => (
          <div key={g.module} className="grid gap-1">
            <p className="text-xs text-muted-foreground">{g.label}</p>
            {g.perms.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="permissions" value={p.key} className="size-4" />
                {p.label} <span className="font-mono text-xs text-muted-foreground">{p.key}</span>
              </label>
            ))}
          </div>
        ))}
      </fieldset>
      <SubmitButton className="justify-self-start">{t("api.create")}</SubmitButton>
    </form>
  )
}
