"use client"

import { useEffect, useState, useTransition } from "react"
import { FingerprintIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useT } from "@/i18n/client"
import { createClient } from "@/lib/supabase/client"

type Passkey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string }

// The signed-in person's passkeys (Supabase Auth): add one (the browser asks for Face ID / Touch ID / a key),
// see them, remove them. Passkeys belong to the domain they were made on.
export function Passkeys() {
  const t = useT()
  const [list, setList] = useState<Passkey[] | null>(null)
  const [pending, start] = useTransition()
  const [supported, setSupported] = useState(true)
  const load = () =>
    createClient()
      .auth.passkey.list()
      .then(({ data }) => {
        setList(data ?? [])
        setSupported("PublicKeyCredential" in window)
      })
  useEffect(() => {
    load()
  }, [])

  return (
    <div className="grid gap-3">
      {list === null ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : list.length ? (
        <ul className="divide-y rounded-lg border">
          {list.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FingerprintIcon className="size-4 text-muted-foreground" aria-hidden />
              <span className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{p.friendly_name || t("passkeys.unnamed")}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {t("passkeys.added", { date: t.date(p.created_at, { dateStyle: "medium" }) })}
                  {p.last_used_at && ` · ${t("passkeys.used", { date: t.date(p.last_used_at, { dateStyle: "medium" }) })}`}
                </span>
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("passkeys.remove")}
                      disabled={pending}
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        start(async () => {
                          const { error } = await createClient().auth.passkey.delete({ passkeyId: p.id })
                          if (error) toast.error(error.message)
                          else toast.success(t("passkeys.removed"))
                          await load()
                        })
                      }
                    />
                  }
                >
                  <Trash2Icon />
                </TooltipTrigger>
                <TooltipContent>{t("passkeys.remove")}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("passkeys.none")}</p>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        disabled={pending || !supported}
        onClick={() =>
          start(async () => {
            const { error } = await createClient().auth.registerPasskey()
            if (error) {
              if (!/abort|cancel|NotAllowed/i.test(`${error.name} ${error.message}`)) toast.error(t("passkeys.failed"))
            } else toast.success(t("passkeys.addedOk"))
            await load()
          })
        }
      >
        <PlusIcon /> {pending ? t("passkeys.waiting") : t("passkeys.add")}
      </Button>
      {!supported && <p className="text-xs text-muted-foreground">{t("passkeys.unsupported")}</p>}
    </div>
  )
}
