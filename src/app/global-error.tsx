"use client"

import "./globals.css"
import { THEME_SCRIPT } from "@/components/theme-switch"
import { messages } from "@/i18n/config"

// The root layout itself failed: no I18nProvider, no fonts, own document. The texts are imported, never loaded later:
// this page often shows because chunks went missing (new deploy), and a second load could fail too (blank page).
// The catalogs cost nothing extra, src/i18n/client.tsx already puts them into every bundle.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  // Prerendered without navigator (German), then the browser's language: the text may differ, hence suppressHydrationWarning.
  const lang = typeof navigator !== "undefined" && navigator.language.startsWith("en") ? "en" : "de"
  const page = messages[lang].errors.page
  return (
    <html lang={lang} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <title suppressHydrationWarning>{page.errorTitle}</title>
      </head>
      <body className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
        <div className="grid max-w-sm justify-items-center gap-3 text-center">
          <p className="font-medium" suppressHydrationWarning>
            {page.errorTitle}
          </p>
          <p className="text-sm text-muted-foreground" suppressHydrationWarning>
            {page.errorText}
          </p>
          <button type="button" onClick={() => retry()} className="h-8 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground" suppressHydrationWarning>
            {page.retry}
          </button>
        </div>
      </body>
    </html>
  )
}
