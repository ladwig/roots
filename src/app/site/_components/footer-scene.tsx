// Old-school landscape for the footer: dusk sky, striped sun, hills, a forest (roots). Pure SVG; the grain and a
// slightly faded, posterised look come from SVG filters, so it reads like an old print, not a stock photo.
export function FooterScene({ className }: { className?: string }) {
  const trees = Array.from({ length: 46 }, (_, i) => {
    const x = (i * 97.3) % 1600
    const h = 70 + ((i * 53) % 90)
    const y = 610 + ((i * 29) % 50)
    return { x, h, y }
  })
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id="fs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1846" />
          <stop offset="0.45" stopColor="#b6426b" />
          <stop offset="0.7" stopColor="#f39a5b" />
          <stop offset="1" stopColor="#f7d79a" />
        </linearGradient>
        <linearGradient id="fs-sun" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="1" stopColor="#ff8a4c" />
        </linearGradient>
        <clipPath id="fs-sun-stripes">
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x="0" y={360 + i * 34} width="1600" height={34 - Math.min(i * 3, 22)} />
          ))}
          <rect x="0" y="0" width="1600" height="360" />
        </clipPath>
        <filter id="fs-print" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComponentTransfer in="mono" result="speck">
            <feFuncA type="discrete" tableValues="0 0 0 0.18 0.32" />
          </feComponentTransfer>
          <feComponentTransfer in="SourceGraphic" result="poster">
            <feFuncR type="discrete" tableValues="0.08 0.3 0.55 0.78 0.95" />
            <feFuncG type="discrete" tableValues="0.06 0.25 0.48 0.7 0.9" />
            <feFuncB type="discrete" tableValues="0.1 0.28 0.45 0.62 0.8" />
          </feComponentTransfer>
          <feBlend in="speck" in2="poster" mode="multiply" />
        </filter>
      </defs>
      <g filter="url(#fs-print)">
        <rect width="1600" height="900" fill="url(#fs-sky)" />
        <circle cx="1060" cy="470" r="210" fill="url(#fs-sun)" clipPath="url(#fs-sun-stripes)" />
        <path d="M0 600 C 220 520, 420 560, 640 520 S 1080 470, 1300 530 S 1520 560, 1600 540 L1600 900 L0 900Z" fill="#6b2f52" />
        <path d="M0 660 C 260 600, 520 640, 760 610 S 1200 590, 1600 640 L1600 900 L0 900Z" fill="#3b1d3d" />
        {trees.map((t, i) => (
          <path key={i} d={`M${t.x} ${t.y} l${t.h * 0.22} ${-t.h} l${t.h * 0.22} ${t.h} Z`} fill={i % 3 ? "#1d1026" : "#26142f"} />
        ))}
        <rect y="700" width="1600" height="200" fill="#140b1b" />
      </g>
    </svg>
  )
}
