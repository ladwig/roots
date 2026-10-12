# roots — Website design sheet (landing page)

The marketing site has its **own look**, separate from the app (the app keeps `src/app/theme.css`).
Everything here lives under `src/app/site/` and is scoped to `.site`, so nothing leaks into the app.

**Mood:** serious but playful. A YC-2026 SaaS that a Verein board member and a techno promoter both trust:
big confident type, warm cream + deep ink, one electric accent, grainy gradients, real-looking product mocks that move.
References (learned from, not copied): eduardbodak.com (type scale, scroll-lit words, mono labels, cards on black),
getcasa.com (calm footer revealed under the page with an old-school image), understory.io (bold headlines,
product mocks on textured gradients).

## Type

| Role | Font | Use |
|---|---|---|
| Display | **Inter Tight** 600–700, tracking `-0.045em`, line-height `0.92` | Headlines, giant words, numbers |
| Accent | **Instrument Serif** italic 400 | One or two words per headline for warmth ("*endlich*", "*zusammen*") |
| Body | **Inter** 400/500, line-height `1.55` | Paragraphs, buttons, nav |
| Micro | **JetBrains Mono** 400, uppercase, tracking `0.08em`, 11–12 px | Labels, eyebrows, little tags ("01 — Mitglieder") |

Scale (fluid, `clamp`): `--fs-giant` 64→220 px · `--fs-h1` 44→112 px · `--fs-h2` 34→72 px · `--fs-h3` 22→32 px ·
`--fs-lead` 18→22 px · `--fs-body` 16–17 px · `--fs-micro` 11–12 px.
Headlines: max ~12 words, sentence case, no full stop except as a design beat ("Ein Ort.").

## Colour

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0c0d0b` | Dark sections, text on cream |
| `--ink-2` | `#1a1c18` | Cards on ink |
| `--cream` | `#f4efe6` | Light sections, text on ink |
| `--cream-2` | `#e9e2d4` | Cards on cream, borders |
| `--moss` | `#14532d` | Brand green (ties to the app) |
| `--lime` | `#d4f25c` | The one loud accent: CTAs, highlights, live dots |
| `--pink` | `#ff4fd8` | Sparingly (≤ 1 per screen): arrows, a sticker, a cursor |
| `--muted` | `rgb(244 239 230 / .45)` on ink · `rgb(12 13 11 / .5)` on cream | Secondary text, unlit words |

Sections alternate **ink ↔ cream**; product mocks sit on **grain gradients** (moss → lime → cream, or ink → moss).

## Texture

- **Grain**: an SVG `feTurbulence` noise as a data-URI overlay (`.grain::after`), `opacity .18–.3`, `mix-blend-mode: overlay`.
  Every gradient panel gets it, flat surfaces don't.
- **Gradients**: soft radial blobs (2–3 stops), never more than 3 colours, always with grain.

## Space & layout

- Page gutter: `clamp(20px, 5vw, 80px)`; max content width `1320px`; text columns ≤ `62ch`.
- Section rhythm: `padding-block: clamp(96px, 14vw, 200px)`. Big air is the point.
- Radius: cards `28px`, mock frames `20px`, buttons/pills `999px`, chips `10px`.
- Grid: 12 columns desktop, single column on phones; mocks bleed off the edge on desktop, stay inside on phones.

## Components

- **Nav**: floating pill bar, chip-style links (active chip = cream on ink), CTA "Kostenlos starten" in lime.
- **Buttons**: pill, 48 px tall; primary = lime on ink text; secondary = outline cream/ink. Arrow icon in a round chip.
- **Device mocks** (`DeviceLaptop`, `DevicePhone`, `DeviceBrowser`): drawn in CSS, no screenshots. The app inside is
  a *fake*, simplified UI built from divs, animated with CSS keyframes in short loops (6–10 s): counters tick,
  rows slide in, a QR scan flashes green, a calendar chip drops in.
- **Mono labels**: `01 — Mitglieder` above section titles.
- **Feature cards**: cream cards on ink (or ink on cream), 28 px radius, one mock each.
- **Footer**: sits *under* the page (sticky at the bottom, revealed as the last section scrolls away) with an
  old-school, dithered landscape illustration and a giant "roots" wordmark.

## Motion

- Native first: CSS keyframes + **scroll-driven animations** (`animation-timeline: view()`) for reveals and the
  word-by-word lighting of statements. Browsers without support just show the final state.
- Easing `cubic-bezier(.2,.7,.1,1)`; durations 400–900 ms for reveals; loops 6–10 s, `ease-in-out`.
- Reveal = fade + 24 px rise; never animate layout, only `opacity`/`transform`/`clip-path`.
- `prefers-reduced-motion: reduce` → no loops, no scroll effects, everything static and visible.

## Voice (German first)

Du-Form, short sentences, concrete nouns (Mitglieder, Tickets, Schichten), no buzzwords. One joke per page, max.
Promise less, show more: every claim sits next to a mock that proves it.
