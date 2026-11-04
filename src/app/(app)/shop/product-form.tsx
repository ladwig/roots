import { Choice } from "@/components/choice"
import { FormCard } from "@/components/page"
import { RichTextEditor } from "@/components/rich-text-editor"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import type { Tables } from "@/lib/supabase/types"
import { PRODUCT_KINDS, PRODUCT_STATUSES, TAX_RATES } from "@/shop/fields"
import { priceInput } from "@/tickets/price"
import { toLocalInput } from "@/lib/time"
import { saveProduct } from "./actions"

export function ProductForm({ t, p, disabled, small }: { t: T; p?: Tables<"products"> | null; disabled?: boolean; small?: boolean }) {
  return (
    <form action={saveProduct} className="grid gap-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      <FormCard id="details" title={t("store.product")}>
        <div className="grid gap-2">
          <Label htmlFor="p-name">{t("store.productName")}</Label>
          <Input id="p-name" name="name" required maxLength={200} defaultValue={p?.name ?? ""} disabled={disabled} placeholder={t("store.productNamePlaceholder")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="p-price">{t("store.priceGross")}</Label>
            <TypedInput kind="money" id="p-price" name="price" required defaultValue={p ? priceInput(p.price_cents) : ""} disabled={disabled} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="name_your_price" value="1" defaultChecked={p?.name_your_price ?? false} disabled={disabled} className="size-4 accent-primary" /> {t("store.nameYourPrice")}
            </label>
            <p className="text-xs text-muted-foreground">{t("store.nameYourPriceHint")}</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor="p-suggested" className="font-normal text-muted-foreground">{t("store.suggestedPrice")}</Label>
              <TypedInput kind="money" id="p-suggested" name="suggested" defaultValue={p?.suggested_cents != null ? priceInput(p.suggested_cents) : ""} disabled={disabled} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-tax">{t("store.taxRate")}</Label>
            <Choice id="p-tax" name="tax_rate" required label={t("store.taxRate")} defaultValue={String(p?.tax_rate ?? 19)} disabled={disabled} options={TAX_RATES.map((r) => ({ value: String(r), label: `${r} %` }))} />
            {small && <p className="text-xs text-muted-foreground">{t("store.smallBusinessApp")}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-kind">{t("store.kind")}</Label>
            <Choice id="p-kind" name="kind" required label={t("store.kind")} defaultValue={p?.kind ?? "physical"} disabled={disabled} options={PRODUCT_KINDS.map((k) => ({ value: k, label: t.dynamic(`store.kinds.${k}`) }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-status">{t("store.status")}</Label>
            <Choice id="p-status" name="status" required label={t("store.status")} defaultValue={p?.status ?? "draft"} disabled={disabled} options={PRODUCT_STATUSES.map((s) => ({ value: s, label: t.dynamic(`store.statuses.${s}`) }))} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-stock">{t("store.stock")}</Label>
            <TypedInput kind="number" id="p-stock" name="stock" min={0} inputMode="numeric" defaultValue={p?.stock ?? ""} placeholder={t("store.unlimited")} disabled={disabled} />
            <p className="text-xs text-muted-foreground">{t("store.stockHint")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-max">{t("store.maxPerOrder")}</Label>
            <TypedInput kind="number" id="p-max" name="max_per_order" min={1} max={100} inputMode="numeric" defaultValue={p?.max_per_order ?? 10} disabled={disabled} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-release">{t("store.releaseOn")}</Label>
            <TypedInput kind="date" id="p-release" name="release_on" defaultValue={p?.release_at ? toLocalInput(p.release_at).slice(0, 10) : ""} disabled={disabled} />
            <p className="text-xs text-muted-foreground">{t("store.releaseHint")}</p>
          </div>
        </div>
      </FormCard>
      <FormCard id="page" title={t("store.productPage")}>
        <div className="grid gap-2">
          <Label htmlFor="p-description">{t("store.description")}</Label>
          {disabled ? <div className="text-sm text-muted-foreground">{p?.description ? t("store.descriptionSet") : "–"}</div> : <RichTextEditor id="p-description" name="description" defaultValue={p?.description ?? ""} />}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="p-category">{t("store.category")}</Label>
            <Input id="p-category" name="category" maxLength={60} defaultValue={p?.category ?? ""} disabled={disabled} placeholder={t("store.categoryPlaceholder")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="p-slug">{t("store.slug")}</Label>
            <Input id="p-slug" name="slug" maxLength={80} defaultValue={p?.slug ?? ""} disabled={disabled} placeholder={t("store.slugPlaceholder")} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="p-video">{t("store.video")}</Label>
            <TypedInput kind="url" id="p-video" name="video_url" defaultValue={p?.video_url ?? ""} disabled={disabled} placeholder="https://youtube.com/watch?v=…" />
            <p className="text-xs text-muted-foreground">{t("store.videoHint")}</p>
          </div>
        </div>
      </FormCard>
      {!disabled && <SaveBar label={p ? undefined : t("store.createProduct")} always={!p} />}
    </form>
  )
}
