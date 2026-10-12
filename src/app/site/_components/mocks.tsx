// Fake, simplified app screens for the website, animated with CSS loops (site.css). The demo data here is
// illustration (like a screenshot), not UI copy, so it stays in code; real copy lives in messages (site.*).
import { cn } from "@/lib/utils"

const delay = (s: number) => ({ animationDelay: `${s}s` })

function Badge({ children, tone = "moss" }: { children: React.ReactNode; tone?: "moss" | "lime" | "gray" | "pink" }) {
  const tones = { moss: "bg-[#14532d]/10 text-[#14532d]", lime: "bg-[#d4f25c] text-[#0c0d0b]", gray: "bg-black/5 text-black/55", pink: "bg-[#ff4fd8]/15 text-[#a3168a]" }
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
            <div className="text-[1.6em] font-semibold tracking-tight">Guten Morgen 👋</div>
          </div>
          <span className="rounded-full bg-[#d4f25c] px-[0.9em] py-[0.4em] font-medium">+ Neu</span>
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
          <div className="anim-scan absolute inset-x-[-6%] top-0 h-[3px] rounded-full bg-[#d4f25c] shadow-[0_0_14px_#d4f25c]" />
          <div className="pointer-events-none absolute -inset-[8%] rounded-2xl border-2 border-white/70 [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)]" />
        </div>
        <div className="anim-ok absolute inset-x-[0.8em] bottom-[0.8em] rounded-[1.1em] bg-[#d4f25c] p-[0.8em] text-[#0c0d0b]">
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
        <span className="grid size-[2em] place-items-center rounded-full bg-[#d4f25c] text-[#0c0d0b]">€</span>
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
    [4, 1, 2, "Tresen", "#d4f25c"],
    [4, 3, 2, "Einlass", "#ffd3f4"],
    [5, 0, 2, "Aufbau", "#cfe6d6"],
    [5, 2, 3, "Tresen", "#d4f25c"],
    [5, 3, 2, "Garderobe", "#ffe0c2"],
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
        <div className="mb-[0.6em] text-[1.2em] font-semibold">Willkommen, Paula! 🎉</div>
        <p className="text-white/70">Schön, dass du dabei bist. Deine Mitgliedsnummer ist M-0106. Im Mitgliederbereich siehst du jederzeit deine Daten.</p>
        <div className="mt-[0.8em] inline-block rounded-full bg-[#d4f25c] px-[0.9em] py-[0.35em] text-[#0c0d0b]">Zum Mitgliederbereich</div>
      </div>
    </div>
  )
}

/** Invoice paper. */
export function InvoiceMock() {
  return (
    <div className="relative mx-auto aspect-[1/1.41] w-full max-w-[340px] rounded-[6px] bg-white p-[8%] text-[10px] text-[#0c0d0b] shadow-[0_30px_60px_-25px_rgb(0_0_0/.5)]">
      <div className="flex justify-between">
        <span className="font-semibold">Kulturverein Süd e.V.</span>
        <span className="size-6 rounded bg-[#14532d]" />
      </div>
      <div className="mt-[14%] text-black/50">Kulturverein Süd e.V. · Weg 1 · 50667 Köln</div>
      <div className="mt-1 leading-tight">
        Agentur Nordlicht GmbH
        <br />
        Hafenstraße 5, 20457 Hamburg
      </div>
      <div className="mt-[10%] text-[15px] font-semibold">Rechnung RE-2026-0042</div>
      <div className="mt-3 grid gap-1">
        {[
          ["Raummiete Saal", "450,00 €"],
          ["Technik & Betreuung", "280,00 €"],
          ["Reinigung (pauschal)", "90,00 €"],
        ].map(([a, b]) => (
          <div key={a} className="flex justify-between border-b border-black/5 py-1">
            <span>{a}</span>
            <span>{b}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 ml-auto w-1/2 text-right">
        <div className="flex justify-between">
          <span>Netto</span>
          <span>820,00 €</span>
        </div>
        <div className="flex justify-between">
          <span>USt 19 %</span>
          <span>155,80 €</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Gesamt</span>
          <span>975,80 €</span>
        </div>
      </div>
      <div className="anim-drop absolute top-[38%] right-[-8%] rotate-6 rounded-lg border-2 border-[#14532d] px-3 py-1 text-sm font-bold tracking-wide text-[#14532d] uppercase" style={delay(1.5)}>
        Bezahlt
      </div>
    </div>
  )
}
