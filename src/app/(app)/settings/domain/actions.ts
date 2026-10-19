"use server"

import { checkDomain, connectDomain, removeDomain } from "@/domains/server"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"

const PATH = "/settings/domain"

export async function connectDomainAction(fd: FormData) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  try {
    await connectDomain(ctx.org.id, String(fd.get("domain") ?? ""))
  } catch (e) {
    back(PATH, { error: t.dynamic((e as Error).message.startsWith("domains.") ? (e as Error).message : "domains.failed") })
  }
  back(PATH, { ok: t("domains.added") })
}

/** "Jetzt prüfen" and the page's automatic check: the current status. */
export async function checkDomainAction() {
  const ctx = await requirePerm("org.settings.manage")
  const row = await checkDomain(ctx.org.id)
  if (row?.status === "active") deliverSoon()
  return row?.status ?? null
}

export async function removeDomainAction() {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  try {
    await removeDomain(ctx.org.id)
  } catch {
    back(PATH, { error: t("domains.failed") })
  }
  back(PATH, { ok: t("domains.removed") })
}

export async function checkNowAction() {
  const t = await getT()
  const status = await checkDomainAction()
  back(PATH, status === "active" ? { ok: t("domains.nowLive") } : {})
}
