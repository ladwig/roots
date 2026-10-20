import { LegalPage, legalMeta } from "../legal"

export const generateMetadata = async ({ params }: PageProps<"/s/[site]/impressum">) => legalMeta((await params).site, "imprint")

export default async function Page({ params }: PageProps<"/s/[site]/impressum">) {
  return <LegalPage slug={(await params).site} which="imprint" />
}

export const instant = false
