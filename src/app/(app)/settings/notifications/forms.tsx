"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"
import { createSubscription, rotateSecret, type CreateState } from "./actions"

function SecretOnce({ secret }: { secret: string }) {
  const t = useT()
  return (
    <div className="grid gap-2">
      <Label htmlFor="secret">{t("notifications.secret")}</Label>
      <Input id="secret" readOnly value={secret} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <p className="text-xs text-muted-foreground">{t("notifications.secretHelp")}</p>
    </div>
  )
}

export function CreateForm({ channel, chats = [] }: { channel: "webhook" | "telegram"; chats?: { id: number; title: string }[] }) {
  const t = useT()
  const [state, action, pending] = useActionState(createSubscription, {} as CreateState)
  if (state.id)
    return (
      <div className="grid gap-4">
        {state.secret && <SecretOnce secret={state.secret} />}
        <Button render={<Link href={`?edit=${state.id}`} scroll={false} />} nativeButton={false}>
          {t("notifications.done")}
        </Button>
      </div>
    )
  return (
    <form action={action} className="grid gap-4">
      <Notice error={state.error} />
      <input type="hidden" name="channel" value={channel} />
      <div className="grid gap-2">
        <Label htmlFor="sub-name">{t("notifications.name")}</Label>
        <Input id="sub-name" name="name" maxLength={100} placeholder={t(`notifications.channels.${channel}`)} />
      </div>
      {channel === "webhook" && (
        <div className="grid gap-2">
          <Label htmlFor="sub-url">{t("notifications.url")}</Label>
          <Input id="sub-url" name="url" type="url" required placeholder="https://hooks.zapier.com/…" />
          <p className="text-xs text-muted-foreground">{t("notifications.urlHelp")}</p>
        </div>
      )}
      {channel === "telegram" && (
        <div className="grid gap-2">
          <Label htmlFor="sub-chat">{t("notifications.telegram.chat")}</Label>
          <NativeSelect id="sub-chat" name="chat_id" required>
            {chats.map((c) => (
              <NativeSelectOption key={c.id} value={String(c.id)}>
                {c.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {channel === "webhook" ? t("notifications.newWebhook") : t("notifications.newTelegram")}
      </Button>
    </form>
  )
}

export function RotateSecret({ id }: { id: string }) {
  const t = useT()
  const [state, action, pending] = useActionState(rotateSecret.bind(null, id), {} as CreateState)
  return state.secret ? (
    <SecretOnce secret={state.secret} />
  ) : (
    <form action={action}>
      <Notice error={state.error} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {t("notifications.rotate")}
      </Button>
    </form>
  )
}
