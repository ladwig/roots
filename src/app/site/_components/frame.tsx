import Image from "next/image"
import Link from "next/link"
import { getT } from "@/i18n/server"
import { PAINTINGS } from "../paintings"
import { ProductMenu } from "./product-menu"
import { Pill } from "./ui"
import { MobileMenu } from "./mobile-menu"
import { ScrollFlag } from "./scroll-flag"

export const APP = "/app"
export const SIGNUP = "/login"
// Areas of the product: menu entries and the anchors on /product (same order).
export const AREAS = ["members", "tickets", "events", "shifts", "hr", "invoices", "cashbook", "reports", "forms", "automations", "wiki", "contacts", "portal"] as const
export type Area = (typeof AREAS)[number]

/** Nav (shrinks on scroll, "Produkt" mega menu) + page content + footer revealed underneath. */
export async function SiteFrame({ children }: { children: React.ReactNode }) {
  const t = await getT()
  return (
    <>
      <ScrollFlag />
      {/* Everything above the footer scrolls over it (the footer is revealed underneath). */}
      <div className="relative z-10 bg-[var(--paper)] shadow-[0_24px_48px_rgb(25_24_19/.18)]">
        <header className="sticky top-0 z-50">
          <nav className="nav-bar relative flex h-16 items-center justify-between gap-4">
            <Link href="/" className="wordmark text-[26px]">
              roots
            </Link>
            <div className="hidden items-center gap-7 text-[14px] md:flex">
              <ProductMenu
                label={t("landing.nav.product")}
                intro={t("landing.menu.intro")}
                items={AREAS.map((k) => ({ key: k, href: `/product#${k}`, title: t(`landing.menu.items.${k}.title`), text: t(`landing.menu.items.${k}.text`) }))}
                card={{ src: PAINTINGS.turf.src, alt: `${PAINTINGS.turf.artist}, ${PAINTINGS.turf.title}`, title: t("landing.menu.card"), link: t("landing.menu.cardLink"), href: "/#why" }}
                links={[
                  { href: "/product", label: t("landing.menu.all") },
                  { href: "/#pricing", label: t("landing.nav.pricing") },
                  { href: "/api/docs", label: t("landing.menu.api") },
                ]}
              />
              {(["pricing", "faq"] as const).map((k) => (
                <Link key={k} href={`/#${k}`} className="soft transition-colors hover:text-[var(--ink)]">
                  {t(`landing.nav.${k}`)}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3 sm:gap-5">
              <a href={APP} className="soft text-[14px] hover:text-[var(--ink)] max-sm:hidden">
                {t("landing.nav.login")}
              </a>
              <Pill href={SIGNUP} className="h-10 px-4 max-[400px]:px-3">
                {t("landing.nav.start")}
              </Pill>
              <MobileMenu
                label={t("landing.nav.menu")}
                close={t("landing.nav.close")}
                groups={[
                  AREAS.map((k) => ({ href: `/product#${k}`, label: t(`landing.menu.items.${k}.title`) })),
                  [
                    { href: "/product", label: t("landing.menu.all") },
                    { href: "/#pricing", label: t("landing.nav.pricing") },
                    { href: "/#faq", label: t("landing.nav.faq") },
                    { href: APP, label: t("landing.nav.login") },
                  ],
                ]}
              />
            </div>
          </nav>
        </header>
        {children}
      </div>

      <footer className="sticky bottom-0 z-0 h-[min(100svh,860px)] overflow-hidden bg-[var(--ink)] text-[var(--paper)]">
        <Image src={PAINTINGS.pastoral.src} alt={`${PAINTINGS.pastoral.artist}, ${PAINTINGS.pastoral.title}`} fill sizes="100vw" className="scale-[1.45] object-cover opacity-90 [filter:saturate(.9)_contrast(1.03)]" style={{ objectPosition: "50% 45%" }} />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--ink)]/55 via-[var(--ink)]/10 to-[var(--ink)]/80" />
        <div className="wrap relative flex h-full flex-col justify-between py-10">
          <div className="flex flex-wrap justify-between gap-10 text-[14px]">
            <p className="max-w-[36ch] text-[var(--paper)]/85">{t("landing.footer.claim")}</p>
            <div className="flex gap-14">
              <ul className="grid content-start gap-2">
                <li className="label mb-1 text-[var(--paper)]/55">{t("landing.footer.product")}</li>
                {AREAS.slice(0, 6).map((k) => (
                  <li key={k}>
                    <a href={`/product#${k}`} className="hover:underline">
                      {t(`landing.menu.items.${k}.title`)}
                    </a>
                  </li>
                ))}
              </ul>
              <ul className="grid content-start gap-2">
                <li className="label mb-1 text-[var(--paper)]/55">{t("landing.footer.account")}</li>
                <li>
                  <a href={APP} className="hover:underline">
                    {t("landing.nav.login")}
                  </a>
                </li>
                <li>
                  <a href={SIGNUP} className="hover:underline">
                    {t("landing.nav.start")}
                  </a>
                </li>
                <li>
                  <Link href="/#pricing" className="hover:underline">
                    {t("landing.nav.pricing")}
                  </Link>
                </li>
                <li>
                  <a href="/api/docs" className="hover:underline">
                    API
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div>
            <p className="wordmark text-[clamp(110px,24vw,340px)] leading-[0.8]">roots</p>
            <div className="mt-6 flex flex-wrap justify-between gap-4 text-[12px] text-[var(--paper)]/60">
              <span className="flex flex-wrap gap-x-5 gap-y-2">
                {t("landing.footer.grassroots")}
                <Link href="/imprint" className="hover:underline">
                  {t("landing.footer.imprint")}
                </Link>
                <Link href="/privacy" className="hover:underline">
                  {t("landing.footer.privacy")}
                </Link>
              </span>
              <span>
                {t("landing.footer.paintings")}{" "}
                {(["harvesters", "dance", "turf", "galette", "pastoral"] as const).map((k, i) => (
                  <span key={k}>
                    {i > 0 && " · "}
                    <a href={PAINTINGS[k].source} className="hover:underline" target="_blank" rel="noreferrer">
                      {PAINTINGS[k].artist}
                    </a>
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
