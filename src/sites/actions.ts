"use server"

import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { replaceImage } from "@/lib/images"

/** Image upload from the website editor → orgs/<org>/site/<uuid>.<ext> in the public images bucket. */
export async function uploadSiteImage(fd: FormData): Promise<{ path?: string; error?: string }> {
  const ctx = await requirePerm("sites.manage")
  const t = await getT()
  const r = await replaceImage(ctx.supabase, `orgs/${ctx.org.id}/site`, fd.get("file"))
  return "path" in r ? { path: r.path } : { error: t.dynamic(`errors.${r.error}`) }
}
