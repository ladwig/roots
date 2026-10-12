import { notFound } from "next/navigation"
import { PublicSitePage } from "@/sites/public"

// Generated from the org's invoice settings (only for orgs with a published website).
export default async function Legal({ params }: PageProps<"/s/[site]/imprint">) {
  const { site } = await params
  return (await PublicSitePage({ site, slug: "", legal: "imprint" })) ?? notFound()
}

export const instant = false
