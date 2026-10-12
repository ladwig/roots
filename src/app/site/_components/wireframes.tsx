// Line-art graphics for value cards (thin strokes, drawn as SVG paths). Decorative.
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 0.6, vectorEffect: "non-scaling-stroke" as const }

/** Stacked panels in perspective: many tools → one place. */
export function WirePanels() {
  const panels = Array.from({ length: 7 }, (_, i) => i)
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {panels.map((i) => {
        const x = 40 + i * 20
        const squeeze = Math.abs(i - 3) * 2.2
        const top = 22 + squeeze
        const bottom = 98 - squeeze
        const lines = Array.from({ length: 9 }, (_, j) => top + ((bottom - top) * j) / 8)
        return (
          <g key={i}>
            <path d={`M${x} ${top} L${x + 12 - Math.abs(i - 3) * 2.5} ${top + 4} L${x + 12 - Math.abs(i - 3) * 2.5} ${bottom - 4} L${x} ${bottom} Z`} {...stroke} />
            {lines.map((y, j) => (
              <line key={j} x1={x} y1={y} x2={x + 12 - Math.abs(i - 3) * 2.5} y2={y + 4 - (8 * j) / 8} {...stroke} strokeWidth={0.4} />
            ))}
          </g>
        )
      })}
    </svg>
  )
}

/** Contour lines of a soft hill: grown from the ground up. */
export function WireContours() {
  const rings = Array.from({ length: 9 }, (_, i) => i)
  const ring = (k: number) => {
    const pts = Array.from({ length: 49 }, (_, a) => {
      const t = (a / 48) * Math.PI * 2
      const wobble = 1 + 0.12 * Math.sin(3 * t + k) + 0.06 * Math.sin(5 * t - k * 0.7)
      const rx = (12 + k * 7.5) * wobble
      const ry = (4 + k * 2.6) * wobble
      return [100 + rx * Math.cos(t), 62 - k * 2.4 + ry * Math.sin(t)]
    })
    return "M" + pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L") + " Z"
  }
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {rings.map((k) => (
        <path key={k} d={ring(8 - k)} {...stroke} />
      ))}
      <path d="M100 40 L100 92 M70 66 L130 66" {...stroke} strokeWidth={0.4} />
    </svg>
  )
}

/** Two linked spheres (lattice): everything connected. */
export function WireSpheres() {
  const sphere = (cx: number) => (
    <g>
      {Array.from({ length: 9 }, (_, i) => {
        const rx = 30 * Math.abs(Math.cos((i / 8) * Math.PI))
        return <ellipse key={`m${i}`} cx={cx} cy={60} rx={Math.max(rx, 0.5)} ry={30} {...stroke} strokeWidth={0.45} />
      })}
      {Array.from({ length: 7 }, (_, i) => {
        const y = 60 + 30 * Math.sin(((i - 3) / 3) * (Math.PI / 2))
        const rx = 30 * Math.cos(((i - 3) / 3) * (Math.PI / 2))
        return <ellipse key={`p${i}`} cx={cx} cy={y} rx={rx} ry={rx * 0.18} {...stroke} strokeWidth={0.45} />
      })}
    </g>
  )
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full" aria-hidden>
      {sphere(78)}
      {sphere(122)}
    </svg>
  )
}
