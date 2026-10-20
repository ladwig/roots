import { LegalPage, legalMeta } from "../legal"

export const generateMetadata = async ({ params }: PageProps<"/s/[site]/datenschutz">) => legalMeta((await params).site, "privacy")

export default async function Page({ params }: PageProps<"/s/[site]/datenschutz">) {
  return <LegalPage slug={(await params).site} which="privacy" />
}

export const instant = false
