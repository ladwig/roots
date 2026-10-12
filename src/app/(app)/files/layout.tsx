import { NavLink } from "@/components/nav-link"
import { getT } from "@/i18n/server"
import { titled } from "@/lib/title"

export const generateMetadata = titled("files.title")

// Dateien: the org's files and the letter templates that produce them.
export default async function FilesLayout({ children }: { children: React.ReactNode }) {
  const t = await getT()
  return (
    <div className="grid max-w-5xl gap-6">
      <nav aria-label={t("files.title")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
        <NavLink href="/files" exact>
          {t("letters.tabs.files")}
        </NavLink>
        <NavLink href="/files/templates">{t("letters.tabs.templates")}</NavLink>
      </nav>
      {children}
    </div>
  )
}
