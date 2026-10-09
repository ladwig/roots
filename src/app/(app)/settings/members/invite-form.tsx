"use client"

import { useActionState, useState } from "react"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"
import { createInvite, type InviteState } from "./actions"

export function InviteForm({ roles, defaultRoleId }: { roles: { id: string; name: string }[]; defaultRoleId?: string }) {
  const t = useT()
  const [state, action, pending] = useActionState(createInvite, {} as InviteState)
  const [copied, setCopied] = useState(false)

  if (state.link)
    return (
      <div className="grid gap-3">
        <p className="text-sm">{t("members.sendLink", { email: state.email! })}</p>
        <Input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} aria-label={t("members.inviteLink")} />
        <Button
          type="button"
          onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true))}
        >
          {copied ? t("members.copied") : t("members.copy")}
        </Button>
      </div>
    )

  return (
    <form action={action} className="grid gap-4">
      <Notice error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="invite-email">{t("members.email")}</Label>
        <Input id="invite-email" name="email" type="email" required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-role">{t("members.role")}</Label>
        <NativeSelect id="invite-role" name="role_id" defaultValue={defaultRoleId}>
          {roles.map((r) => (
            <NativeSelectOption key={r.id} value={r.id}>
              {r.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending}>
        {t("members.createLink")}
      </Button>
    </form>
  )
}
