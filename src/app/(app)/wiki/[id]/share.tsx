"use client"

import { useState } from "react"
import { CheckIcon, LinkIcon, LockIcon, Share2Icon, UsersIcon } from "lucide-react"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/client"
import { setVisibilityAction } from "../actions"

type Role = { id: string; label: string }

// "Teilen" (top right of a page): copy the link; writers set who may read the page (or leave it like the parent).
export function ShareButton({
  pageId,
  canManage,
  own,
  roleIds,
  inherited,
  hasParent,
  roles,
}: {
  pageId: string
  canManage: boolean
  own: string | null // the page's own setting (null = like the parent)
  roleIds: string[]
  inherited: { visibility: string; fromTitle: string | null } // what applies when `own` is null
  hasParent: boolean
  roles: Role[]
}) {
  const t = useT()
  const [choice, setChoice] = useState(own ?? (hasParent ? "" : "team"))
  const [copied, setCopied] = useState(false)
  const effective = own ?? inherited.visibility
  const copy = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const option = (value: string, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="radio" name="visibility" value={value} checked={choice === value} onChange={() => setChoice(value)} className="mt-0.5 size-4" disabled={!canManage} />
      <span className="grid">
        <span>{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )

  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {effective === "roles" ? <LockIcon /> : <Share2Icon />} {t("wiki.share.button")}
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-4">
        <form action={setVisibilityAction} className="grid gap-3">
          <input type="hidden" name="id" value={pageId} />
          <p className="text-sm font-medium">{t("wiki.share.who")}</p>
          {hasParent &&
            option(
              "",
              t("wiki.share.inherit"),
              t("wiki.share.inheritHint", { what: t.dynamic(`wiki.share.short.${inherited.visibility}`), page: inherited.fromTitle ?? t("wiki.share.default") }),
            )}
          {option("team", t("wiki.share.team"), t("wiki.share.teamHint"))}
          {option("roles", t("wiki.share.roles"), t("wiki.share.rolesHint"))}
          {choice === "roles" && (
            <fieldset className="ml-6 grid gap-1.5" disabled={!canManage}>
              <legend className="sr-only">{t("wiki.share.roles")}</legend>
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="role_ids" value={r.id} defaultChecked={roleIds.includes(r.id)} className="size-4" />
                  {r.label}
                </label>
              ))}
            </fieldset>
          )}
          {canManage && (
            <SubmitButton size="sm" className="justify-self-start">
              {t("common.save")}
            </SubmitButton>
          )}
        </form>
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {effective === "roles" ? <LockIcon className="size-3.5" /> : <UsersIcon className="size-3.5" />}
            {t.dynamic(`wiki.share.short.${effective}`)}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={copy}>
            {copied ? <CheckIcon /> : <LinkIcon />} {copied ? t("wiki.share.copied") : t("wiki.share.copy")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
