"use server"

import { getT } from "@/i18n/server"
import { back, sitePath } from "@/lib/url"
import { addViaLink } from "@/guestlists/server"

// Public: anyone with the link. Validation + quota + open/closed are enforced in guest_link_add().
export async function signUp(fd: FormData) {
  const t = await getT()
  const site = String(fd.get("site") ?? "")
  const token = String(fd.get("token") ?? "")
  const here = sitePath(site, `/g/${token}`)
  const by = String(fd.get("by") ?? "").trim().slice(0, 200)
  const email = String(fd.get("email") ?? "").trim().slice(0, 320) || null
  const names = fd.getAll("name").map((n) => String(n).trim().slice(0, 200)).filter(Boolean)
  if (!by) back(here, { error: t("guestlists.byMissing") })
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) back(here, { error: t("errors.invalid_email") })
  let added = 0
  try {
    added = await addViaLink(token, by, names, email)
  } catch (e) {
    const key = e instanceof Error ? e.message : ""
    back(here, { error: t.has(key) ? t.dynamic(key) : t("errors.invalid_input") })
  }
  back(here, { ok: t("guestlists.thanks", { count: added }) })
}
