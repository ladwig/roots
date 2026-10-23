import { ExternalLinkIcon } from "lucide-react"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import type { T } from "@/i18n/translate"
import { discardWebsite, publishWebsite } from "./actions"

/** Draft status of the whole website + "Veröffentlichen" / "Verwerfen" (on every Website page). */
export function PublishBar({ t, pending, url, back }: { t: T; pending: boolean; url: string; back: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <span className="mr-auto text-muted-foreground">{pending ? t("website.pending") : t("website.upToDate")}</span>
      <Button variant="ghost" size="sm" render={<a href={url} target="_blank" rel="noreferrer" />} nativeButton={false}>
        <ExternalLinkIcon /> {t("website.openLive")}
      </Button>
      {pending && (
        <>
          <form action={discardWebsite}>
            <input type="hidden" name="back" value={back} />
            <SubmitButton variant="outline" size="sm" data-confirm="website.confirmDiscard">
              {t("website.discard")}
            </SubmitButton>
          </form>
          <form action={publishWebsite}>
            <input type="hidden" name="back" value={back} />
            <SubmitButton size="sm">{t("website.publish")}</SubmitButton>
          </form>
        </>
      )}
    </div>
  )
}

/** The draft, rendered like the public page (App route /site-preview), next to the editor. */
export function Preview({ t, version, path = "" }: { t: T; version: string; path?: string }) {
  return (
    <div className="grid content-start gap-2 lg:sticky lg:top-4">
      <p className="text-xs text-muted-foreground">{t("website.previewHint")}</p>
      <iframe key={version} src={`/site-preview${path}?v=${encodeURIComponent(version)}`} title={t("website.preview")} className="h-[75vh] w-full rounded-lg border bg-background" />
    </div>
  )
}
