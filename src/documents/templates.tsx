// Document templates (A4, DIN 5008 address window). Every template renders the same DocView and shares the
// letterhead, items table, totals and footer, so quotes and invoices look alike. Styles are inline on purpose:
// a document is paper (light, fixed sizes), independent of the app theme, and portable to a server PDF renderer later.
import type { DocView } from "./model"

export const TEMPLATES = ["classic", "modern", "minimal"] as const
export type TemplateKey = (typeof TEMPLATES)[number]

type Style = React.CSSProperties
type Theme = { font: string; accent: string; muted: string; line: string; titleSize: string; band?: boolean; ruled: boolean }
const THEMES: Record<TemplateKey, Theme> = {
  classic: { font: "Helvetica, Arial, sans-serif", accent: "#111", muted: "#555", line: "#bbb", titleSize: "16pt", ruled: true },
  modern: { font: "'Inter', 'Helvetica Neue', Arial, sans-serif", accent: "#0f766e", muted: "#5b6770", line: "#d6dde0", titleSize: "22pt", band: true, ruled: true },
  minimal: { font: "Georgia, 'Times New Roman', serif", accent: "#222", muted: "#777", line: "transparent", titleSize: "14pt", ruled: false },
}

export function DocumentPage({ view, template }: { view: DocView; template: TemplateKey }) {
  const th = THEMES[template]
  const page: Style = {
    width: "210mm",
    minHeight: "297mm",
    margin: "0 auto",
    padding: "0 20mm 32mm 25mm",
    background: "#fff",
    color: "#111",
    fontFamily: th.font,
    fontSize: "9.5pt",
    lineHeight: 1.45,
    position: "relative",
    boxSizing: "border-box",
  }
  return (
    <div style={page} className="document-page">
      {th.band && <div style={{ height: "6mm", margin: "0 -20mm 0 -25mm", background: th.accent }} />}
      <Letterhead view={view} th={th} />
      <AddressAndMeta view={view} th={th} />
      {view.stamp && <p style={{ color: "#b91c1c", fontWeight: 700, letterSpacing: "0.1em", margin: "6mm 0 0", textTransform: "uppercase" }}>{view.stamp}</p>}
      <h1 style={{ fontSize: th.titleSize, fontWeight: 700, margin: "10mm 0 4mm", color: template === "modern" ? th.accent : "#111" }}>
        {view.title} {view.meta[0]?.value && !view.draft ? view.meta[0].value : ""}
      </h1>
      {view.intro && <p style={{ whiteSpace: "pre-line", margin: "0 0 6mm" }}>{view.intro}</p>}
      <Items view={view} th={th} />
      <Totals view={view} th={th} />
      {view.notes.map((n) => (
        <p key={n} style={{ margin: "4mm 0 0" }}>
          {n}
        </p>
      ))}
      {view.outro && <p style={{ whiteSpace: "pre-line", margin: "6mm 0 0" }}>{view.outro}</p>}
      <Footer view={view} th={th} />
    </div>
  )
}

function Letterhead({ view, th }: { view: DocView; th: Theme }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", height: "27mm", paddingTop: "10mm" }}>
      <div style={{ fontWeight: 700, fontSize: "12pt", color: th.accent }}>{view.seller.legal_name}</div>
      {view.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- printed document: plain img, no optimizer
        <img src={view.logoUrl} alt="" style={{ maxHeight: "18mm", maxWidth: "50mm", objectFit: "contain" }} />
      )}
    </div>
  )
}

// DIN 5008 form B: address field 45 mm from the top edge, 85 mm wide; meta block on the right.
function AddressAndMeta({ view, th }: { view: DocView; th: Theme }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "10mm", marginTop: "8mm", minHeight: "45mm" }}>
      <div style={{ width: "85mm" }}>
        <p style={{ fontSize: "7pt", color: th.muted, borderBottom: `0.5pt solid ${th.line}`, paddingBottom: "1mm", margin: "0 0 2mm" }}>
          {view.senderLine}
        </p>
        {view.recipient.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
      <table style={{ borderCollapse: "collapse", alignSelf: "flex-start", fontSize: "9pt" }}>
        <tbody>
          {view.meta.map((m) => (
            <tr key={m.label}>
              <td style={{ color: th.muted, paddingRight: "4mm", whiteSpace: "nowrap" }}>{m.label}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{m.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Items({ view, th }: { view: DocView; th: Theme }) {
  const cell: Style = { padding: "2mm 1.5mm", verticalAlign: "top", borderBottom: th.ruled ? `0.5pt solid ${th.line}` : undefined }
  const head: Style = { ...cell, fontWeight: 700, color: th.muted, fontSize: "8pt", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1pt solid ${th.ruled ? th.accent : "#ccc"}` }
  const tax = view.items.some((i) => i.taxRate)
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead style={{ display: "table-header-group" }}>
        <tr>
          <th style={{ ...head, textAlign: "left", width: "8mm" }}>{view.labels.pos}</th>
          <th style={{ ...head, textAlign: "left" }}>{view.labels.description}</th>
          <th style={{ ...head, textAlign: "right" }}>{view.labels.quantity}</th>
          <th style={{ ...head, textAlign: "right" }}>{view.labels.unitPrice}</th>
          {tax && <th style={{ ...head, textAlign: "right" }}>{view.labels.tax}</th>}
          <th style={{ ...head, textAlign: "right" }}>{view.labels.total}</th>
        </tr>
      </thead>
      <tbody>
        {view.items.map((i) => (
          <tr key={i.pos} style={{ breakInside: "avoid" }}>
            <td style={cell}>{i.pos}</td>
            <td style={cell}>
              <div style={{ fontWeight: 600 }}>{i.title}</div>
              {i.description && <div style={{ whiteSpace: "pre-line", color: th.muted }}>{i.description}</div>}
            </td>
            <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>
              {i.quantity} {i.unit}
            </td>
            <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{i.unitPrice}</td>
            {tax && <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{i.taxRate}</td>}
            <td style={{ ...cell, textAlign: "right", whiteSpace: "nowrap" }}>{i.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Totals({ view, th }: { view: DocView; th: Theme }) {
  return (
    <table style={{ marginLeft: "auto", marginTop: "4mm", borderCollapse: "collapse", minWidth: "70mm", breakInside: "avoid" }}>
      <tbody>
        {view.totals.map((r) => (
          <tr key={r.label}>
            <td style={{ padding: "1mm 4mm 1mm 0", fontWeight: r.strong ? 700 : 400, borderTop: r.strong ? `1pt solid ${th.accent}` : undefined }}>{r.label}</td>
            <td style={{ padding: "1mm 0", textAlign: "right", whiteSpace: "nowrap", fontWeight: r.strong ? 700 : 400, borderTop: r.strong ? `1pt solid ${th.accent}` : undefined }}>
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// Fixed at the bottom: repeats on every printed page.
function Footer({ view, th }: { view: DocView; th: Theme }) {
  return (
    <div
      className="document-footer"
      style={{
        position: "absolute",
        left: "25mm",
        right: "20mm",
        bottom: "10mm",
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(view.footer.length, 1)}, 1fr)`,
        gap: "4mm",
        fontSize: "7pt",
        color: th.muted,
        borderTop: `0.5pt solid ${th.line === "transparent" ? "#ddd" : th.line}`,
        paddingTop: "2mm",
      }}
    >
      {view.footer.map((col, i) => (
        <div key={i}>
          {col.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      ))}
    </div>
  )
}
