"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, ExternalLinkIcon, FileCogIcon, Loader2Icon, PaletteIcon, PlusIcon } from "lucide-react"
import { Puck, type Config, type Data } from "@puckeditor/core"
import "@puckeditor/core/puck.css"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"
import { APP_HOME } from "@/lib/url"
import { createSitePage, createTemplatePage, saveSiteDesign, savePage, trashSitePage, unpublishSitePage, updateSitePage } from "./actions"
import { siteConfig, type SiteMeta, type TemplateKind } from "./blocks"
import { PUCK_DE } from "./puck-de"
import { sanitizePage } from "./sanitize"
import { FONTS, PRESET_KEYS, PRESETS, RADII, readTheme, type Theme } from "./theme"
import "./site.css"

export type EditorPage = { id: string; kind: string; title: string; slug: string; description: string | null; in_nav: boolean; published_at: string | null }

// Same document → same string, whatever the key order (jsonb from the DB sorts keys differently than the editor).
const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v ?? null)

/**
 * The whole website in one full-screen editor (Puck): switch pages, add pages, page settings, design, save drafts,
 * publish. "Veröffentlichen" is only active when the page differs from what is live. Desktop only.
 */
export function SiteEditor({
  page,
  draft,
  published,
  pages,
  theme: initialTheme,
  meta,
  allowed,
  siteRoot,
  templateKinds,
}: {
  page: EditorPage
  draft: unknown
  published: unknown
  pages: EditorPage[]
  theme: Theme
  meta: SiteMeta
  allowed: string[]
  siteRoot: string // public URL of the site, ends with "/"
  templateKinds: TemplateKind[] // module page templates this org can design
}) {
  const t = useT()
  const router = useRouter()
  const canonical = (d: unknown) => stable(sanitizePage(d, allowed, meta.orgId))
  const latest = useRef<Data>(draft as Data)
  const [savedDraft, setSavedDraft] = useState(() => canonical(draft))
  const [live, setLive] = useState(() => (published ? canonical(published) : null))
  const [current, setCurrent] = useState(savedDraft)
  const [busy, setBusy] = useState<string | null>(null)
  const [, start] = useTransition()
  const [dialog, setDialog] = useState<"page" | "new" | "design" | null>(null)
  const [theme, setTheme] = useState<Theme>(initialTheme)

  const config = useMemo(() => {
    const full = siteConfig(t)
    const components = Object.fromEntries(Object.entries(full.components).filter(([k]) => allowed.includes(k)))
    const categories = Object.fromEntries(Object.entries(full.categories ?? {}).map(([k, c]) => [k, { ...c, components: (c.components ?? []).filter((x) => allowed.includes(String(x))) }]))
    return { ...full, components, categories } as unknown as Config
  }, [t, allowed])
  const metadata = useMemo(() => ({ ...meta, theme }), [meta, theme])

  const isTemplate = page.kind !== "page"
  const unsaved = current !== savedDraft
  const changedFromLive = current !== live
  const run = (label: string, fn: () => Promise<{ ok?: string; error?: string; id?: string }>, then?: (r: { id?: string }) => void) => {
    setBusy(label)
    start(async () => {
      const r = await fn()
      setBusy(null)
      if (r.error) return void toast.error(r.error)
      if (r.ok) toast.success(r.ok)
      then?.(r)
    })
  }
  const save = (publish: boolean, data: Data = latest.current) =>
    run(publish ? "publish" : "draft", () => savePage(page.id, data, publish), () => {
      setSavedDraft(canonical(data))
      if (publish) {
        setLive(canonical(data))
        router.refresh()
      }
    })
  // Switching pages saves the draft first, so nothing gets lost.
  const openPage = (id: string) => {
    if (id === page.id) return
    if (!unsaved) return router.push(`/website/${id}/edit`)
    run("draft", () => savePage(page.id, latest.current, false), () => router.push(`/website/${id}/edit`))
  }

  return (
    <div className="h-dvh">
      <Puck
        config={config}
        data={draft as Data}
        metadata={metadata}
        dictionary={t.locale === "de" ? PUCK_DE : undefined}
        headerTitle={page.title}
        headerPath={isTemplate ? t("sites.templates.hint") : `/${page.slug}`}
        height="100dvh"
        onChange={(d) => {
          latest.current = d
          setCurrent(canonical(d))
        }}
        onPublish={(d) => save(true, d)}
        overrides={{
          headerActions: () => (
            <>
              <Button render={<Link href={APP_HOME} />} nativeButton={false} size="sm" variant="ghost" aria-label={t("sites.editorBack")}>
                <ArrowLeftIcon /> {t("sites.toApp")}
              </Button>
              <NativeSelect
                aria-label={t("sites.pages")}
                value={page.id}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === "+") return setDialog("new")
                  if (v.startsWith("tpl:")) return run("page", () => createTemplatePage(v.slice(4) as TemplateKind), (r) => r.id && openPage(r.id))
                  openPage(v)
                }}
                className="h-8 min-w-44"
              >
                <NativeSelectOptGroup label={t("sites.pages")}>
                  {pages
                    .filter((p) => p.kind === "page")
                    .map((p) => (
                      <NativeSelectOption key={p.id} value={p.id}>
                        {p.title}
                        {p.published_at ? "" : ` (${t("sites.draft")})`}
                      </NativeSelectOption>
                    ))}
                  <NativeSelectOption value="+">+ {t("sites.newPage")}</NativeSelectOption>
                </NativeSelectOptGroup>
                {!!templateKinds.length && (
                  <NativeSelectOptGroup label={t("sites.templates.title")}>
                    {templateKinds.map((k) => {
                      const tpl = pages.find((p) => p.kind === k)
                      return tpl ? (
                        <NativeSelectOption key={k} value={tpl.id}>
                          {t.dynamic(`sites.templates.${k}`)}
                        </NativeSelectOption>
                      ) : (
                        <NativeSelectOption key={k} value={`tpl:${k}`}>
                          {t.dynamic(`sites.templates.${k}`)}
                        </NativeSelectOption>
                      )
                    })}
                  </NativeSelectOptGroup>
                )}
              </NativeSelect>
              {!isTemplate && (
                <Button size="sm" variant="outline" onClick={() => setDialog("page")}>
                  <FileCogIcon /> {t("sites.pageSettings")}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setDialog("design")}>
                <PaletteIcon /> {t("sites.design")}
              </Button>
              {page.published_at && !isTemplate && (
                <Button render={<a href={`${siteRoot}${page.slug}`} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="ghost" aria-label={t("sites.open")}>
                  <ExternalLinkIcon />
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={!!busy || !unsaved} onClick={() => save(false)}>
                {busy === "draft" && <Loader2Icon className="animate-spin" />}
                {unsaved ? t("sites.saveDraft") : t("sites.draftSavedShort")}
              </Button>
              <Button size="sm" disabled={!!busy || !changedFromLive} onClick={() => save(true)} title={changedFromLive ? undefined : t("sites.nothingToPublish")}>
                {busy === "publish" && <Loader2Icon className="animate-spin" />}
                {live && !changedFromLive ? t("sites.isLive") : t("sites.publish")}
              </Button>
            </>
          ),
        }}
      />

      <PageDialog
        open={dialog === "page" || dialog === "new"}
        page={dialog === "page" ? page : null}
        busy={busy}
        onClose={() => setDialog(null)}
        onSave={(s) =>
          dialog === "page"
            ? run("page", () => updateSitePage(page.id, s), () => {
                setDialog(null)
                router.refresh()
              })
            : run("page", () => createSitePage(s), (r) => {
                setDialog(null)
                if (r.id) openPage(r.id)
              })
        }
        onUnpublish={() =>
          run("page", () => unpublishSitePage(page.id), () => {
            setLive(null)
            setDialog(null)
            router.refresh()
          })
        }
        onTrash={() => run("page", () => trashSitePage(page.id), () => router.push("/website/edit"))}
      />
      <DesignDialog
        open={dialog === "design"}
        theme={theme}
        busy={busy}
        onChange={setTheme}
        onClose={() => {
          setTheme(initialTheme)
          setDialog(null)
        }}
        onSave={() => run("design", () => saveSiteDesign(theme), () => setDialog(null))}
      />
    </div>
  )
}

function PageDialog({
  open,
  page,
  busy,
  onClose,
  onSave,
  onUnpublish,
  onTrash,
}: {
  open: boolean
  page: EditorPage | null // null = new page
  busy: string | null
  onClose: () => void
  onSave: (s: { title: string; slug: string; description: string; in_nav: boolean }) => void
  onUnpublish: () => void
  onTrash: () => void
}) {
  const t = useT()
  const [sure, setSure] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{page ? t("sites.pageSettings") : t("sites.newPage")}</DialogTitle>
          <DialogDescription>{t("sites.slugHelp")}</DialogDescription>
        </DialogHeader>
        <form
          key={page?.id ?? "new"}
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            onSave({ title: String(fd.get("title")), slug: String(fd.get("slug")), description: String(fd.get("description")), in_nav: fd.get("in_nav") === "on" })
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="sp-title">{t("sites.pageTitle")}</Label>
            <Input id="sp-title" name="title" required maxLength={120} defaultValue={page?.title ?? ""} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sp-slug">{t("sites.slug")}</Label>
            <Input id="sp-slug" name="slug" maxLength={60} defaultValue={page?.slug ?? ""} placeholder="ueber-uns" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sp-desc">{t("sites.description")}</Label>
            <Input id="sp-desc" name="description" maxLength={300} defaultValue={page?.description ?? ""} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="in_nav" defaultChecked={page?.in_nav ?? true} />
            {t("sites.inNav")}
          </label>
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            {page ? (
              <span className="flex flex-wrap gap-2">
                {page.published_at && (
                  <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={onUnpublish}>
                    {t("sites.unpublish")}
                  </Button>
                )}
                <Button type="button" variant={sure ? "destructive" : "outline"} size="sm" disabled={!!busy} onClick={() => (sure ? onTrash() : setSure(true))}>
                  {sure ? t("sites.reallyTrash") : t("sites.toTrash")}
                </Button>
              </span>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={busy === "page"}>
              {busy === "page" && <Loader2Icon className="animate-spin" />}
              {page ? t("sites.save") : <><PlusIcon /> {t("sites.create")}</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Design changes show in the editor right away (theme in Puck's metadata); "Speichern" applies them to the live site.
function DesignDialog({ open, theme, busy, onChange, onClose, onSave }: { open: boolean; theme: Theme; busy: string | null; onChange: (t: Theme) => void; onClose: () => void; onSave: () => void }) {
  const t = useT()
  const set = (patch: Partial<Theme>) => onChange(readTheme({ ...theme, ...patch }))
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} modal={false}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("sites.design")}</DialogTitle>
          <DialogDescription>{t("sites.designHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {PRESET_KEYS.map((k) => {
            const p = PRESETS[k]
            return (
              <button
                key={k}
                type="button"
                onClick={() => set({ preset: k })}
                aria-pressed={theme.preset === k}
                className="grid gap-1 rounded-lg border p-1.5 text-left text-xs aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/30"
              >
                {/* Swatch in the preset's own colours (content, not app styling). */}
                <span className="grid h-10 grid-cols-[2fr_1fr] overflow-hidden rounded border" style={{ background: p.bg }} aria-hidden>
                  <span className="grid content-center gap-1 px-1.5">
                    <span className="h-1 w-8 rounded-full" style={{ background: p.fg }} />
                    <span className="h-2 w-6 rounded-sm" style={{ background: p.primary }} />
                  </span>
                  <span style={{ background: p.card }} />
                </span>
                {t.dynamic(`sites.presets.${k}`)}
              </button>
            )
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="ds-primary">{t("sites.primary")}</Label>
            <span className="flex items-center gap-2">
              <input
                id="ds-primary"
                type="color"
                value={theme.primary ?? PRESETS[theme.preset].primary}
                onChange={(e) => set({ primary: e.target.value })}
                className="size-9 cursor-pointer rounded border bg-transparent"
              />
              {theme.primary && (
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(readTheme({ ...theme, primary: undefined }))}>
                  {t("sites.defaultOption")}
                </Button>
              )}
            </span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ds-font">{t("sites.font")}</Label>
            <NativeSelect id="ds-font" value={theme.font ?? ""} onChange={(e) => onChange(readTheme({ ...theme, font: e.target.value || undefined }))} className="w-full">
              <NativeSelectOption value="">{t("sites.defaultOption")}</NativeSelectOption>
              {FONTS.map((f) => (
                <NativeSelectOption key={f} value={f}>
                  {t.dynamic(`sites.fonts.${f}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="ds-radius">{t("sites.radius")}</Label>
            <NativeSelect id="ds-radius" value={theme.radius ?? ""} onChange={(e) => onChange(readTheme({ ...theme, radius: e.target.value || undefined }))} className="w-full">
              <NativeSelectOption value="">{t("sites.defaultOption")}</NativeSelectOption>
              {RADII.map((r) => (
                <NativeSelectOption key={r} value={r}>
                  {t.dynamic(`sites.radii.${r}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" disabled={busy === "design"} onClick={onSave}>
            {busy === "design" && <Loader2Icon className="animate-spin" />}
            {t("sites.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
