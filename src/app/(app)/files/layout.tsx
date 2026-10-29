import { SectionNav } from "@/components/section-nav"
import { getT } from "@/i18n/server"
import { titled } from "@/lib/title"

export const generateMetadata = titled("files.title")

// Dateien: the org's files and the letter templates that produce them (navigation beside the page).
export default async function FilesLayout({ children }: { children: React.ReactNode }) {
  const t = await getT()
  const items = [
    { href: "/files", label: t("nav.overview") },
    { href: "/files/templates", label: t("letters.tabs.templates") },
  ]
  return (
    <div className="grid max-w-6xl gap-6 md:grid-cols-[auto_1fr]">
      <SectionNav label={t("files.title")} items={items} />
      <div className="grid min-w-0 content-start gap-6">{children}</div>
    </div>
  )
}
