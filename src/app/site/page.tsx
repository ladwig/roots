import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react"
import { getT } from "@/i18n/server"
import { DeviceBrowser, DeviceLaptop, DevicePhone } from "./_components/devices"
import { FooterScene } from "./_components/footer-scene"
import { DashboardMock, FormMailMock, InvoiceMock, MembersMock, ScannerMock, ShiftsMock } from "./_components/mocks"

// Public website (landing). Look: docs/design/site.md. Served at "/" of the bare domain (see src/proxy.ts).
const APP = "/app"
const SIGNUP = "/login"

/** A statement whose words light up one by one while it scrolls through (CSS scroll-driven, see site.css). */
function Lit({ text, className, onCream }: { text: string; className?: string; onCream?: boolean }) {
  const words = text.split(" ")
  return (
    <p className={`lit ${onCream ? "on-cream" : ""} ${className ?? ""}`}>
      {words.map((w, i) => (
        <span key={i} style={{ animationRange: `cover ${10 + (i / words.length) * 35}% cover ${16 + (i / words.length) * 35}%` }}>
          {w}{" "}
        </span>
      ))}
    </p>
  )
}

function Cta({ href, children, ghost }: { href: string; children: React.ReactNode; ghost?: boolean }) {
  return (
    <a href={href} className={`btn ${ghost ? "btn-ghost" : "btn-lime"}`}>
      {children}
      {!ghost && (
        <span className="chip">
          <ArrowRightIcon className="size-4" />
        </span>
      )}
    </a>
  )
}

export default async function Landing() {
  const t = await getT()
  const features = [
    { key: "members", mock: <DeviceBrowser url="app.roots.de/members"><MembersMock /></DeviceBrowser>, bg: "grad-sand" },
    { key: "tickets", mock: <DevicePhone className="mx-auto w-[min(62%,280px)]"><ScannerMock /></DevicePhone>, bg: "grad-dusk" },
    { key: "shifts", mock: <DeviceBrowser url="app.roots.de/shifts"><ShiftsMock /></DeviceBrowser>, bg: "grad-moss" },
    { key: "forms", mock: <DeviceBrowser url="tsv-sued.roots.de/f/mitglied-werden"><FormMailMock /></DeviceBrowser>, bg: "grad-dusk" },
    { key: "invoices", mock: <InvoiceMock />, bg: "grad-sand" },
  ] as const
  const modules = ["crm", "members", "events", "tickets", "guestlists", "shifts", "forms", "email", "invoices", "files", "portal", "api"] as const

  return (
    <>
      {/* Everything above the footer scrolls over it (the footer is revealed underneath). */}
      <div className="relative z-10 bg-[var(--ink)] shadow-[0_30px_60px_rgb(0_0_0/.5)]">
        {/* ---- nav ---- */}
        <header className="fixed inset-x-0 top-0 z-50 px-[var(--gutter)] pt-4">
          <nav className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 rounded-full border border-white/10 bg-[rgb(12_13_11/.7)] py-2 pr-2 pl-5 backdrop-blur-md">
            <a href="#top" className="display text-2xl">
              roots<span className="text-[var(--lime)]">.</span>
            </a>
            <div className="hidden items-center gap-1 text-sm md:flex">
              {(["product", "who", "pricing"] as const).map((k) => (
                <a key={k} href={`#${k}`} className="rounded-full px-3.5 py-1.5 text-[var(--cream)]/75 transition hover:bg-white/10 hover:text-[var(--cream)]">
                  {t(`landing.nav.${k}`)}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <a href={APP} className="rounded-full px-3.5 py-1.5 text-sm text-[var(--cream)]/80 hover:text-[var(--cream)]">
                {t("landing.nav.login")}
              </a>
              <a href={SIGNUP} className="rounded-full bg-[var(--lime)] px-4 py-2 text-sm font-medium text-[var(--ink)] transition hover:brightness-95">
                {t("landing.nav.start")}
              </a>
            </div>
          </nav>
        </header>

        {/* ---- hero ---- */}
        <section id="top" className="wrap pt-[clamp(130px,16vw,200px)]">
          <p className="micro reveal mb-6 text-[var(--cream)]/55">{t("landing.hero.eyebrow")}</p>
          <h1 className="display fs-h1 reveal max-w-[14ch]">
            {t("landing.hero.title1")} <span className="accent text-[var(--lime)]">{t("landing.hero.accent")}</span> {t("landing.hero.title2")}
          </h1>
          <div className="mt-8 flex flex-wrap items-end justify-between gap-8">
            <p className="fs-lead reveal max-w-[46ch] text-[var(--cream)]/70">{t("landing.hero.lead")}</p>
            <div className="reveal flex flex-wrap gap-3">
              <Cta href={SIGNUP}>{t("landing.hero.cta")}</Cta>
              <Cta href="#product" ghost>
                {t("landing.hero.secondary")}
              </Cta>
            </div>
          </div>
          <div className="grain grad-moss reveal relative mt-[clamp(48px,7vw,96px)] overflow-hidden rounded-[28px] px-[5%] pt-[6%] pb-0">
            <div className="relative z-[2] mx-auto max-w-[1000px]">
              <DeviceLaptop className="translate-y-[2%]">
                <DashboardMock />
              </DeviceLaptop>
              <DevicePhone className="anim-float absolute right-[-3%] bottom-[-6%] w-[22%] min-w-[110px] max-sm:hidden">
                <ScannerMock />
              </DevicePhone>
            </div>
          </div>
        </section>

        {/* ---- module marquee ---- */}
        <div className="mt-16 overflow-hidden border-y border-white/10 py-5">
          <div className="anim-marquee flex w-max gap-10 whitespace-nowrap">
            {[...modules, ...modules].map((m, i) => (
              <span key={i} className="micro flex items-center gap-10 text-[var(--cream)]/50">
                {t(`landing.modules.${m}`)} <span className="text-[var(--lime)]">✳</span>
              </span>
            ))}
          </div>
        </div>

        {/* ---- statement ---- */}
        <section className="wrap section">
          <p className="micro mb-8 text-[var(--cream)]/45">{t("landing.statement.label")}</p>
          <Lit text={t("landing.statement.text")} className="display fs-h2 max-w-[22ch]" />
        </section>

        {/* ---- features ---- */}
        <section id="product" className="bg-[var(--cream)] text-[var(--ink)]">
          <div className="wrap section grid gap-[clamp(96px,12vw,160px)]">
            <div>
              <p className="micro mb-6 text-[var(--ink)]/50">{t("landing.product.label")}</p>
              <h2 className="display fs-h2 reveal max-w-[15ch]">
                {t("landing.product.title")} <span className="accent text-[var(--moss)]">{t("landing.product.accent")}</span>
              </h2>
            </div>
            {features.map((f, i) => (
              <article key={f.key} className="grid items-center gap-10 md:grid-cols-12">
                <div className={`reveal md:col-span-5 ${i % 2 ? "md:order-2 md:col-start-8" : ""}`}>
                  <p className="micro mb-4 text-[var(--ink)]/45">
                    0{i + 1} — {t(`landing.features.${f.key}.label`)}
                  </p>
                  <h3 className="display fs-h3 mb-4 !leading-[1.05]">{t(`landing.features.${f.key}.title`)}</h3>
                  <p className="mb-6 max-w-[48ch] text-[var(--ink)]/70">{t(`landing.features.${f.key}.text`)}</p>
                  <ul className="grid gap-2">
                    {(["b1", "b2", "b3"] as const).map((b) => (
                      <li key={b} className="flex items-start gap-3 border-t border-[var(--ink)]/10 pt-2 text-[15px]">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--moss)]" />
                        {t(`landing.features.${f.key}.${b}`)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`grain ${f.bg} reveal overflow-hidden rounded-[28px] p-[clamp(20px,4vw,56px)] md:col-span-7 ${i % 2 ? "md:order-1 md:col-start-1" : ""}`}>
                  <div className="relative z-[2]">{f.mock}</div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---- who ---- */}
        <section id="who" className="wrap section">
          <p className="micro mb-6 text-[var(--cream)]/45">{t("landing.who.label")}</p>
          <h2 className="display fs-h2 reveal mb-14 max-w-[16ch]">
            {t("landing.who.title")} <span className="accent text-[var(--lime)]">{t("landing.who.accent")}</span>
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            {(["clubs", "promoters", "small"] as const).map((k, i) => (
              <div key={k} className="reveal flex min-h-[360px] flex-col justify-between rounded-[28px] bg-[var(--cream)] p-7 text-[var(--ink)]">
                <div className="flex items-start justify-between">
                  <span className="micro text-[var(--ink)]/45">0{i + 1}</span>
                  <span className="text-3xl">{["🌱", "🎛️", "🧵"][i]}</span>
                </div>
                <div>
                  <h3 className="display fs-h3 mb-3">{t(`landing.who.${k}.title`)}</h3>
                  <p className="text-[15px] text-[var(--ink)]/70">{t(`landing.who.${k}.text`)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- trust ---- */}
        <section className="border-y border-white/10">
          <div className="wrap grid gap-px py-2 sm:grid-cols-2 lg:grid-cols-4">
            {(["gdpr", "data", "easy", "berlin"] as const).map((k) => (
              <div key={k} className="reveal py-8 pr-6">
                <p className="display mb-2 text-xl">{t(`landing.trust.${k}.title`)}</p>
                <p className="text-sm text-[var(--cream)]/60">{t(`landing.trust.${k}.text`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---- pricing ---- */}
        <section id="pricing" className="wrap section">
          <div className="grain grad-dusk overflow-hidden rounded-[28px] p-[clamp(28px,6vw,80px)]">
            <div className="relative z-[2] grid items-end gap-10 md:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="micro mb-6 text-white/60">{t("landing.pricing.label")}</p>
                <h2 className="display fs-h2 mb-6 max-w-[14ch]">
                  {t("landing.pricing.title")} <span className="accent">{t("landing.pricing.accent")}</span>
                </h2>
                <p className="fs-lead max-w-[44ch] text-white/75">{t("landing.pricing.text")}</p>
              </div>
              <div className="rounded-[22px] bg-[var(--ink)]/70 p-7 backdrop-blur">
                <p className="micro text-white/55">{t("landing.pricing.planLabel")}</p>
                <p className="display my-3 text-6xl">0 €</p>
                <p className="mb-6 text-sm text-white/65">{t("landing.pricing.planText")}</p>
                <Cta href={SIGNUP}>{t("landing.hero.cta")}</Cta>
              </div>
            </div>
          </div>
        </section>

        {/* ---- final CTA ---- */}
        <section className="wrap pb-[clamp(96px,12vw,180px)]">
          <a href={SIGNUP} className="group block">
            <p className="micro mb-4 text-[var(--cream)]/45">{t("landing.final.label")}</p>
            <div className="display fs-giant flex flex-wrap items-end justify-between gap-x-8 leading-[0.85]">
              <span>{t("landing.final.title")}</span>
              <ArrowUpRightIcon className="size-[0.8em] text-[var(--pink)] transition-transform duration-500 group-hover:translate-x-3 group-hover:-translate-y-3" strokeWidth={1.6} />
            </div>
          </a>
        </section>
      </div>

      {/* ---- footer, revealed underneath ---- */}
      <footer className="sticky bottom-0 z-0 h-[min(100svh,880px)] overflow-hidden">
        <FooterScene className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--ink)]/10 via-transparent to-[var(--ink)]/70" />
        <div className="wrap relative flex h-full flex-col justify-between py-10">
          <div className="flex flex-wrap justify-between gap-8 text-sm">
            <p className="max-w-[34ch] text-[var(--cream)]/85">{t("landing.footer.claim")}</p>
            <div className="flex gap-12">
              <ul className="grid gap-1.5">
                <li className="micro mb-1 text-[var(--cream)]/55">{t("landing.footer.product")}</li>
                {(["product", "who", "pricing"] as const).map((k) => (
                  <li key={k}>
                    <a href={`#${k}`} className="hover:text-[var(--lime)]">
                      {t(`landing.nav.${k}`)}
                    </a>
                  </li>
                ))}
              </ul>
              <ul className="grid content-start gap-1.5">
                <li className="micro mb-1 text-[var(--cream)]/55">{t("landing.footer.account")}</li>
                <li>
                  <a href={APP} className="hover:text-[var(--lime)]">
                    {t("landing.nav.login")}
                  </a>
                </li>
                <li>
                  <a href={SIGNUP} className="hover:text-[var(--lime)]">
                    {t("landing.nav.start")}
                  </a>
                </li>
                <li>
                  <a href="/api/docs" className="hover:text-[var(--lime)]">
                    API
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div>
            <p className="display text-[clamp(96px,26vw,380px)] leading-[0.78] tracking-[-0.06em]">
              roots<span className="text-[var(--lime)]">.</span>
            </p>
            <p className="micro mt-4 flex flex-wrap justify-between gap-4 text-[var(--cream)]/60">
              <span>{t("landing.footer.grassroots")}</span>
              <span>© roots · Berlin</span>
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}
