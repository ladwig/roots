// Website building blocks (shared by the landing page and the /style/site guide). Look: docs/design/site.md.
import Image from "next/image"
import { ArrowUpRightIcon, PlusIcon } from "lucide-react"
import { PAINTINGS, type PaintingKey } from "../paintings"
import { Halftone } from "./halftone"

/** Primary button: black (or `light` on dark), 2px corners, uppercase label + ↗. */
export function Pill({ href, children, light, className }: { href: string; children: React.ReactNode; light?: boolean; className?: string }) {
  return (
    <a href={href} className={`pill ${light ? "pill-light" : ""} ${className ?? ""}`}>
      <span>{children}</span>
      <ArrowUpRightIcon className="size-4" strokeWidth={2} />
    </a>
  )
}

/** Small uppercase label in a thin box, above centred section headlines. */
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>
}

/** Section head: tag + headline, centred or left. */
export function SectionHead({ tag, title, center }: { tag: string; title: React.ReactNode; center?: boolean }) {
  return (
    <div className={`grid gap-5 ${center ? "justify-items-center text-center" : "justify-items-start"}`}>
      <Tag>{tag}</Tag>
      <h2 className="display fs-h2 max-w-[18ch]">{title}</h2>
    </div>
  )
}

/** A painting with a museum-style caption; children float on it (device mocks, cards). */
export function Painting({ k, className, sizes, priority, children, position }: { k: PaintingKey; className?: string; sizes: string; priority?: boolean; children?: React.ReactNode; position?: string }) {
  const p = PAINTINGS[k]
  return (
    <figure className="grid gap-3">
      <div className={`painting settle ${className ?? ""}`}>
        <Image src={p.src} alt={`${p.artist}, ${p.title}`} fill sizes={sizes} priority={priority} className="object-cover" style={{ objectPosition: position ?? "50% 50%" }} />
        {children}
      </div>
      <figcaption className="soft text-[12px]">
        {p.artist}, <em>{p.title}</em>, {p.year}
      </figcaption>
    </figure>
  )
}

/** Big centred sentence with the button set inside the line ("Fangt heute an. [KOSTENLOS STARTEN ↗]"). */
export function InlineCta({ before, pill, after, href }: { before: string; pill: string; after?: string; href: string }) {
  return (
    <p className="display fs-h2 mx-auto max-w-[18ch] text-center leading-[1.05]">
      {before}{" "}
      <a href={href} className="pill inline-pill">
        <span>{pill}</span>
        <ArrowUpRightIcon className="size-[0.32em] min-w-4" strokeWidth={2} />
      </a>
      {after && <> {after}</>}
    </p>
  )
}

/** Dark band: a painting builds up as a halftone dot grid, copy + light button on the left. */
export function HalftoneBand({ k, title, accent, text, cta, href }: { k: PaintingKey; title: string; accent?: string; text: string; cta: string; href: string }) {
  return (
    <div className="ticks">
      <div className="painting relative min-h-[420px] overflow-hidden rounded-[2px] bg-[#14130f] text-[var(--paper)] sm:min-h-[480px]">
        <Halftone src={PAINTINGS[k].src} className="absolute inset-0 size-full" />
        <div className="absolute inset-0 z-[2] bg-[linear-gradient(90deg,rgb(20_19_15/.92)_0%,rgb(20_19_15/.7)_38%,rgb(20_19_15/0)_75%)]" />
        <div className="relative z-[3] flex min-h-[420px] flex-col justify-center gap-6 px-[clamp(24px,6vw,96px)] py-14 sm:min-h-[480px]">
          <h2 className="display fs-h2 max-w-[14ch]">
            {title} {accent && <em>{accent}</em>}
          </h2>
          <p className="fs-lead max-w-[40ch] text-[var(--paper)]/75">{text}</p>
          <div>
            <Pill href={href} light>
              {cta}
            </Pill>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Hairline card with a line-art graphic and centred text. */
export function ValueCard({ art, title, text }: { art: React.ReactNode; title: string; text: string }) {
  return (
    <div className="reveal grid gap-8 border border-[var(--line)] bg-[rgb(25_24_19/.025)] px-8 pt-12 pb-9 text-center">
      <div className="mx-auto h-28 w-full max-w-[220px] text-[var(--ink)]/75">{art}</div>
      <div>
        <h3 className="display mb-3 text-[21px] leading-tight">{title}</h3>
        <p className="soft mx-auto max-w-[34ch] text-[15px]">{text}</p>
      </div>
    </div>
  )
}

/** One row of the modules table. */
export function ModuleRow({ n, name, text }: { n: number; name: string; text: string }) {
  return (
    <div className="reveal rule grid gap-2 py-5 sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1.4fr)] sm:items-baseline sm:gap-8">
      <span className="label text-[var(--umber)]">{String(n).padStart(2, "0")}</span>
      <dt className="display text-[clamp(22px,2vw,28px)] leading-tight">{name}</dt>
      <dd className="soft">{text}</dd>
    </div>
  )
}

/** One FAQ entry (native <details>). */
export function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="rule py-5">
      <summary className="flex items-start justify-between gap-6 text-[18px]">
        {q}
        <PlusIcon className="plus soft mt-1 size-5 shrink-0" />
      </summary>
      <p className="soft mt-3 max-w-[60ch]">{a}</p>
    </details>
  )
}

/** Feature text column: numbered label, headline, text, hairline bullet list. */
export function FeatureText({ n, label, title, text, bullets }: { n: number; label: string; title: string; text: string; bullets: string[] }) {
  return (
    <div>
      <p className="label soft mb-6">
        {String(n).padStart(2, "0")} · {label}
      </p>
      <h3 className="display fs-h3 mb-5">{title}</h3>
      <p className="soft mb-7">{text}</p>
      <ul className="grid text-[15px]">
        {bullets.map((b) => (
          <li key={b} className="rule py-2.5">
            {b}
          </li>
        ))}
      </ul>
    </div>
  )
}
