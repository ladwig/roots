// Fake, simplified app screens for the website, animated with CSS loops (site.css). The demo data here is
// illustration (like a screenshot), not UI copy, so it stays in code; real copy lives in messages (site.*).
import { cn } from "@/lib/utils"

const delay = (s: number) => ({ animationDelay: `${s}s` })

function Badge({ children, tone = "moss" }: { children: React.ReactNode; tone?: "moss" | "lime" | "gray" | "pink" }) {
  const tones = { moss: "bg-[#14532d]/10 text-[#14532d]", lime: "bg-[#dfe7c6] text-[#0c0d0b]", gray: "bg-black/5 text-black/55", pink: "bg-[#8a5a2b]/12 text-[#7a4a1d]" }
  return <span className={cn("inline-flex h-[1.6em] items-center rounded-full px-[0.7em] text-[0.82em] font-medium whitespace-nowrap", tones[tone])}>{children}</span>
}

/** Hero: the app's home with numbers, a sales chart and live activity. */
export function DashboardMock() {
  const nav = ["Start", "Kontakte", "Mitglieder", "Events", "Tickets", "Schichten", "E-Mail"]
  const bars = [28, 46, 38, 62, 54, 80, 72, 96, 88, 100, 76, 92]
  const feed = [
    ["Lena Krüger ist Mitglied geworden", "Mitglieder", "lime"],
    ["2 Tickets · Sommerfest", "Tickets", "moss"],
    ["Mitgliedsantrag eingegangen", "Formulare", "pink"],
    ["Schicht Tresen 20–24 Uhr besetzt", "Schichten", "gray"],
  ] as const
  return (
    <div className="flex h-full text-[clamp(7px,0.85vw,12px)]">
      <aside className="hidden w-[18%] flex-col gap-[0.5em] border-r border-black/5 bg-[#f3efe6] p-[1.2em] sm:flex">
        <div className="mb-[0.8em] flex items-center gap-[0.5em] font-semibold">
          <span className="size-[1.6em] rounded-[0.45em] bg-[#14532d]" /> Kulturverein Süd
        </div>
        {nav.map((n, i) => (
          <div key={n} className={cn("rounded-[0.5em] px-[0.6em] py-[0.35em]", i === 0 ? "bg-black/[.06] font-medium" : "text-black/55")}>
            {n}
          </div>
        ))}
      </aside>
      <div className="flex flex-1 flex-col gap-[1.1em] p-[1.4em]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-black/45">Montag, 12. Oktober</div>
            <div className="text-[1.6em] font-semibold tracking-tight">Guten Morgen</div>
          </div>
          <span className="rounded-full bg-[#dfe7c6] px-[0.9em] py-[0.4em] font-medium">+ Neu</span>
        </div>
        <div className="grid grid-cols-3 gap-[0.8em]">
          {[
            ["Aktive Mitglieder", "248", "+12 diesen Monat"],
            ["Tickets verkauft", "1.320", "Sommerfest 86 %"],
            ["Offene Beiträge", "1.240 €", "SEPA am 15."],
          ].map(([l, v, s]) => (
            <div key={l} className="rounded-[0.8em] border border-black/5 bg-white p-[0.9em]">
              <div className="text-black/45">{l}</div>
              <div className="text-[1.7em] font-semibold tracking-tight">{v}</div>
              <div className="text-[0.9em] text-[#14532d]">{s}</div>
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-[1.4fr_1fr] gap-[0.8em]">
          <div className="flex flex-col rounded-[0.8em] border border-black/5 bg-white p-[0.9em]">
            <div className="mb-[0.6em] flex justify-between">
              <span className="font-medium">Ticketverkauf</span>
              <Badge tone="gray">30 Tage</Badge>
            </div>
            <div className="flex flex-1 items-end gap-[0.4em]">
              {bars.map((h, i) => (
                <div key={i} className="anim-bar flex-1 rounded-t-[0.3em] bg-[#14532d]" style={{ height: `${h}%`, ...delay(0.15 * i), opacity: i === bars.length - 2 ? 1 : 0.85 }} />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-[0.5em] overflow-hidden rounded-[0.8em] border border-black/5 bg-white p-[0.9em]">
            <span className="font-medium">Gerade passiert</span>
            {feed.map(([text, tag, tone], i) => (
              <div key={text} className="anim-row flex items-center justify-between gap-[0.5em] rounded-[0.5em] bg-[#f6f3ec] px-[0.6em] py-[0.45em]" style={delay(i * 1.4)}>
                <span className="truncate">{text}</span>
                <Badge tone={tone}>{tag}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** A QR-looking code: three finder squares + a fixed pseudo-random module pattern (11×11). */
function QrCode() {
  const finder = (x: number, y: number) => x < 3 && y < 3 ? true : x > 7 && y < 3 ? true : x < 3 && y > 7
  return (
    <div className="absolute inset-0 grid grid-cols-11 gap-[2px] rounded-[0.6em] bg-white p-[9%]">
      {Array.from({ length: 121 }, (_, i) => {
        const x = i % 11
        const y = Math.floor(i / 11)
        const inFinder = finder(x, y)
        const ring = inFinder && (x % 8 === 0 || x % 8 === 2 || y % 8 === 0 || y % 8 === 2 || (x % 8 === 1 && y % 8 === 1))
        const on = inFinder ? ring : (x * 7 + y * 13 + x * y) % 3 === 0
        return <span key={i} className={on ? "rounded-[1px] bg-black" : ""} />
      })}
    </div>
  )
}

/** Phone: door check-in, a QR code gets scanned and turns green. */
export function ScannerMock() {
  return (
    <div className="flex h-full flex-col text-[1em]">
      <div className="px-[1.4em] pt-[1.1em] pb-[0.8em]">
        <div className="text-black/45">Einlass · Sommerfest</div>
        <div className="text-[1.35em] font-semibold leading-tight tracking-tight">612 / 800 drin</div>
        <div className="mt-[0.6em] h-[0.4em] overflow-hidden rounded-full bg-black/10">
          <div className="h-full w-[76%] rounded-full bg-[#14532d]" />
        </div>
      </div>
      <div className="relative mx-[1em] flex-1 overflow-hidden rounded-[1.6em] bg-[#111]">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,#2a2a2a,#0b0b0b)]" />
        <div className="absolute top-[42%] left-1/2 aspect-square w-[64%] -translate-x-1/2 -translate-y-1/2">
          <QrCode />
          <div className="anim-scan absolute inset-x-[-6%] top-0 h-[3px] rounded-full bg-[#dfe7c6] shadow-[0_0_14px_#b9cf86]" />
          <div className="pointer-events-none absolute -inset-[8%] rounded-2xl border-2 border-white/70 [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)]" />
        </div>
        <div className="anim-ok absolute inset-x-[0.8em] bottom-[0.8em] rounded-[1.1em] bg-[#dfe7c6] p-[0.8em] text-[#0c0d0b]">
          <div className="text-[1.15em] font-semibold">✓ Gültig</div>
          <div className="text-[0.85em] opacity-75">Max Mustermann · Frühbucher</div>
        </div>
      </div>
      <div className="flex justify-around px-[1.6em] py-[1em] text-[0.8em] text-black/45">
        <span className="font-semibold text-black">Scannen</span>
        <span>Tickets</span>
        <span>Gäste</span>
      </div>
    </div>
  )
}

/** Browser: member list with numbers, types and a SEPA run. */
export function MembersMock() {
  const rows = [
    ["M-0101", "Lena Krüger", "Vollmitglied", "aktiv"],
    ["M-0102", "Murat Yılmaz", "Ermäßigt", "aktiv"],
    ["M-0103", "Sophie Wagner", "Familie", "aktiv"],
    ["M-0104", "Jonas Becker", "Vollmitglied", "endet 31.12."],
    ["M-0105", "Ana Ribeiro", "Fördermitglied", "aktiv"],
  ]
  return (
    <div className="relative p-[1.4em] text-[clamp(8px,0.9vw,12.5px)]">
      <div className="mb-[1em] flex items-center justify-between">
        <div className="text-[1.5em] font-semibold tracking-tight">Mitglieder</div>
        <div className="flex gap-[0.5em]">
          <span className="rounded-full border border-black/10 px-[0.9em] py-[0.35em]">Exportieren</span>
          <span className="rounded-full bg-[#14532d] px-[0.9em] py-[0.35em] text-white">+ Neues Mitglied</span>
        </div>
      </div>
      <div className="mb-[0.8em] flex gap-[0.4em]">
        <Badge tone="lime">Aktiv</Badge>
        <Badge tone="gray">Ausgetreten</Badge>
        <Badge tone="gray">Jugend</Badge>
      </div>
      <div className="overflow-hidden rounded-[0.8em] border border-black/5 bg-white">
        {rows.map(([no, name, type, status], i) => (
          <div key={no} className={cn("grid grid-cols-[0.8fr_1.6fr_1.2fr_1fr] items-center gap-[0.5em] px-[1em] py-[0.7em]", i && "border-t border-black/5")}>
            <span className="font-mono text-black/45">{no}</span>
            <span className="font-medium">{name}</span>
            <span className="text-black/60">{type}</span>
            <span>
              <Badge tone={status === "aktiv" ? "moss" : "gray"}>{status}</Badge>
            </span>
          </div>
        ))}
      </div>
      <div className="anim-drop absolute right-[1.4em] bottom-[1.4em] flex items-center gap-[0.6em] rounded-[0.9em] bg-[#0c0d0b] px-[1em] py-[0.8em] text-white shadow-xl" style={delay(1)}>
        <span className="grid size-[2em] place-items-center rounded-full bg-[#dfe7c6] text-[#0c0d0b]">€</span>
        <span>
          <span className="block font-medium">SEPA-Datei erstellt</span>
          <span className="text-white/60">212 Lastschriften · 9.540 €</span>
        </span>
      </div>
    </div>
  )
}

/** Shift plan: a week, shifts drop in. */
export function ShiftsMock() {
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
  const chips: [number, number, number, string, string][] = [
    [4, 1, 2, "Tresen", "#dfe7c6"],
    [4, 3, 2, "Einlass", "#ecd9c6"],
    [5, 0, 2, "Aufbau", "#cfe6d6"],
    [5, 2, 3, "Tresen", "#dfe7c6"],
    [5, 3, 2, "Garderobe", "#e6dcc8"],
    [1, 2, 2, "Training", "#cfe6d6"],
  ]
  return (
    <div className="p-[1.2em] text-[clamp(8px,0.9vw,12px)]">
      <div className="mb-[0.8em] flex items-center justify-between">
        <span className="text-[1.4em] font-semibold tracking-tight">Schichtplan</span>
        <Badge tone="gray">12.–18. Okt.</Badge>
      </div>
      <div className="grid grid-cols-7 gap-[0.4em]">
        {days.map((d) => (
          <div key={d} className="text-center text-black/45">
            {d}
          </div>
        ))}
        {days.map((d, col) => (
          <div key={d} className="relative h-[13em] rounded-[0.6em] bg-white">
            {chips
              .filter(([c]) => c === col)
              .map(([, top, h, label, color], i) => (
                <div
                  key={label + top}
                  className="anim-drop absolute inset-x-[0.25em] rounded-[0.45em] px-[0.4em] py-[0.3em] font-medium"
                  style={{ top: `${top * 3}em`, height: `${h * 2.8}em`, background: color, ...delay(col * 0.4 + i * 0.6) }}
                >
                  {label}
                  <span className="block text-[0.85em] font-normal opacity-60">{i % 2 ? "2/2" : "1/2"}</span>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Form → email: someone fills in a membership application, the welcome mail follows. */
export function FormMailMock() {
  return (
    <div className="grid gap-[0.8em] p-[1.2em] text-[clamp(8px,0.9vw,12.5px)] sm:grid-cols-2">
      <div className="rounded-[0.9em] bg-white p-[1em]">
        <div className="mb-[0.8em] text-[1.3em] font-semibold tracking-tight">Mitglied werden</div>
        {[
          ["Name", "Paula Schneider"],
          ["E-Mail", "paula@posteo.de"],
          ["IBAN", "DE02 1203 0000 0000 2020 51"],
        ].map(([l, v], i) => (
          <div key={l} className="mb-[0.6em]">
            <div className="text-black/45">{l}</div>
            <div className="rounded-[0.5em] border border-black/10 px-[0.6em] py-[0.4em]">
              <span className="anim-type inline-block align-bottom" style={delay(i * 0.6)}>
                {v}
              </span>
            </div>
          </div>
        ))}
        <div className="mt-[0.8em] rounded-full bg-[#14532d] py-[0.5em] text-center text-white">Absenden</div>
      </div>
      <div className="anim-drop rounded-[0.9em] bg-[#0c0d0b] p-[1em] text-white" style={delay(2.5)}>
        <div className="text-white/50">Automation · sofort</div>
        <div className="mb-[0.6em] text-[1.2em] font-semibold">Willkommen, Paula</div>
        <p className="text-white/70">Schön, dass du dabei bist. Deine Mitgliedsnummer ist M-0106. Im Mitgliederbereich siehst du jederzeit deine Daten.</p>
        <div className="mt-[0.8em] inline-block rounded-full bg-[#dfe7c6] px-[0.9em] py-[0.35em] text-[#0c0d0b]">Zum Mitgliederbereich</div>
      </div>
    </div>
  )
}

/** One A4 sheet; text scales with the sheet's width (container units). */
function Sheet({ kind, number, lines, total, stamp, className, style }: { kind: string; number: string; lines: [string, string][]; total: string; stamp?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn("absolute aspect-[1/1.414] rounded-[4px] bg-white text-[#191813] shadow-[0_24px_50px_-20px_rgb(0_0_0/.45)] [container-type:inline-size]", className)} style={style}>
      <div className="flex h-full flex-col p-[9cqi] text-[3.4cqi] leading-[1.45]">
        <div className="flex items-start justify-between">
          <span className="font-semibold">Kulturverein Süd e.V.</span>
          <span className="size-[7cqi] rounded-[1cqi] bg-[#4d5a2c]" />
        </div>
        <div className="mt-[12cqi] text-[2.8cqi] text-black/45">Kulturverein Süd e.V. · Weg 1 · 50667 Köln</div>
        <div className="mt-[1cqi]">Agentur Nordlicht GmbH<br />Hafenstraße 5, 20457 Hamburg</div>
        <div className="mt-[9cqi] text-[5.6cqi] font-semibold tracking-tight">
          {kind} {number}
        </div>
        <div className="mt-[4cqi] grid">
          {lines.map(([a, b]) => (
            <div key={a} className="flex justify-between gap-[3cqi] border-b border-black/[.06] py-[1.6cqi]">
              <span className="truncate">{a}</span>
              <span className="whitespace-nowrap tabular-nums">{b}</span>
            </div>
          ))}
        </div>
        <div className="mt-[4cqi] ml-auto grid w-[55%] gap-[0.6cqi] whitespace-nowrap tabular-nums">
          <div className="flex justify-between">
            <span>Netto</span>
            <span>{total}</span>
          </div>
          <div className="flex justify-between text-black/55">
            <span>USt 19 %</span>
            <span>155,80 €</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Gesamt</span>
            <span>975,80 €</span>
          </div>
        </div>
        <div className="mt-auto text-[2.6cqi] text-black/40">IBAN DE02 1203 0000 0000 2020 51 · St.-Nr. 214/5678/0912</div>
      </div>
      {stamp && (
        <div className="anim-drop absolute right-[10%] bottom-[16%] rotate-[-6deg] rounded-[1.4cqi] border-[0.5cqi] border-[#4d5a2c] px-[3cqi] py-[1cqi] text-[5cqi] font-bold tracking-wide text-[#4d5a2c] uppercase" style={delay(1.5)}>
          {stamp}
        </div>
      )}
    </div>
  )
}

/** Quote and invoice fanned out, with the action bar of the document editor. Fills a wide box. */
export function InvoiceMock() {
  const lines: [string, string][] = [
    ["Raummiete Saal", "450,00 €"],
    ["Technik & Betreuung", "280,00 €"],
    ["Reinigung (pauschal)", "90,00 €"],
  ]
  return (
    <div className="relative aspect-[16/11] w-full">
      <Sheet kind="Angebot" number="AN-2026-0017" lines={lines} total="820,00 €" className="top-[8%] left-[10%] w-[38%] -rotate-[5deg] opacity-90" />
      <Sheet kind="Rechnung" number="RE-2026-0042" lines={lines} total="820,00 €" stamp="Bezahlt" className="top-[3%] left-[38%] w-[40%] rotate-[2deg]" />
      <div className="anim-drop absolute right-[4%] bottom-[6%] flex items-center gap-[0.8em] rounded-[8px] bg-[#191813] px-[1em] py-[0.7em] text-[clamp(9px,1vw,13px)] text-white shadow-xl" style={delay(0.6)}>
        <span className="text-white/55">RE-2026-0042</span>
        <span className="rounded-[5px] bg-white/10 px-[0.7em] py-[0.3em]">PDF herunterladen</span>
        <span className="rounded-[5px] bg-[#dfe7c6] px-[0.7em] py-[0.3em] text-[#191813]">Als bezahlt markieren</span>
      </div>
      <div className="anim-drop absolute top-[10%] left-[2%] rounded-[8px] bg-white px-[1em] py-[0.7em] text-[clamp(9px,1vw,13px)] shadow-lg" style={delay(0.2)}>
        <span className="text-black/45">Angebot angenommen</span>
        <span className="block font-medium">→ Rechnung erstellt</span>
      </div>
    </div>
  )
}

/** Contacts: one list, tags, where each person comes from. */
export function ContactsMock() {
  const rows = [
    ["LK", "Lena Krüger", ["Mitglied", "Vorstand"], "Mitgliedsantrag"],
    ["MY", "Murat Yılmaz", ["Ticketkauf"], "Sommerfest"],
    ["SW", "Sophie Wagner", ["Newsletter"], "Formular"],
    ["JB", "Jonas Becker", ["Mitglied", "Jugend"], "Import"],
    ["AR", "Ana Ribeiro", ["Artist"], "Gästeliste"],
  ] as const
  return (
    <div className="p-[1.2em] text-[clamp(8px,0.9vw,12.5px)]">
      <div className="mb-[0.9em] flex items-center justify-between">
        <span className="text-[1.4em] font-semibold tracking-tight">Kontakte</span>
        <span className="rounded-[5px] border border-black/10 px-[0.8em] py-[0.3em] text-black/55">Suchen …</span>
      </div>
      <div className="overflow-hidden rounded-[0.7em] border border-black/5 bg-white">
        {rows.map(([ini, name, tags, from], i) => (
          <div key={name} className={cn("anim-row grid grid-cols-[2.2em_1.3fr_1.4fr_1fr] items-center gap-[0.7em] px-[0.9em] py-[0.6em]", i && "border-t border-black/5")} style={delay(i * 0.5)}>
            <span className="grid size-[2.2em] place-items-center rounded-full bg-[#e9e4d6] text-[0.85em] font-medium">{ini}</span>
            <span className="font-medium">{name}</span>
            <span className="flex flex-wrap gap-[0.3em]">
              {tags.map((t) => (
                <Badge key={t} tone={t === "Mitglied" ? "moss" : "gray"}>
                  {t}
                </Badge>
              ))}
            </span>
            <span className="text-black/45">{from}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Events: timetable of the night next to the guest list at the door. */
export function LineupMock() {
  const acts = [
    ["22:00", "Mira Lenz", "Floor"],
    ["23:30", "Kollektiv Süd", "Floor"],
    ["01:00", "DJ Okafor", "Floor"],
    ["02:30", "Lia & Ben", "Garten"],
  ]
  const guests = [
    ["Anna S.", "+1", true],
    ["Tom K.", "", true],
    ["Crew: Mo", "", false],
    ["Lisa M.", "+2", false],
  ] as const
  return (
    <div className="grid gap-[0.8em] p-[1.2em] text-[clamp(8px,0.9vw,12.5px)] sm:grid-cols-[1.2fr_1fr]">
      <div className="rounded-[0.8em] bg-white p-[1em]">
        <div className="mb-[0.7em] flex items-center justify-between">
          <span className="text-[1.3em] font-semibold tracking-tight">Timetable</span>
          <Badge tone="gray">Sa, 18. Okt.</Badge>
        </div>
        {acts.map(([time, act, stage], i) => (
          <div key={act} className="anim-row flex items-center gap-[0.8em] border-t border-black/5 py-[0.55em]" style={delay(i * 0.4)}>
            <span className="w-[3.2em] font-mono text-black/45">{time}</span>
            <span className="flex-1 font-medium">{act}</span>
            <span className="text-black/45">{stage}</span>
          </div>
        ))}
      </div>
      <div className="rounded-[0.8em] bg-white p-[1em]">
        <div className="mb-[0.7em] flex items-center justify-between">
          <span className="text-[1.3em] font-semibold tracking-tight">Gästeliste</span>
          <span className="text-black/45">2 / 9 drin</span>
        </div>
        {guests.map(([name, plus, inside], i) => (
          <div key={name} className="flex items-center gap-[0.6em] border-t border-black/5 py-[0.55em]">
            <span className={cn("grid size-[1.4em] place-items-center rounded-[0.3em] border text-[0.8em]", inside ? "anim-drop border-[#4d5a2c] bg-[#4d5a2c] text-white" : "border-black/20")} style={delay(1 + i * 0.6)}>
              {inside ? "✓" : ""}
            </span>
            <span className="flex-1">{name}</span>
            <span className="text-black/45">{plus}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Phone: the member area – membership, dues, change details, cancel. */
export function PortalMock() {
  return (
    <div className="flex h-full flex-col gap-[0.8em] px-[1.2em] pt-[1em] text-[1em]">
      <div>
        <div className="text-[0.8em] text-black/45">TSV Süd · Mitgliederbereich</div>
        <div className="text-[1.35em] leading-tight font-semibold">Hallo Paula</div>
      </div>
      <div className="rounded-[1em] bg-[#191813] p-[1em] text-white">
        <div className="text-[0.75em] text-white/55">Mitgliedschaft</div>
        <div className="text-[1.15em] font-semibold">Vollmitglied</div>
        <div className="mt-[0.6em] flex justify-between text-[0.8em] text-white/70">
          <span>Nr. M-0106</span>
          <span>seit 03/2026</span>
        </div>
      </div>
      <div className="grid gap-[0.4em] text-[0.85em]">
        {[
          ["Beitrag 2026", "bezahlt"],
          ["Umlage Halle", "offen"],
        ].map(([a, b]) => (
          <div key={a} className="flex justify-between rounded-[0.6em] bg-white px-[0.8em] py-[0.55em]">
            <span>{a}</span>
            <span className={b === "offen" ? "text-[#8a5a2b]" : "text-[#4d5a2c]"}>{b}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto mb-[1.2em] grid gap-[0.4em] text-center text-[0.8em]">
        <span className="rounded-[0.5em] bg-[#191813] py-[0.6em] text-white">Daten ändern</span>
        <span className="py-[0.4em] text-black/50">Mitgliedschaft kündigen</span>
      </div>
    </div>
  )
}

/** HR: payroll preparation for a month – approved hours, absences, gross, a Minijob warning. */
export function PayrollMock() {
  const rows: [string, string, string, string, string, boolean?][] = [
    ["Lena Krüger", "Teilzeit", "86,5 h", "Urlaub 3", "1.297 €"],
    ["Murat Yılmaz", "Minijob", "44,0 h", "–", "616 €", true],
    ["Sophie Wagner", "Vollzeit", "Gehalt", "Krank 1", "3.100 €"],
    ["Jonas Becker", "Werkstudent", "62,0 h", "–", "930 €"],
  ]
  return (
    <div className="relative p-[1.4em] text-[clamp(8px,0.9vw,12.5px)]">
      <div className="mb-[1em] flex items-center justify-between">
        <div className="text-[1.5em] font-semibold tracking-tight">Lohnvorbereitung · Oktober</div>
        <span className="rounded-full border border-black/10 px-[0.9em] py-[0.35em]">Fürs Steuerbüro exportieren</span>
      </div>
      <div className="overflow-hidden rounded-[0.8em] border border-black/5 bg-white">
        {rows.map(([name, type, hours, absent, gross, warn], i) => (
          <div key={name} className={cn("grid grid-cols-[1.5fr_1fr_0.8fr_0.9fr_0.9fr] items-center gap-[0.5em] px-[1em] py-[0.7em]", i && "border-t border-black/5")}>
            <span className="grid">
              <span className="font-medium">{name}</span>
              <span className="text-black/45">{type}</span>
            </span>
            <span className="tabular-nums">{hours}</span>
            <span className="text-black/60">{absent}</span>
            <span className="tabular-nums">{gross}</span>
            <span>{warn ? <Badge tone="pink">über Minijob-Grenze</Badge> : <Badge tone="moss">freigegeben</Badge>}</span>
          </div>
        ))}
      </div>
      <div className="anim-drop absolute right-[1.4em] bottom-[1.4em] flex items-center gap-[0.6em] rounded-[0.9em] bg-[#0c0d0b] px-[1em] py-[0.8em] text-white shadow-xl" style={delay(1)}>
        <span className="grid size-[2em] place-items-center rounded-full bg-[#dfe7c6] text-[#0c0d0b]">✓</span>
        <span>
          <span className="block font-medium">Stunden freigegeben</span>
          <span className="text-white/60">aus der Zeiterfassung · 236,5 h</span>
        </span>
      </div>
    </div>
  )
}

/** Automations canvas: a trial-visit flow (check-in → count → 4th visit → email), steps dropping in one by one. */
export function AutomationsMock() {
  const node = (kind: string, title: string, d: number, tone: "dark" | "light" = "light") => (
    <div
      className={cn("anim-drop w-[15em] rounded-[0.8em] border px-[0.9em] py-[0.6em] shadow-[0_8px_20px_-12px_rgb(0_0_0/.35)]", tone === "dark" ? "border-transparent bg-[#0c0d0b] text-white" : "border-black/10 bg-white")}
      style={delay(d)}
    >
      <div className={cn("text-[0.85em]", tone === "dark" ? "text-white/55" : "text-black/45")}>{kind}</div>
      <div className="font-semibold">{title}</div>
    </div>
  )
  const line = (d: number, label?: string) => (
    <div className="anim-drop flex h-[1.6em] items-center gap-[0.5em]" style={delay(d)}>
      <span className="h-full w-px bg-black/25" />
      {label && <Badge tone="lime">{label}</Badge>}
    </div>
  )
  return (
    <div className="grid justify-items-center bg-[radial-gradient(rgb(0_0_0/.12)_1px,transparent_1px)] [background-size:1.2em_1.2em] p-[1.4em] text-[clamp(8px,0.95vw,13px)]">
      {node("Auslöser", "Mitglied beim Einlass eingecheckt", 0, "dark")}
      {line(0.4)}
      {node("Bedingung", "Zählt als Probebesuch?", 0.6)}
      {line(1, "ja")}
      {node("Feld ändern", "Probebesuche + 1", 1.2)}
      {line(1.6)}
      {node("Bedingung", "4. Besuch?", 1.8)}
      {line(2.2, "ja")}
      <div className="flex gap-[0.8em]">
        {node("E-Mail", "Mitgliedsantrag senden", 2.4)}
        {node("Team", "Benachrichtigung", 2.6)}
      </div>
    </div>
  )
}

/** Wiki: page tree on the left, a Notion-like page with icon, checklist and a share badge. */
export function WikiMock() {
  const tree = [
    ["📖", "Handbuch", 0],
    ["🍻", "Bar & Kasse", 1],
    ["🔑", "Schließdienst", 1],
    ["🔒", "Vorstand", 0],
    ["🗓️", "Protokolle", 1],
    ["🌍", "Hausordnung", 0],
  ] as const
  return (
    <div className="grid grid-cols-[11em_1fr] gap-[1em] p-[1.2em] text-[clamp(8px,0.9vw,12.5px)]">
      <div className="grid content-start gap-[0.2em] rounded-[0.7em] border border-black/5 bg-white p-[0.6em]">
        {tree.map(([icon, name, depth], i) => (
          <span key={name} className={cn("anim-row truncate rounded-[0.4em] px-[0.5em] py-[0.3em]", i === 1 && "bg-black/5 font-medium")} style={{ ...delay(i * 0.3), paddingLeft: `${0.5 + depth * 1.1}em` }}>
            {icon} {name}
          </span>
        ))}
      </div>
      <div className="grid content-start gap-[0.6em] rounded-[0.7em] border border-black/5 bg-white p-[1.2em]">
        <div className="flex items-start justify-between">
          <span className="text-[2.4em] leading-none">🍻</span>
          <Badge tone="lime">🌍 Öffentlich</Badge>
        </div>
        <div className="text-[1.7em] font-semibold tracking-tight">Bar & Kasse</div>
        <p className="text-black/60">So öffnest und schließt du die Bar. Bei Fragen: Kasse-Chat.</p>
        <div className="text-[1.1em] font-semibold">Abends</div>
        {["Kasse zählen und eintragen", "Kühlschränke auffüllen", "Musik leiser ab 23 Uhr"].map((x, i) => (
          <span key={x} className="anim-row flex items-center gap-[0.5em]" style={delay(1 + i * 0.4)}>
            <span className={cn("grid size-[1.1em] place-items-center rounded-[0.25em] border border-black/30 text-[0.8em]", i === 0 && "border-[#14532d] bg-[#14532d] text-white")}>{i === 0 ? "✓" : ""}</span>
            {x}
          </span>
        ))}
        <span className="mt-[0.3em] rounded-[0.4em] border border-dashed border-black/15 px-[0.6em] py-[0.4em] text-black/40">Tippe „/“ für Blöcke …</span>
      </div>
    </div>
  )
}

/** Cash book: balance tiles and the month's entries with numbers, tax area and receipt clips. */
export function CashbookMock() {
  const rows = [
    ["K-2026-0041", "Abendkasse Sa", "Wirtschaftl.", "+1.240,00 €", true],
    ["K-2026-0042", "Getränke Großhandel", "Wirtschaftl.", "−486,30 €", true],
    ["K-2026-0043", "Mitgliedsbeiträge bar", "Ideell", "+90,00 €", false],
    ["K-2026-0044", "Reinigung", "Ideell", "−120,00 €", true],
  ] as const
  return (
    <div className="grid gap-[0.8em] p-[1.2em] text-[clamp(8px,0.9vw,12.5px)]">
      <div className="flex items-center justify-between">
        <span className="text-[1.4em] font-semibold tracking-tight">Kassenbuch · Barkasse</span>
        <Badge tone="moss">Oktober</Badge>
      </div>
      <div className="grid grid-cols-3 gap-[0.6em]">
        {[["Anfang", "812,40 €"], ["Einnahmen", "1.330,00 €"], ["Endbestand", "1.536,10 €"]].map(([l, v]) => (
          <div key={l} className="rounded-[0.6em] border border-black/5 bg-white p-[0.7em]">
            <div className="text-black/45">{l}</div>
            <div className="text-[1.3em] font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-[0.7em] border border-black/5 bg-white">
        {rows.map(([no, text, area, amount, clip], i) => (
          <div key={no} className={cn("anim-row grid grid-cols-[6.5em_1fr_auto_auto] items-center gap-[0.7em] px-[0.9em] py-[0.55em]", i && "border-t border-black/5")} style={delay(i * 0.5)}>
            <span className="text-black/45 tabular-nums">{no}</span>
            <span className="truncate font-medium">
              {text} {clip && <span className="text-black/35">📎</span>}
            </span>
            <Badge tone="gray">{area}</Badge>
            <span className={cn("tabular-nums", amount.startsWith("−") && "text-[#8a2b2b]")}>{amount}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Reports: KPI tiles and admitted people per event, stacked by ticket / member / guest. */
export function ReportsMock() {
  const nights = [
    ["Do", 40, 25, 8],
    ["Fr", 95, 40, 22],
    ["Sa", 140, 55, 30],
    ["Do", 35, 30, 6],
    ["Fr", 110, 45, 18],
    ["Sa", 160, 60, 35],
  ] as const
  const max = 255
  return (
    <div className="grid gap-[0.8em] p-[1.2em] text-[clamp(8px,0.9vw,12.5px)]">
      <span className="text-[1.4em] font-semibold tracking-tight">Auswertungen · Oktober</span>
      <div className="grid grid-cols-4 gap-[0.6em]">
        {[["Aktive Mitglieder", "412"], ["Eingelassen", "1.054"], ["Ticketumsatz", "8.920 €"], ["Schichten besetzt", "94 %"]].map(([l, v]) => (
          <div key={l} className="rounded-[0.6em] border border-black/5 bg-white p-[0.7em]">
            <div className="truncate text-black/45">{l}</div>
            <div className="text-[1.3em] font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex h-[12em] items-end gap-[0.8em] rounded-[0.7em] border border-black/5 bg-white p-[0.9em]">
        {nights.map(([day, tickets, members, guests], i) => (
          <div key={i} className="grid flex-1 justify-items-center gap-[0.3em]">
            <div className="anim-drop flex w-full flex-col-reverse overflow-hidden rounded-[0.3em]" style={{ ...delay(i * 0.25), height: `${((tickets + members + guests) / max) * 9}em` }}>
              <span className="bg-[#14532d]" style={{ flex: tickets }} />
              <span className="bg-[#7f9a5d]" style={{ flex: members }} />
              <span className="bg-[#dfe7c6]" style={{ flex: guests }} />
            </div>
            <span className="text-black/45">{day}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
