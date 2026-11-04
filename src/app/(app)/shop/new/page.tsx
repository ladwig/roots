import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { ProductForm } from "../product-form"

export default async function NewProductPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("shop.manage")
  if (!ctx.modules.has("shop")) notFound()
  const [t, sp, { data: billing }] = await Promise.all([getT(), searchParams, ctx.supabase.from("org_billing").select("tax_mode").eq("org_id", ctx.org.id).maybeSingle()])
  return (
    <NewPage list={{ href: "/shop", label: t("store.products") }} title={t("store.newProduct")} error={param(sp, "error")}>
      <ProductForm t={t} small={billing?.tax_mode === "small_business"} />
    </NewPage>
  )
}

export const instant = false
