import Link from "next/link"
import { getT } from "@/i18n/server"
import { sitePath } from "@/lib/url"
import { cleanCss, cleanHtml } from "@/site/html"
import { fontsHref, themeCss, type Theme } from "@/site/theme"
import { cn } from "@/lib/utils"

export type FrameContent = { theme: Theme; css: string | null; header_html: string | null; footer_html: string | null; imprint: string | null; privacy: string | null }

/**
 * Around every public page of an org: its brand (theme tokens, fonts, own CSS), its header and footer HTML, and the
 * Impressum / Datenschutz links. Org HTML/CSS is cleaned when saved and again here (src/site/html.ts).
 */
export async function SiteFrame({ slug, content, children }: { slug: string; content: FrameContent | null; children: React.ReactNode }) {
  const t = await getT()
  const theme = content?.theme ?? {}
  const fonts = fontsHref(theme)
  const css = [themeCss(theme), content?.css ? cleanCss(content.css) : ""].filter(Boolean).join("\n")
  return (
    <div className={cn("site-theme min-h-svh", theme.mode === "dark" && "dark")}>
      {/* Org fonts + CSS: the brand of this org's public pages only. */}
      {fonts && <link rel="stylesheet" href={fonts} />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {content?.header_html && <div className="site-header" dangerouslySetInnerHTML={{ __html: cleanHtml(content.header_html) }} />}
      {children}
      {content?.footer_html && <div className="site-footer" dangerouslySetInnerHTML={{ __html: cleanHtml(content.footer_html) }} />}
      {(content?.imprint || content?.privacy) && (
        <footer className="mx-auto flex max-w-2xl flex-wrap gap-4 px-4 pt-4 pb-10 text-sm text-muted-foreground">
          {content.imprint && (
            <Link href={sitePath(slug, "/impressum")} className="hover:text-foreground">
              {t("site.imprint")}
            </Link>
          )}
          {content.privacy && (
            <Link href={sitePath(slug, "/datenschutz")} className="hover:text-foreground">
              {t("site.privacy")}
            </Link>
          )}
        </footer>
      )}
    </div>
  )
}
