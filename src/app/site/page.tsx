import Image from "next/image"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"
import { SIGNUP, SiteFrame } from "./_components/frame"
import { HalftoneBand, Painting, Pill } from "./_components/ui"
import { getT } from "@/i18n/server"
import { DeviceBrowser, DeviceLaptop, DevicePhone } from "./_components/devices"
import { DashboardMock, FormMailMock, InvoiceMock, MembersMock, ScannerMock, ShiftsMock } from "./_components/mocks"
import { WireContours, WirePanels, WireSpheres } from "./_components/wireframes"
import { PAINTINGS, type PaintingKey } from "./paintings"

// Public website (landing). Look: docs/design/site.md. Served at "/" of the bare domain (see src/proxy.ts).

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
  const audiences = ["a1", "a2", "a3", "a4", "a5", "a6"] as const
  const faqs = ["q1", "q2", "q3", "q4", "q5"] as const

  return (
    <>
      <SiteFrame>

        {/* ---- hero: the painting fills the first screen (pinned); scrolling brings the laptop up into the field ---- */}
        <section id="top" className="relative">
          {/* Copy on paper, no veil needed */}
          <div className="wrap grid gap-x-16 gap-y-8 pt-[clamp(48px,7vw,104px)] pb-[clamp(40px,5vw,72px)] lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-end">
            <div>
              <p className="label reveal soft mb-6">{t("landing.hero.eyebrow")}</p>
              <h1 className="display fs-hero reveal max-w-[13ch]">
                {t("landing.hero.title1")} <em>{t("landing.hero.accent")}</em>
              </h1>
            </div>
            <div className="reveal grid gap-8 lg:pb-3">
              <p className="fs-lead soft max-w-[44ch]">{t("landing.hero.lead")}</p>
              <div className="flex flex-wrap items-center gap-6">
                <Pill href={SIGNUP}>{t("landing.hero.cta")}</Pill>
                <a href="#product" className="link text-[15px]">
                  {t("landing.hero.secondary")}
                </a>
              </div>
            </div>
          </div>
          {/* The painting: full width first, moves in to the margins while the laptop rises into the field */}
          <div className="hero-stage relative h-[170svh]">
            <div className="sticky top-0 h-[100svh]">
              <div className="hero-frame h-full overflow-hidden">
                <div className="painting h-full rounded-none">
                  <Image
                    src={PAINTINGS.harvesters.src}
                    alt={`${PAINTINGS.harvesters.artist}, ${PAINTINGS.harvesters.title}`}
                    fill
                    priority
                    sizes="100vw"
                    className="object-cover"
                    style={{ objectPosition: "50% 35%" }}
                  />
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
            <a href="/product" className="pill inline-pill">
              <span>{t("landing.statement.pill")}</span>
              <ArrowUpRightIcon className="size-[0.32em] min-w-4" strokeWidth={2} />
            </a>{" "}
            {t("landing.statement.after")}
          </p>
        </section>

        {/* ---- values: three cards with line-art ---- */}
        <section id="why" className="wrap scroll-mt-24 pb-[clamp(96px,12vw,176px)]">
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
        <section id="product" className="wrap mx-auto grid max-w-[1560px] gap-[clamp(88px,11vw,160px)] pb-[clamp(96px,12vw,176px)]">
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
                  <Painting k={f.painting} sizes="(min-width: 768px) 820px, 100vw" className="aspect-[4/3] md:aspect-[16/10]" position="35% 55%">
                    <div className="absolute top-1/2 right-[8%] z-[2] w-[min(32%,280px)] -translate-y-1/2">
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
                <Image src={PAINTINGS.turf.src} alt={`${PAINTINGS.turf.artist}, ${PAINTINGS.turf.title}`} fill sizes="460px" className="scale-[1.08] object-cover" />
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

        {/* ---- for clubs & promoters ---- */}
        <section className="wrap section">
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

        {/* ---- final CTA: dark band, the Bauerntanz as a halftone that builds up as it comes into view ---- */}
        <section className="wrap pb-[clamp(96px,12vw,176px)]">
          <HalftoneBand k="dance" title={t("landing.final.title")} accent={t("landing.final.accent")} text={t("landing.final.text")} cta={t("landing.final.pill")} href={SIGNUP} />
        </section>
      </SiteFrame>
    </>
  )
}
