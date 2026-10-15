"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { renewInviteLink } from "./actions"

/** Open invites only store a hash, so renewing issues a fresh link (the old one stops working) and shows it to copy. */
export function InviteLink({ id }: { id: string }) {
  const t = useT()
  const [link, setLink] = useState<string>()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const renew = () =>
    start(async () => {
      const r = await renewInviteLink(id)
      if (!r.link) return void toast.error(r.error)
      setLink(r.link)
      setCopied(false)
      setOpen(true)
    })

  const copy = (close?: boolean) =>
    navigator.clipboard.writeText(link!).then(() => {
      setCopied(true)
      if (close) setOpen(false)
    })

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={renew}>
        {t("members.renewLink")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("members.renewTitle")}</DialogTitle>
            <DialogDescription>{t("members.renewText")}</DialogDescription>
          </DialogHeader>
          <Input readOnly value={link ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label={t("members.inviteLink")} />
          {/* TODO: add a "Resend email" button here that mails the newly created link to the invitee. */}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => copy()}>
              {copied ? t("members.copied") : t("members.copy")}
            </Button>
            <Button type="button" onClick={() => copy(true)}>
              {t("members.copyClose")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
