"use client"

import { useActionState, useState } from "react"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { createInvite, type InviteState } from "./actions"

export function InviteForm({ roles }: { roles: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createInvite, {} as InviteState)
  const [copied, setCopied] = useState(false)

  if (state.link)
    return (
      <div className="grid gap-3">
        <p className="text-sm">Send this link to {state.email}. It works once and expires in 7 days.</p>
        <Input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
        <Button
          type="button"
          onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    )

  return (
    <form action={action} className="grid gap-4">
      <Notice error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <NativeSelect id="invite-role" name="role_id" defaultValue={roles.find((r) => r.name === "Member")?.id}>
          {roles.map((r) => (
            <NativeSelectOption key={r.id} value={r.id}>
              {r.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" disabled={pending}>
        Create invite link
      </Button>
    </form>
  )
}
