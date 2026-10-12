import Image from "next/image"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"
import { getT } from "@/i18n/server"
import { DeviceBrowser, DeviceLaptop, DevicePhone } from "./_components/devices"
import { DashboardMock, FormMailMock, InvoiceMock, MembersMock, ScannerMock, ShiftsMock } from "./_components/mocks"
import { Halftone } from "./_components/halftone"
import { WireContours, WirePanels, WireSpheres } from "./_components/wireframes"
import { PAINTINGS, type PaintingKey } from "./paintings"

// Public website (landing). Look: docs/design/site.md. Served at "/" of the bare domain (see src/proxy.ts).
const APP = "/app"
const SIGNUP = "/login"

function Pill({ href, children, light, className }: { href: string; children: React.ReactNode; light?: boolean; className?: string }) {
  return (
    <a href={href} className={`pill ${light ? "pill-light" : ""} ${className ?? ""}`}>
      <span>{children}</span>
      <ArrowUpRightIcon className="size-4" strokeWidth={2} />
    </a>
  )
}

/** A painting with a museum-style caption. */
function Painting({
  k,
  className,
  sizes,
  priority,
  children,
  position,
}: {
  k: PaintingKey
  className?: string
  sizes: string
  priority?: boolean
  children?: React.ReactNode
  position?: string
}) {
  const p = PAINTINGS[k]
  return (
    <figure className="grid gap-3">
      <div className={`painting settle ${className ?? ""}`}>
        <Image
          src={p.src}
          alt={`${p.artist}, ${p.title}`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          style={{ objectPosition: position ?? "50% 50%" }}
        />
        {children}
      </div>
      <figcaption className="soft text-[12px]">
        {p.artist}, <em>{p.title}</em>, {p.year}
      </figcaption>
    </figure>
  )
}

export default async function Landing() {
  const t = await getT()
  const features: {
    key: "members" | "tickets" | "shifts" | "forms" | "invoices"
    mock?: React.ReactNode
    painting?: PaintingKey
  }[] = [
    {
      key: "members",
      mock: (
        <DeviceBrowser url="app.roots.de/members">
          <MembersMock />
        </DeviceBrowser>
      ),
    },
    { key: "tickets", painting: "dance" },
    {
      key: "shifts",
      mock: (
        <DeviceBrowser url="app.roots.de/shifts">
          <ShiftsMock />
        </DeviceBrowser>
      ),
    },
    {
      key: "forms",
      mock: (
        <DeviceBrowser url="tsv-sued.roots.de/f/mitglied-werden">
          <FormMailMock />
        </DeviceBrowser>
      ),
    },
    { key: "invoices", mock: <InvoiceMock /> },
  ]
  const modules = ["crm", "members", "events", "tickets", "guestlists", "shifts", "forms", "email", "invoices", "files", "portal", "api"] as const
  const audiences = ["a1", "a2", "a3", "a4", "a5", "a6"] as const
  const faqs = ["q1", "q2", "q3", "q4", "q5"] as const

  return (
    <>
      {/* Everything above the footer scrolls over it (the footer is revealed underneath). */}
      <div className="relative z-10 bg-[var(--paper)] shadow-[0_24px_48px_rgb(25_24_19/.18)]">
        {/* ---- nav ---- */}
        <header className="sticky top-0 z-50">
          <nav className="nav-bar flex h-16 items-center justify-between gap-4">
            <a href="#top" className="serif text-[30px] leading-none">
              roots
            </a>
            <div className="hidden items-center gap-7 text-[14px] md:flex">
              {(["product", "modules", "pricing", "faq"] as const).map((k) => (
                <a key={k} href={`#${k}`} className="soft transition-colors hover:text-[var(--ink)]">
                  {t(`landing.nav.${k}`)}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-5">
              <a href={APP} className="soft text-[14px] hover:text-[var(--ink)] max-sm:hidden">
                {t("landing.nav.login")}
              </a>
              <Pill href={SIGNUP} className="h-10 px-4">
                {t("landing.nav.start")}
              </Pill>
            </div>
          </nav>
        </header>

        {/* ---- hero: the painting as a halftone that builds up, then (scrolling) the colour painting comes through
             and the laptop rises into the field ---- */}
        <section id="top" className="hero wrap relative h-[200svh] pt-4">
          <div className="sticky top-20 h-[calc(100svh-6rem)]">
            <div className="ticks h-full">
              <div className="painting h-full rounded-[2px] bg-[#14130f]">
                <Image
                  src={PAINTINGS.harvesters.src}
                  alt={`${PAINTINGS.harvesters.artist}, ${PAINTINGS.harvesters.title}`}
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                  style={{ objectPosition: "50% 35%" }}
                />
                <Halftone src={PAINTINGS.harvesters.src} className="hero-halftone absolute inset-0 z-[1] size-full" />
                {/* dark veil from the left, where the copy sits */}
                <div className="absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgb(20_19_15/.82)_0%,rgb(20_19_15/.55)_34%,rgb(20_19_15/0)_68%)] max-sm:bg-[linear-gradient(180deg,rgb(20_19_15/.85)_0%,rgb(20_19_15/.5)_60%,rgb(20_19_15/0)_90%)]" />
                <div className="hero-copy relative z-[3] px-[clamp(20px,4vw,64px)] pt-[clamp(32px,8vh,104px)] text-[var(--paper)]">
                  <p className="label mb-6 text-[var(--paper)]/70">{t("landing.hero.eyebrow")}</p>
                  <h1 className="display fs-hero max-w-[13ch]">
                    {t("landing.hero.title1")} <em>{t("landing.hero.accent")}</em> {t("landing.hero.title2")}
                  </h1>
                  <p className="fs-lead mt-6 max-w-[44ch] text-[var(--paper)]/80">{t("landing.hero.lead")}</p>
                  <div className="mt-8 flex flex-wrap items-center gap-6">
                    <Pill href={SIGNUP} light>
                      {t("landing.hero.cta")}
                    </Pill>
                    <a href="#product" className="link text-[15px] decoration-white/40">
                      {t("landing.hero.secondary")}
                    </a>
                  </div>
                </div>
                <div className="hero-laptop absolute inset-x-0 bottom-[-4%] z-[4] mx-auto w-[min(86%,980px)] sm:w-[min(62%,980px)]">
                  <DeviceLaptop>
                    <DashboardMock />
                  </DeviceLaptop>
                </div>
                <p className="absolute right-5 bottom-4 z-[3] text-[12px] text-[var(--paper)]/75 max-sm:hidden">
                  {PAINTINGS.harvesters.artist}, <em>{PAINTINGS.harvesters.title}</em>, {PAINTINGS.harvesters.year}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- made for ---- */}
        <section className="wrap mt-[clamp(72px,9vw,128px)]">
          <div className="rule grid gap-6 pt-8 md:grid-cols-[180px_1fr]">
            <p className="label soft">{t("landing.audience.label")}</p>
            <ul className="display flex flex-wrap gap-x-8 gap-y-2 text-[clamp(22px,2.2vw,32px)] font-light">
              {audiences.map((a) => (
                <li key={a}>{t(`landing.audience.${a}`)}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---- statement with an inline pill ---- */}
        <section className="wrap section text-center">
          <p className="display fs-h2 reveal mx-auto max-w-[18ch] leading-[1.05]">
            {t("landing.statement.before")}{" "}
            <a href="#modules" className="pill inline-pill">
              <span>{t("landing.statement.pill")}</span>
              <ArrowUpRightIcon className="size-[0.32em] min-w-4" strokeWidth={2} />
            </a>{" "}
            {t("landing.statement.after")}
          </p>
        </section>

        {/* ---- values: three cards with line-art ---- */}
        <section className="wrap pb-[clamp(96px,12vw,176px)]">
          <div className="mb-14 grid justify-items-center gap-5 text-center">
            <span className="tag">{t("landing.values.label")}</span>
            <h2 className="display fs-h2 max-w-[18ch]">{t("landing.values.title")}</h2>
          </div>
          <div className="mx-auto grid max-w-[1160px] gap-4 md:grid-cols-3">
            {(
              [
                ["c1", WirePanels],
                ["c2", WireContours],
                ["c3", WireSpheres],
              ] as const
            ).map(([k, Art]) => (
              <div key={k} className="reveal grid gap-8 border border-[var(--line)] bg-[rgb(25_24_19/.025)] px-8 pt-12 pb-9 text-center">
                <div className="mx-auto h-28 w-full max-w-[220px] text-[var(--ink)]/75">
                  <Art />
                </div>
                <div>
                  <h3 className="display mb-3 text-[21px] leading-tight">{t(`landing.values.${k}.title`)}</h3>
                  <p className="soft mx-auto max-w-[34ch] text-[15px]">{t(`landing.values.${k}.text`)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- features ---- */}
        <section id="product" className="wrap grid gap-[clamp(88px,11vw,160px)] pb-[clamp(96px,12vw,176px)]">
          {features.map((f, i) => (
            <article key={f.key} className="rule grid items-start gap-10 pt-10 md:grid-cols-12">
              <div className="reveal md:col-span-4">
                <p className="label soft mb-6">
                  {String(i + 1).padStart(2, "0")} · {t(`landing.features.${f.key}.label`)}
                </p>
                <h3 className="display fs-h3 mb-5">{t(`landing.features.${f.key}.title`)}</h3>
                <p className="soft mb-7">{t(`landing.features.${f.key}.text`)}</p>
                <ul className="grid text-[15px]">
                  {(["b1", "b2", "b3"] as const).map((b) => (
                    <li key={b} className="rule py-2.5">
                      {t(`landing.features.${f.key}.${b}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="reveal md:col-span-8">
                {f.painting ? (
                  <Painting k={f.painting} sizes="(min-width: 768px) 820px, 100vw" className="aspect-[4/3] md:aspect-[16/11]" position="40% 60%">
                    <div className="absolute top-[8%] right-[9%] z-[2] w-[min(28%,210px)]">
                      <DevicePhone>
                        <ScannerMock />
                      </DevicePhone>
                    </div>
                  </Painting>
                ) : (
                  <div className="rounded-[10px] bg-[var(--paper-2)] p-[clamp(16px,3vw,44px)]">{f.mock}</div>
                )}
              </div>
            </article>
          ))}
        </section>

        {/* ---- manifesto ---- */}
        <section className="bg-[var(--ink)] text-[var(--paper)]">
          <div className="wrap section grid items-center gap-[clamp(40px,7vw,112px)] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <figure className="reveal mx-auto grid w-full max-w-[460px] gap-3">
              <div className="painting aspect-[1712/2200] rounded-[4px] ring-1 ring-white/10">
                <Image src={PAINTINGS.turf.src} alt={`${PAINTINGS.turf.artist}, ${PAINTINGS.turf.title}`} fill sizes="460px" className="object-cover" />
              </div>
              <figcaption className="text-[12px] text-[var(--paper)]/55">
                {PAINTINGS.turf.artist}, <em>{PAINTINGS.turf.title}</em>, {PAINTINGS.turf.year}
              </figcaption>
            </figure>
            <div className="reveal">
              <p className="label mb-8 text-[var(--paper)]/55">{t("landing.manifesto.label")}</p>
              <h2 className="display fs-h2 mb-8">
                {t("landing.manifesto.title1")} <em>{t("landing.manifesto.accent")}</em>
              </h2>
              <div className="grid max-w-[52ch] gap-5 text-[17px] text-[var(--paper)]/75">
                <p>{t("landing.manifesto.p1")}</p>
                <p>{t("landing.manifesto.p2")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ---- modules table ---- */}
        <section id="modules" className="wrap section">
          <div className="mb-14 grid gap-6 md:grid-cols-2 md:items-end">
            <h2 className="display fs-h2 reveal">{t("landing.modulesSection.title")}</h2>
            <p className="reveal soft max-w-[44ch] md:justify-self-end">{t("landing.modulesSection.text")}</p>
          </div>
          <dl className="border-b border-[var(--line)]">
            {modules.map((m, i) => (
              <div key={m} className="reveal rule grid gap-2 py-5 sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-baseline sm:gap-8">
                <span className="label text-[var(--umber)]">{String(i + 1).padStart(2, "0")}</span>
                <dt className="display text-[clamp(22px,2vw,28px)] leading-tight">{t(`landing.modules.${m}.name`)}</dt>
                <dd className="soft">{t(`landing.modules.${m}.text`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ---- for clubs & promoters ---- */}
        <section className="wrap pb-[clamp(96px,12vw,176px)]">
          <Painting k="galette" sizes="(min-width: 1280px) 1280px, 100vw" className="aspect-[4/5] sm:aspect-[16/8]" position="50% 40%">
            <div className="absolute inset-x-4 bottom-4 z-[2] max-w-[460px] rounded-[10px] bg-[var(--paper)] p-6 sm:inset-x-auto sm:bottom-8 sm:left-8 sm:p-8">
              <p className="label soft mb-4">{t("landing.events.label")}</p>
              <h3 className="display fs-h3 mb-4">{t("landing.events.title")}</h3>
              <p className="soft mb-6 text-[15px]">{t("landing.events.text")}</p>
              <Pill href={SIGNUP}>{t("landing.hero.cta")}</Pill>
            </div>
          </Painting>
        </section>

        {/* ---- principles ---- */}
        <section className="wrap pb-[clamp(96px,12vw,176px)]">
          <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
            {(["gdpr", "data", "easy", "berlin"] as const).map((k) => (
              <div key={k} className="reveal rule py-7">
                <p className="display mb-2 text-[22px] leading-tight">{t(`landing.trust.${k}.title`)}</p>
                <p className="soft text-[15px]">{t(`landing.trust.${k}.text`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- pricing ---- */}
        <section id="pricing" className="wrap pb-[clamp(96px,12vw,176px)]">
          <div className="grid overflow-hidden rounded-[14px] border border-[var(--line)] md:grid-cols-[1.3fr_1fr]">
            <div className="p-[clamp(28px,5vw,64px)]">
              <p className="label soft mb-8">{t("landing.pricing.label")}</p>
              <h2 className="display fs-h2 mb-6">
                {t("landing.pricing.title")} <em>{t("landing.pricing.accent")}</em>
              </h2>
              <p className="fs-lead soft max-w-[42ch]">{t("landing.pricing.text")}</p>
            </div>
            <div className="flex flex-col justify-between gap-8 bg-[var(--paper-2)] p-[clamp(28px,5vw,64px)]">
              <div>
                <p className="label soft">{t("landing.pricing.planLabel")}</p>
                <p className="display mt-3 text-[88px] leading-none font-light">0 €</p>
                <p className="soft mt-3 text-[15px]">{t("landing.pricing.planText")}</p>
              </div>
              <ul className="grid text-[15px]">
                {(["f1", "f2", "f3"] as const).map((f) => (
                  <li key={f} className="rule py-2.5">
                    {t(`landing.pricing.${f}`)}
                  </li>
                ))}
              </ul>
              <div>
                <Pill href={SIGNUP}>{t("landing.hero.cta")}</Pill>
              </div>
            </div>
          </div>
        </section>

        {/* ---- FAQ (centered) ---- */}
        <section id="faq" className="wrap pb-[clamp(96px,12vw,176px)]">
          <div className="mx-auto max-w-[760px]">
            <h2 className="display fs-h2 mb-12 text-center">{t("landing.faq.title")}</h2>
            <div className="border-b border-[var(--line)]">
              {faqs.map((q) => (
                <details key={q} className="rule py-5">
                  <summary className="flex items-start justify-between gap-6 text-[18px]">
                    {t(`landing.faq.${q}.q`)}
                    <PlusIcon className="plus soft mt-1 size-5 shrink-0" />
                  </summary>
                  <p className="soft mt-3 max-w-[60ch]">{t(`landing.faq.${q}.a`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---- final CTA ---- */}
        <section className="wrap text-center">
          <p className="display fs-h2 rule section leading-[1.05]">
            {t("landing.final.before")}{" "}
            <a href={SIGNUP} className="pill inline-pill">
              <span>{t("landing.final.pill")}</span>
              <ArrowUpRightIcon className="size-[0.32em] min-w-4" strokeWidth={2} />
            </a>
          </p>
        </section>
      </div>

      {/* ---- footer, revealed underneath ---- */}
      <footer className="sticky bottom-0 z-0 h-[min(100svh,860px)] overflow-hidden bg-[var(--ink)] text-[var(--paper)]">
        <Image
          src={PAINTINGS.pastoral.src}
          alt={`${PAINTINGS.pastoral.artist}, ${PAINTINGS.pastoral.title}`}
          fill
          sizes="100vw"
          className="object-cover opacity-90 [filter:saturate(.9)_contrast(1.03)]"
          style={{ objectPosition: "50% 45%" }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--ink)]/55 via-[var(--ink)]/10 to-[var(--ink)]/80" />
        <div className="wrap relative flex h-full flex-col justify-between py-10">
          <div className="flex flex-wrap justify-between gap-10 text-[14px]">
            <p className="max-w-[36ch] text-[var(--paper)]/85">{t("landing.footer.claim")}</p>
            <div className="flex gap-14">
              <ul className="grid content-start gap-2">
                <li className="label mb-1 text-[var(--paper)]/55">{t("landing.footer.product")}</li>
                {(["product", "modules", "pricing", "faq"] as const).map((k) => (
                  <li key={k}>
                    <a href={`#${k}`} className="hover:underline">
                      {t(`landing.nav.${k}`)}
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
                  <a href="/api/docs" className="hover:underline">
                    API
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div>
            <p className="serif text-[clamp(110px,24vw,340px)] leading-[0.8]">roots</p>
            <div className="mt-6 flex flex-wrap justify-between gap-4 text-[12px] text-[var(--paper)]/60">
              <span>{t("landing.footer.grassroots")}</span>
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
