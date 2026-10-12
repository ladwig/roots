# roots — Website design sheet (landing page)

The marketing site has its **own look**, separate from the app (the app keeps `src/app/theme.css`).
Everything lives under `src/app/site/`, scoped to `.site`, so nothing leaks into the app.

## Idea

**Warm but mature.** The calm confidence of a finance or legal SaaS (YC-style: lots of air, hairlines, quiet
typography, one clear CTA) — warmed up by **old master paintings**. The name comes from *grassroots*: people
organising themselves, from the ground up. The paintings carry that idea: Dürer's *Great Piece of Turf* (literally
grass and roots), Bruegel's harvesters and dancers (people working and celebrating together), quiet landscapes.

No "AI slop": no neon gradients, no glassy blobs, no emoji, no stock 3D. Real paintings, real typography, real UI.

## Type

| Role | Font | Use |
|---|---|---|
| Display | **Hanken Grotesk** 400 (light for big numbers), tracking `-0.018em`, line-height `1.04` | Headlines, statements, big numbers (Swiss, close to Helvetica Now) |
| Accent | same font, **lighter tone** (`--ink-soft` / paper 55 %) | One or two words per headline (two-tone), no second typeface |
| Text | **Hanken Grotesk** 400/500, tracking `+0.012em` (small sizes `+0.02em`), line-height `1.6` | Body, nav, UI, buttons (Franklin Gothic lineage: editorial, not the default Inter look) |
| Label | Hanken Grotesk 500, uppercase, tracking `0.12em`, 11–12 px | Eyebrows, section numbers, button labels |

Scale (fluid, `clamp`): `--fs-hero` 52→128 px · `--fs-h2` 40→88 px · `--fs-h3` 26→36 px · `--fs-lead` 18→21 px ·
body 16 px · label 11.5 px. Headlines: sentence case, short, full stop allowed as a beat.

## Colour

Paper and ink, with earth tones taken from the paintings. No bright accent.

| Token | Value | Use |
|---|---|---|
| `--paper` | `#f5f1e8` | Page background |
| `--paper-2` | `#ece6d8` | Cards, table stripes |
| `--ink` | `#191813` | Text, primary buttons, dark sections |
| `--ink-soft` | `rgb(25 24 19 / .62)` | Secondary text |
| `--line` | `rgb(25 24 19 / .14)` | Hairlines, borders |
| `--olive` | `#4d5a2c` | Brand green (Dürer's grass), links, small highlights |
| `--umber` | `#8a5a2b` | Rare warm detail (numbers, a dot) |

Dark sections use `--ink` with `--paper` text. Never pure black or white.

## Paintings (public domain, Wikimedia Commons)

Few and deliberate: **hero, one people/event moment, one manifesto, footer.** Not behind every card.
Treatment: slight warm grade (`saturate(.92) contrast(1.03)`), fine grain overlay, `object-fit: cover` with a
chosen focal point. Product mocks float *on* a painting as on a table. Credits listed in `src/app/site/paintings.ts`.

## Space & layout

- **Full width** on desktop with generous side margins: gutter `clamp(20px, 7vw, 160px)`, no max width for sections and images; text columns stay ≤ `60ch`.
- Section rhythm `clamp(96px, 12vw, 176px)`. Hairline (`1px --line`) between sections instead of colour blocks.
- Radius: almost square: buttons `2px`, frames `2px`, cards `0` with a hairline border. Corner marks (`.ticks`) on key frames.
- 12-column grid; on phones one column, images full-bleed within the gutter.
- **Use the space, don't stretch it**: a visual fills its box (compose several mocks, fan out documents, add a floating action) instead of one small element in a big empty panel. Narrow content (FAQ, statements) is centred in a column, not spread across the page.

## Components

- **Hero**: copy on paper (headline left, intro + buttons right), then the colour painting **full width**, pinned; scrolling moves it in to the content margins (like the nav) and brings the laptop up into the field. No veils or gradients over paintings.
- **Halftone band** (final CTA): dark band where a painting builds up as a dot grid when it comes into view (canvas, `_components/halftone.tsx`), light copy, light button. Not used in the hero.
- **Nav**: full width at the top, shrinks to a framed bar at content width as you scroll (scroll-driven CSS).
- **Tag**: small uppercase label in a thin box above centred section headlines.
- **Value cards**: hairline-bordered cards with thin line-art graphics (`_components/wireframes.tsx`), centred text.

- **Nav**: paper background, sans wordmark "roots", small sans links, text link "Anmelden", black button CTA.
- **Button**: black (or paper on dark), 2 px corners, uppercase label with wide tracking + ↗; secondary = text link with underline. One primary per screen.
- **Inline button**: a big serif sentence with the CTA button set *inside* the line ("Eine Software [ALLE MODULE ↗] für
  eure ganze Arbeit.").
- **Device mocks**: CSS-drawn browser / laptop / phone with a simplified, animated fake app (subtle loops).
- **Module table**: typographic table (hairlines, serif names, sans descriptions) instead of icon grids.
- **FAQ**: native `<details>` with hairlines.
- **Footer**: revealed underneath the page (sticky), full-bleed painting with a large serif wordmark.

## Motion

Quiet. Fade + 16 px rise on enter (scroll-driven CSS, `animation-timeline: view()`), slow loops inside mocks,
images scale from 1.06 → 1 as they enter. `prefers-reduced-motion` → nothing moves.

## Voice (German first)

Du-Form, calm, precise, a little dry. Short sentences. Facts over adjectives. No exclamation marks.
