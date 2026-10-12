import type { Metadata } from "next"
import { getT } from "@/i18n/server"
import { SiteShell } from "./_components/site-shell"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("landing.meta.title"), description: t("landing.meta.description") }
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>
}
