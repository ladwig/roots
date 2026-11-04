import Link from "next/link"
import { notFound } from "next/navigation"
import { ExternalLinkIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { FileList } from "@/components/file-list"
import { Notice } from "@/components/notice"
import { FormCard, Page, PageHeader, RecordLayout } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { imageUrl } from "@/lib/images"
import { createAdminClient } from "@/lib/supabase/admin"
import { param, siteUrl } from "@/lib/url"
import { priceInput } from "@/tickets/price"
import { productImage, restoreProduct, saveOptions, saveTrack, saveTrackPrice, saveVariant, saveVariants, trashProduct } from "../actions"
import { SaveBar } from "@/components/save-bar"
import { MultiSelect } from "@/components/multi-select"
import type { ProductOption } from "@/shop/fields"
import { Label } from "@/components/ui/label"
import { productTrackList } from "@/shop/audio"
import { AutoRefresh } from "@/app/s/[site]/t/[order]/auto-refresh"
import { AudioUpload } from "./audio-upload"
import { ProductForm } from "../product-form"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`

// One product in tabs (?tab=): Produkt (details, page text, pictures) · Varianten (stock left) · Musik & Downloads.
export default async function ProductPage({ params, searchParams }: PageProps<"/shop/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("shop.manage")
  const [{ data: p }, { data: variants }, tracks, { data: billing }] = await Promise.all([
    ctx.supabase.from("products").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("product_variants").select("*").eq("product_id", id).eq("org_id", ctx.org.id).order("position").order("created_at"),
    productTrackList(ctx.supabase, ctx.org.id, id),
    ctx.supabase.from("org_billing").select("tax_mode").eq("org_id", ctx.org.id).maybeSingle(),
  ])
  if (!p) notFound()
  // Units still free (stock − paid − held by open orders); the product's own stock only counts without variants.
  const admin = createAdminClient()
  const items = variants?.length ? variants.map((v) => ({ id: v.id, stock: v.stock })) : [{ id: p.id, stock: p.stock }]
  const left = new Map(await Promise.all(items.map(async (i) => [i.id, i.stock === null ? null : (await admin.rpc("shop_left", { p_item: i.id, p_stock: i.stock })).data] as const)))
  const leftLabel = (itemId: string, stock: number | null) => (stock === null ? t("store.unlimited") : t("store.leftOf", { left: Math.max(0, left.get(itemId) ?? 0), stock }))
  const here = `/shop/${id}`
  const options = (p.options ?? []) as ProductOption[]
  const zips = (p.audio_zips ?? {}) as { zip?: { size: number } }
  // Conversions / ZIPs still running: the page reloads itself until they're done.
  const busyAudio = tracks.some((x) => x.status === "pending" || x.status === "processing") || (tracks.some((x) => x.status === "ready") && !Object.keys(zips).length)
  const tab = param(sp, "tab") === "variants" ? "variants" : param(sp, "tab") === "digital" ? "digital" : "product"

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/shop", label: t("store.products") }, { label: p.name }]}
        title={p.name}
        badge={<Badge variant={p.status === "published" ? "default" : "secondary"}>{t.dynamic(`store.statuses.${p.status}`)}</Badge>}
        meta={[t.money(p.price_cents, "eur"), p.category, p.release_at && t("store.releaseShort", { date: t.date(p.release_at, { dateStyle: "medium" }) })].filter(Boolean).join(" · ")}
        actions={
          p.status === "published" && (
            <a href={siteUrl(ctx.org.slug, `/shop/${p.slug}`, ctx.org.site_domain)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm hover:bg-muted">
              <ExternalLinkIcon className="size-4" /> {t("store.viewPublic")}
            </a>
          )
        }
        menu={
          canManage &&
          !p.deleted_at && (
            <ActionsMenu>
              <MenuSubmit form="trash-product" icon={<Trash2Icon />} destructive>
                {t("store.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
      />
      {canManage && !p.deleted_at && (
        <form id="trash-product" action={trashProduct} hidden>
          <input type="hidden" name="id" value={p.id} />
        </form>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      {p.deleted_at ? (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("store.inTrash")}</p>
          {canManage && (
            <form action={restoreProduct}>
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton>{t("store.restore")}</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <>
          {/* Same tab row as an event's page (Übersicht · Lineup · …), here as ?tab= on one page. */}
          <nav aria-label={t("store.productTabs")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1 pb-2">
            {[
              { key: "product", href: here, label: t("store.tabProduct") },
              { key: "variants", href: `${here}?tab=variants`, label: t("store.tabVariants", { count: variants?.length ?? 0 }) },
              { key: "digital", href: `${here}?tab=digital`, label: t("store.tabDigital") },
            ].map((x) => (
              <Link
                key={x.key}
                href={x.href}
                aria-current={tab === x.key ? "page" : undefined}
                className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {x.label}
              </Link>
            ))}
          </nav>
          {tab === "variants" ? (
            <div className="grid gap-6">
              <FormCard id="options" title={t("store.options")} description={t("store.optionsHint")}>
                {/* Up to 3 options; saving makes one variant per combination (existing combinations keep stock/price). */}
                <form action={saveOptions} className="grid gap-2">
                  <input type="hidden" name="product_id" value={p.id} />
                  {[...options, ...Array(Math.max(0, Math.min(3, options.length + 1) - options.length)).fill(null)].map((o: { name: string; values: string[] } | null, i) => (
                    <div key={o?.name ?? `new-${i}`} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                      <Input name="option_name" defaultValue={o?.name ?? ""} maxLength={40} placeholder={t("store.optionNamePlaceholder")} aria-label={t("store.optionName")} disabled={!canManage} />
                      <MultiSelect name="option_values" joined creatable options={(o?.values ?? []).map((v) => ({ value: v, label: v }))} defaultValue={o?.values ?? []} disabled={!canManage} placeholder={t("store.optionValuesPlaceholder")} />
                    </div>
                  ))}
                  {canManage && (
                    <SubmitButton size="sm" variant="outline" className="justify-self-start" data-confirm={variants?.length ? "store.confirmOptions" : undefined}>
                      {t("store.saveOptions")}
                    </SubmitButton>
                  )}
                </form>
              </FormCard>

              <FormCard id="variants" title={t("store.variants")} description={t("store.variantsHint")}>
                {!variants?.length && <p className="text-sm text-muted-foreground">{t("store.noVariants", { left: leftLabel(p.id, p.stock) })}</p>}
                {variants?.length ? (
                  <form action={saveVariants} className="grid gap-3">
                    <input type="hidden" name="product_id" value={p.id} />
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                          <tr>
                            <th className="px-2 py-2 font-medium">{t("store.variantName")}</th>
                            <th className="px-2 py-2 font-medium">{t("store.price")}</th>
                            <th className="px-2 py-2 font-medium">{t("store.stock")}</th>
                            <th className="px-2 py-2 font-medium">{t("store.leftColumn")}</th>
                            {p.images.length > 0 && <th className="px-2 py-2 font-medium">{t("store.variantImage")}</th>}
                            <th className="px-2 py-2 text-center font-medium">{t("store.variantActive")}</th>
                            <th className="px-2 py-2 text-center font-medium">{t("store.variantDigital")}</th>
                            <th className="px-2 py-2 text-center font-medium" title={t("store.nameYourPriceHint")}>{t("store.variantNyp")}</th>
                            {canManage && <th className="w-10" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {variants.map((v) => {
                            const f = (k: string) => `${k}_${v.id}`
                            return (
                              <tr key={v.id} className="align-middle">
                                <td className="min-w-40 px-2 py-1.5">
                                  <input type="hidden" name="variant" value={v.id} />
                                  <input type="hidden" name={f("has_active")} value="1" />
                                  <input type="hidden" name={f("has_nyp")} value="1" />
                                  {v.option_values ? (
                                    <>
                                      <input type="hidden" name={f("name")} value={v.name} />
                                      <span className="font-medium">{v.option_values.join(" / ")}</span>
                                    </>
                                  ) : (
                                    <Input name={f("name")} defaultValue={v.name} required maxLength={100} aria-label={t("store.variantName")} disabled={!canManage} />
                                  )}
                                </td>
                                <td className="w-28 px-2 py-1.5">
                                  <TypedInput kind="money" name={f("price")} defaultValue={v.price_cents === null ? "" : priceInput(v.price_cents)} placeholder={priceInput(p.price_cents)} aria-label={t("store.price")} disabled={!canManage} />
                                </td>
                                <td className="w-24 px-2 py-1.5">
                                  <TypedInput kind="number" name={f("stock")} min={0} defaultValue={v.stock ?? ""} placeholder="∞" aria-label={t("store.stock")} disabled={!canManage} />
                                </td>
                                <td className="px-2 py-1.5 text-xs whitespace-nowrap text-muted-foreground">{leftLabel(v.id, v.stock)}</td>
                                {p.images.length > 0 && (
                                  <td className="px-2 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      {v.image_path && (
                                        // eslint-disable-next-line @next/next/no-img-element -- public bucket URL
                                        <img src={imageUrl(v.image_path)} alt="" className="size-7 rounded border object-cover" />
                                      )}
                                      <select name={f("image")} defaultValue={v.image_path ?? ""} disabled={!canManage} aria-label={t("store.variantImage")} className="h-8 rounded-md border bg-transparent px-1 text-xs">
                                        <option value="">–</option>
                                        {p.images.map((path, i) => (
                                          <option key={path} value={path}>
                                            {t("store.imageN", { n: i + 1 })}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </td>
                                )}
                                <td className="px-2 py-1.5 text-center">
                                  <input type="checkbox" name={f("active")} value="1" defaultChecked={v.active} disabled={!canManage} aria-label={t("store.variantActive")} className="size-4 accent-primary" />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <input type="checkbox" name={f("digital")} value="1" defaultChecked={v.digital} disabled={!canManage} aria-label={t("store.variantDigital")} className="size-4 accent-primary" />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <input type="checkbox" name={f("name_your_price")} value="1" defaultChecked={v.name_your_price ?? p.name_your_price} disabled={!canManage} aria-label={t("store.variantNyp")} className="size-4 accent-primary" />
                                </td>
                                {canManage && (
                                  <td className="px-1 py-1.5">
                                    <SubmitButton size="icon-sm" variant="ghost" form={`del-${v.id}`} data-confirm="store.confirmDeleteVariant" aria-label={t("store.deleteVariant")}>
                                      <Trash2Icon />
                                    </SubmitButton>
                                  </td>
                                )}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {canManage && <SaveBar />}
                  </form>
                ) : null}
                {variants?.map((v) => (
                  <form key={v.id} id={`del-${v.id}`} action={saveVariant} hidden>
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="product_id" value={p.id} />
                    <input type="hidden" name="delete" value="1" />
                  </form>
                ))}
                {canManage && !options.length && (
                  <form action={saveVariant} className="grid grid-cols-[1fr_6rem_5rem] items-center gap-2 rounded-lg border border-dashed p-2">
                    <input type="hidden" name="product_id" value={p.id} />
                    <input type="hidden" name="position" value={variants?.length ?? 0} />
                    <Input name="name" required maxLength={100} placeholder={t("store.variantPlaceholder")} aria-label={t("store.variantName")} />
                    <TypedInput kind="money" name="price" placeholder={priceInput(p.price_cents)} aria-label={t("store.price")} />
                    <TypedInput kind="number" name="stock" min={0} placeholder="∞" aria-label={t("store.stock")} />
                    <label className="col-span-3 flex items-center gap-1 text-xs text-muted-foreground">
                      <input type="checkbox" name="digital" value="1" className="accent-primary" /> {t("store.variantDigitalHint")}
                    </label>
                    <SubmitButton size="sm" className="col-span-3 justify-self-start">
                      {t("store.addVariant")}
                    </SubmitButton>
                  </form>
                )}
              </FormCard>

            </div>
          ) : tab === "digital" ? (
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <FormCard id="tracks" title={t("store.tracks")} description={t("store.tracksHint")}>
                {busyAudio && <AutoRefresh />}
                {/* Single tracks: one price for every track (empty = album only); "or more" when the product is name-your-price. */}
                <form action={saveTrackPrice} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2 text-sm">
                  <input type="hidden" name="product_id" value={p.id} />
                  <Label htmlFor="track-price" className="font-normal">{t("store.trackPrice")}</Label>
                  <TypedInput kind="money" id="track-price" name="track_price" defaultValue={p.track_price_cents != null ? priceInput(p.track_price_cents) : ""} placeholder="–" disabled={!canManage} />
                  {canManage && (
                    <SubmitButton size="sm" variant="outline">
                      {t("common.save")}
                    </SubmitButton>
                  )}
                  <p className="w-full text-xs text-muted-foreground">{t("store.trackPriceHint")}</p>
                </form>
                {tracks.length > 0 && (
                  <ol className="grid gap-2">
                    {tracks.map((x, i) => (
                      <li key={x.id}>
                        <form action={saveTrack} className="grid grid-cols-[3rem_1fr] items-center gap-2 rounded-lg border p-2">
                          <input type="hidden" name="id" value={x.id} />
                          <input type="hidden" name="product_id" value={p.id} />
                          <Input name="position" type="number" defaultValue={x.position || i + 1} aria-label={t("store.trackNumber")} disabled={!canManage} />
                          <Input name="title" defaultValue={x.title} maxLength={200} aria-label={t("store.trackTitle")} disabled={!canManage} />
                          <span className="col-span-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {x.status !== "ready" && <Badge variant={x.status === "failed" ? "destructive" : "outline"}>{t.dynamic(`store.trackStatus.${x.status}`)}</Badge>}
                            {x.duration_seconds ? <span className="tabular-nums">{clock(x.duration_seconds)}</span> : null}
                            {x.status === "ready" && <span>{(["wav", "mp3"] as const).flatMap((f) => (x.formats[f] ? [`${t.dynamic(`store.audioFormats.${f}`)} ${mb(x.formats[f]!.size)}`] : [])).join(" · ")}</span>}
                            {x.status === "failed" && x.error && <span className="w-full truncate text-destructive" title={x.error}>{x.error}</span>}
                          </span>
                          <span className="col-span-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <label className="flex items-center gap-1">
                              <input type="checkbox" name="stream" value="1" defaultChecked={x.stream} disabled={!canManage} className="accent-primary" /> {t("store.trackStream")}
                            </label>
                            {p.track_price_cents != null && (
                              <label className="flex items-center gap-1">
                                <input type="hidden" name="has_buyable" value="1" />
                                <input type="checkbox" name="buyable" value="1" defaultChecked={x.buyable} disabled={!canManage} className="accent-primary" /> {t("store.trackBuyable")}
                              </label>
                            )}
                            <span className="min-w-0 flex-1 truncate" title={x.master_name}>{x.master_name}</span>
                            {canManage && (
                              <span className="flex gap-1">
                                {(x.status === "failed" || x.status === "uploading") && (
                                  <SubmitButton size="sm" variant="outline" name="retry" value="1">
                                    {t("store.trackRetry")}
                                  </SubmitButton>
                                )}
                                <SubmitButton size="sm" variant="outline">
                                  {t("common.save")}
                                </SubmitButton>
                                <SubmitButton size="sm" variant="ghost" name="delete" value="1" data-confirm="store.confirmRemoveTrack" aria-label={t("store.removeTrack")}>
                                  <Trash2Icon />
                                </SubmitButton>
                              </span>
                            )}
                          </span>
                        </form>
                      </li>
                    ))}
                  </ol>
                )}
                {tracks.some((x) => x.status === "ready") && (
                  <p className="text-xs text-muted-foreground">
                    {zips.zip ? t("store.zipsReady", { list: mb(zips.zip.size) }) : t("store.zipsPreparing")}
                  </p>
                )}
                {canManage && <AudioUpload productId={p.id} />}
              </FormCard>

              <FormCard id="downloads" title={t("store.downloads")} description={t("store.downloadsHint")}>
                <FileList ctx={ctx} entity="products" entityId={p.id} back={`${here}?tab=digital`} />
              </FormCard>
            </div>
          ) : (
            <RecordLayout aside={
              <FormCard id="images" title={t("store.images")} description={t("store.imagesHint")}>
                {p.images.length > 0 && (
                  <ul className="grid grid-cols-3 gap-2">
                    {p.images.map((path, i) => (
                      <li key={path} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
                        <img src={imageUrl(path)} alt="" className="size-full object-cover" />
                        {i === 0 && <Badge className="absolute bottom-1 left-1">{t("store.cover")}</Badge>}
                        {canManage && (
                          <div className="absolute top-1 right-1 flex gap-1">
                            {i > 0 && (
                              <form action={productImage}>
                                <input type="hidden" name="id" value={p.id} />
                                <input type="hidden" name="op" value="cover" />
                                <input type="hidden" name="path" value={path} />
                                <SubmitButton size="icon-xs" variant="secondary" aria-label={t("store.makeCover")} title={t("store.makeCover")}>
                                  <StarIcon />
                                </SubmitButton>
                              </form>
                            )}
                            <form action={productImage}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="op" value="remove" />
                              <input type="hidden" name="path" value={path} />
                              <SubmitButton size="icon-xs" variant="secondary" aria-label={t("store.removeImage")} title={t("store.removeImage")}>
                                <XIcon />
                              </SubmitButton>
                            </form>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && p.images.length < 12 && (
                  <form action={productImage} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <Input name="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" required className="max-w-60" aria-label={t("store.addImage")} />
                    <SubmitButton size="sm">{t("common.upload")}</SubmitButton>
                  </form>
                )}
              </FormCard>

            }>
              <ProductForm t={t} p={p} disabled={!canManage} small={billing?.tax_mode === "small_business"} />
            </RecordLayout>
          )}
        </>
      )}
    </Page>
  )
}

export const instant = false
