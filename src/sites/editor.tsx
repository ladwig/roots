"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeftIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react"
import { Puck, type Config, type Data } from "@puckeditor/core"
import "@puckeditor/core/puck.css"
import { toast } from "sonner"
import { savePage } from "@/app/(app)/website/actions"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { siteConfig, type SiteMeta } from "./blocks"
import { PUCK_DE } from "./puck-de"
import "./site.css"

/** Full-screen website editor (Puck) for one page: drag blocks, edit fields, save a draft or publish. Desktop only. */
export function SiteEditor({ page, meta, allowed, viewUrl }: { page: { id: string; title: string; slug: string; draft: unknown }; meta: SiteMeta; allowed: string[]; viewUrl: string }) {
  const t = useT()
  const latest = useRef<Data>(page.draft as Data)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null)
  const [, start] = useTransition()

  // Only the blocks this org may use (module blocks need their module).
  const config = useMemo(() => {
    const full = siteConfig(t)
    const components = Object.fromEntries(Object.entries(full.components).filter(([k]) => allowed.includes(k)))
    const categories = Object.fromEntries(
      Object.entries(full.categories ?? {}).map(([k, c]) => [k, { ...c, components: (c.components ?? []).filter((x) => allowed.includes(String(x))) }]),
    )
    return { ...full, components, categories } as unknown as Config
  }, [t, allowed])

  const save = (publish: boolean, data = latest.current) => {
    setBusy(publish ? "publish" : "draft")
    start(async () => {
      const r = await savePage(page.id, data, publish)
      setBusy(null)
      if (r.error) toast.error(r.error)
      else {
        toast.success(r.ok)
        setDirty(false)
      }
    })
  }

  return (
    <div className="h-dvh">
      <Puck
        config={config}
        data={page.draft as Data}
        metadata={meta}
        dictionary={t.locale === "de" ? PUCK_DE : undefined}
        headerTitle={page.title}
        headerPath={`/${page.slug}`}
        height="100dvh"
        onChange={(d) => {
          latest.current = d
          setDirty(true)
        }}
        onPublish={(d) => save(true, d)}
        overrides={{
          headerActions: ({ children }) => (
            <>
              <Button render={<Link href={`/website?edit=${page.id}`} />} nativeButton={false} size="sm" variant="ghost">
                <ArrowLeftIcon /> {t("sites.editorBack")}
              </Button>
              {page.slug !== null && (
                <Button render={<a href={viewUrl} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="ghost" aria-label={t("sites.open")}>
                  <ExternalLinkIcon />
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => save(false)}>
                {busy === "draft" && <Loader2Icon className="animate-spin" />}
                {dirty ? `${t("sites.saveDraft")} •` : t("sites.saveDraft")}
              </Button>
              {busy === "publish" ? (
                <Button size="sm" disabled>
                  <Loader2Icon className="animate-spin" /> {PUCK_DE["header-publish"]}
                </Button>
              ) : (
                children
              )}
            </>
          ),
        }}
      />
    </div>
  )
}
