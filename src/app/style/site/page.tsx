import { DeviceBrowser, DeviceLaptop, DevicePhone } from "@/app/site/_components/devices"
import { DashboardMock, FormMailMock, InvoiceMock, MembersMock, PayrollMock, ScannerMock, ShiftsMock } from "@/app/site/_components/mocks"
import { SiteShell } from "@/app/site/_components/site-shell"
import { FaqItem, FeatureText, HalftoneBand, InlineCta, ModuleRow, Painting, Pill, SectionHead, Tag, ValueCard } from "@/app/site/_components/ui"
import { WireContours, WirePanels, WireSpheres } from "@/app/site/_components/wireframes"
import { PAINTINGS } from "@/app/site/paintings"

// The website's look: every building block of the landing page in one place. Sheet: docs/design/site.md.
function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rule grid gap-6 py-14">
      <div className="grid gap-1">
        <p className="label">{title}</p>
        {note && <p className="soft max-w-[70ch] text-[14px]">{note}</p>}
      </div>
      {children}
    </section>
  )
}

const COLORS = [
  ["--paper", "#f5f1e8"],
  ["--paper-2", "#ece6d8"],
  ["--ink", "#191813"],
  ["--ink-soft", "ink 62 %"],
  ["--line", "ink 14 %"],
  ["--olive", "#4d5a2c"],
  ["--umber", "#8a5a2b"],
]

export default function SiteStyle() {
  return (
    <SiteShell>
      <main className="wrap pt-14 pb-24">
        <header className="grid gap-4 pb-10">
          <Tag>Style · Website</Tag>
          <h1 className="display fs-h2">
            Paper, ink <em>and paintings.</em>
          </h1>
          <p className="fs-lead soft max-w-[60ch]">Tokens in src/app/site/site.css, components in src/app/site/_components, rules in docs/design/site.md.</p>
        </header>

        <Block title="Colour">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
            {COLORS.map(([name, value]) => (
              <div key={name} className="grid gap-2">
                <div className="h-16 border border-[var(--line)]" style={{ background: `var(${name})` }} />
                <span className="text-[13px]">{name}</span>
                <span className="soft text-[12px]">{value}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Type" note="Hanken Grotesk only. Accents are two-tone (lighter colour), never a second typeface.">
          <div className="grid gap-6">
            <p className="display fs-hero">
              Hero, <em>accent.</em>
            </p>
            <p className="display fs-h2">
              Section headline <em>with accent</em>
            </p>
            <p className="display fs-h3">Feature title (fs-h3)</p>
            <p className="fs-lead soft max-w-[52ch]">Lead text (fs-lead, soft): Mitglieder und Beiträge, Tickets und Einlass – an einem Ort.</p>
            <p className="max-w-[60ch]">Body text (16 px, +0.012em tracking). Grassroots heißt: Menschen organisieren sich selbst.</p>
            <p className="label soft">Label · uppercase · 0.12em</p>
          </div>
        </Block>

        <Block title="Buttons, tags, links">
          <div className="flex flex-wrap items-center gap-6">
            <Pill href="#">Kostenlos starten</Pill>
            <div className="bg-[var(--ink)] p-4">
              <Pill href="#" light>
                On dark
              </Pill>
            </div>
            <Tag>Warum roots</Tag>
            <a href="#" className="link text-[15px]">
              Text link
            </a>
          </div>
        </Block>

        <Block title="Section head">
          <div className="grid gap-12 md:grid-cols-2">
            <SectionHead tag="Module" title="Alle Module" />
            <SectionHead
              tag="Warum roots"
              center
              title={
                <>
                  Ein Ort für alles, <em>was euch trägt.</em>
                </>
              }
            />
          </div>
        </Block>

        <Block title="Inline CTA" note="The earlier final CTA: a big sentence with the button inside the line. Kept for later use.">
          <InlineCta before="Fangt heute an," pill="Kostenlos starten" after="gemeinsam." href="#" />
          <InlineCta before="Eine Software" pill="Alle Module" after="für die ganze Arbeit dahinter." href="#" />
        </Block>

        <Block title="Halftone band" note="Canvas halftone that builds up when it comes into view. For one dark CTA band, not the hero.">
          <HalftoneBand k="dance" title="Fangt heute an," accent="gemeinsam." text="Kostenlos während der Beta, ohne Kreditkarte." cta="Kostenlos starten" href="#" />
        </Block>

        <Block title="Value cards (line-art)">
          <div className="grid gap-4 md:grid-cols-3">
            <ValueCard art={<WirePanels />} title="Ein Ort statt zehn Tools" text="Mitglieder, Geld, Events und Kommunikation teilen sich dieselben Kontakte." />
            <ValueCard art={<WireContours />} title="Gewachsen von unten" text="Gebaut mit Vorständen, Kassenwarten und Clubbetreiber:innen." />
            <ValueCard art={<WireSpheres />} title="Alles hängt zusammen" text="Ein Ticketkauf wird zum Kontakt, ein Antrag zur Mitgliedschaft." />
          </div>
        </Block>

        <Block title="Paintings" note="Public domain, few and deliberate, with museum captions. Mocks float on them. Corner marks (.ticks) on key frames.">
          <div className="grid gap-6 md:grid-cols-2">
            <Painting k="dance" sizes="640px" className="aspect-[16/10]" position="35% 55%">
              <div className="absolute top-1/2 right-[8%] z-[2] w-[30%] -translate-y-1/2">
                <DevicePhone>
                  <ScannerMock />
                </DevicePhone>
              </div>
            </Painting>
            <div className="ticks">
              <Painting k="galette" sizes="640px" className="aspect-[16/10]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {(Object.keys(PAINTINGS) as (keyof typeof PAINTINGS)[]).map((k) => (
              <Painting key={k} k={k} sizes="260px" className="aspect-square" />
            ))}
          </div>
        </Block>

        <Block title="Device mocks" note="CSS frames with a fake, animated app inside. Never screenshots.">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <DeviceLaptop>
              <DashboardMock />
            </DeviceLaptop>
            <div className="mx-auto w-[min(70%,260px)]">
              <DevicePhone>
                <ScannerMock />
              </DevicePhone>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[10px] bg-[var(--paper-2)] p-6">
              <DeviceBrowser url="app.roots.de/members">
                <MembersMock />
              </DeviceBrowser>
            </div>
            <div className="rounded-[10px] bg-[var(--paper-2)] p-6">
              <DeviceBrowser url="app.roots.de/shifts">
                <ShiftsMock />
              </DeviceBrowser>
            </div>
            <div className="rounded-[10px] bg-[var(--paper-2)] p-6">
              <DeviceBrowser url="app.roots.de/hr/payroll">
                <PayrollMock />
              </DeviceBrowser>
            </div>
            <div className="rounded-[10px] bg-[var(--paper-2)] p-6">
              <DeviceBrowser url="tsv-sued.roots.de/f/mitglied-werden">
                <FormMailMock />
              </DeviceBrowser>
            </div>
            <div className="rounded-[10px] bg-[var(--paper-2)] p-6">
              <InvoiceMock />
            </div>
          </div>
        </Block>

        <Block title="Feature text, module table, FAQ">
          <div className="grid gap-12 md:grid-cols-2">
            <FeatureText
              n={1}
              label="Mitglieder"
              title="Mitglieder und Beiträge, ohne Zettelwirtschaft."
              text="Mitgliedsarten, Nummern, Ein- und Austritte, SEPA-Mandate."
              bullets={["Import aus Excel", "SEPA-Lastschrift", "Mitgliederbereich"]}
            />
            <div>
              <dl className="border-b border-[var(--line)]">
                <ModuleRow n={1} name="Kontakte" text="Alle Menschen an einem Ort, mit Tags und eigenen Feldern." />
                <ModuleRow n={2} name="Mitglieder" text="Mitgliedsarten, Nummern, Beiträge, SEPA-Lastschrift." />
              </dl>
              <div className="mt-10 border-b border-[var(--line)]">
                <FaqItem q="Wo liegen unsere Daten?" a="Auf Servern in der EU." />
                <FaqItem q="Was kostet roots?" a="Während der Beta nichts." />
              </div>
            </div>
          </div>
        </Block>
      </main>
    </SiteShell>
  )
}
