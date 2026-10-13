import type { Metadata } from "next"
import { getT } from "@/i18n/server"
import { DeviceBrowser, DevicePhone } from "../_components/devices"
import { AREAS, SIGNUP, SiteFrame, type Area } from "../_components/frame"
import { AutomationsMock, ContactsMock, FormMailMock, InvoiceMock, LineupMock, MembersMock, PayrollMock, PortalMock, ScannerMock, ShiftsMock } from "../_components/mocks"
import { FeatureText, HalftoneBand, ModuleRow, Painting, Tag } from "../_components/ui"

// /product: every area of roots with its own anchor (linked from the "Produkt" menu). Look: docs/design/site.md.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: { absolute: "roots" }, description: t("landing.meta.description") }
}

const panel = (children: React.ReactNode) => <div className="rounded-[10px] bg-[var(--paper-2)] p-[clamp(16px,3vw,44px)]">{children}</div>

const VISUALS: Record<Area, React.ReactNode> = {
  members: panel(
    <DeviceBrowser url="app.roots.de/members">
      <MembersMock />
    </DeviceBrowser>,
  ),
  tickets: (
    <Painting k="dance" sizes="(min-width: 768px) 820px, 100vw" className="aspect-[4/3] md:aspect-[16/10]" position="35% 55%">
      <div className="absolute top-1/2 right-[8%] z-[2] w-[min(32%,280px)] -translate-y-1/2">
        <DevicePhone>
          <ScannerMock />
        </DevicePhone>
      </div>
    </Painting>
  ),
  events: panel(
    <DeviceBrowser url="app.roots.de/events/sommerfest/lineup">
      <LineupMock />
    </DeviceBrowser>,
  ),
  shifts: panel(
    <DeviceBrowser url="app.roots.de/shifts">
      <ShiftsMock />
    </DeviceBrowser>,
  ),
  hr: panel(
    <DeviceBrowser url="app.roots.de/hr/payroll">
      <PayrollMock />
    </DeviceBrowser>,
  ),
  invoices: panel(<InvoiceMock />),
  forms: panel(
    <DeviceBrowser url="tsv-sued.roots.de/f/mitglied-werden">
      <FormMailMock />
    </DeviceBrowser>,
  ),
  automations: panel(
    <DeviceBrowser url="app.roots.de/automations">
      <AutomationsMock />
    </DeviceBrowser>,
  ),
  contacts: panel(
    <DeviceBrowser url="app.roots.de/contacts">
      <ContactsMock />
    </DeviceBrowser>,
  ),
  portal: (
    <Painting k="galette" sizes="(min-width: 768px) 820px, 100vw" className="aspect-[4/3] md:aspect-[16/10]" position="50% 40%">
      <div className="absolute top-1/2 left-1/2 z-[2] w-[min(34%,270px)] -translate-x-1/2 -translate-y-1/2">
        <DevicePhone>
          <PortalMock />
        </DevicePhone>
      </div>
    </Painting>
  ),
}

export default async function ProductPage() {
  const t = await getT()
  const modules = ["crm", "members", "events", "tickets", "guestlists", "courses", "shifts", "hr", "forms", "email", "automations", "reports", "invoices", "files", "portal", "api"] as const
  return (
    <SiteFrame>
      <header className="wrap grid gap-8 pt-[clamp(48px,7vw,104px)] pb-[clamp(56px,7vw,104px)]">
        <Tag>{t("landing.nav.product")}</Tag>
        <h1 className="display fs-hero max-w-[16ch]">
          {t("landing.productPage.title")} <em>{t("landing.productPage.accent")}</em>
        </h1>
        <p className="fs-lead soft max-w-[52ch]">{t("landing.productPage.lead")}</p>
        {/* Jump to an area */}
        <nav aria-label={t("landing.nav.product")} className="flex flex-wrap gap-2">
          {AREAS.map((k) => (
            <a key={k} href={`#${k}`} className="border border-[var(--line)] px-3 py-1.5 text-[14px] transition-colors hover:border-[var(--ink)]">
              {t(`landing.menu.items.${k}.title`)}
            </a>
          ))}
        </nav>
      </header>

      <div className="wrap mx-auto grid max-w-[1560px] gap-[clamp(88px,11vw,160px)] pb-[clamp(96px,12vw,176px)]">
        {AREAS.map((k, i) => (
          <section key={k} id={k} className="rule grid scroll-mt-24 items-start gap-10 pt-10 md:grid-cols-12">
            <div className={`reveal md:col-span-4 ${i % 2 ? "md:order-2 md:col-start-9" : ""}`}>
              <FeatureText
                n={i + 1}
                label={t(`landing.features.${k}.label`)}
                title={t(`landing.features.${k}.title`)}
                text={t(`landing.features.${k}.text`)}
                bullets={[t(`landing.features.${k}.b1`), t(`landing.features.${k}.b2`), t(`landing.features.${k}.b3`)]}
              />
            </div>
            <div className={`reveal md:col-span-8 ${i % 2 ? "md:order-1 md:col-start-1" : ""}`}>{VISUALS[k]}</div>
          </section>
        ))}
      </div>

      {/* Everything at a glance */}
      <section className="wrap pb-[clamp(96px,12vw,176px)]">
        <div className="mb-14 grid gap-6 md:grid-cols-2 md:items-end">
          <div className="grid justify-items-start gap-5">
            <Tag>{t("landing.nav.modules")}</Tag>
            <h2 className="display fs-h2">{t("landing.modulesSection.title")}</h2>
          </div>
          <p className="soft max-w-[44ch] md:justify-self-end">{t("landing.modulesSection.text")}</p>
        </div>
        <dl className="border-b border-[var(--line)]">
          {modules.map((m, i) => (
            <ModuleRow key={m} n={i + 1} name={t(`landing.modules.${m}.name`)} text={t(`landing.modules.${m}.text`)} />
          ))}
        </dl>
      </section>

      <section className="wrap pb-[clamp(96px,12vw,176px)]">
        <HalftoneBand k="dance" title={t("landing.final.title")} accent={t("landing.final.accent")} text={t("landing.final.text")} cta={t("landing.final.pill")} href={SIGNUP} />
      </section>
    </SiteFrame>
  )
}
