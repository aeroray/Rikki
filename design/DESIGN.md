# Rikki Design

Product design spec for the Spotlight-style launcher. This file is the in-app system.

## Principles

- Cool near-black canvas (`#07080a`), charcoal panels, one lavender accent.
- 4px spacing grid. Hairlines are translucent, not solid gray.
- Motion is short, spatial, and interruptible. `prefers-reduced-motion` disables enter/exit and glow.
- Dark and light are peers, not a default and a fallback: `system` follows the OS and is what the app ships with, and the light theme is designed as carefully as the dark one.

## Brand

The application logo is the rounded lavender raccoon, refined concept A. Its default backing is a rounded near-black tile (`#07080a`) with transparent outer corners, also in the light theme. The approved masters live in `design/brand/`; `pnpm icons` exports the desktop, tray, favicon and README assets. Search-engine and command glyphs retain their functional meaning.

## Color

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| canvas | `#07080a` | `#f4f5f6` | Window glass mix |
| surface-1 | `#111214` | `#ffffff` | Search field, tiles, cards |
| surface-2 | `#1b1c1e` | `#eceeef` | Nested chips, filled controls |
| row-hover | `rgb(255 255 255 / 0.03)` | `rgb(0 0 0 / 0.03)` | Row hover |
| row-selected | `rgb(255 255 255 / 0.06)` | `rgb(0 0 0 / 0.06)` | Row selected |
| ink | `#f7f8f8` | `#111214` | Primary text |
| ink-muted | `#d0d6e0` | `#3c4048` | Secondary |
| ink-subtle | `#8a8f98` | `#6b7078` | Hints, icons |
| ink-tertiary | `#62666d` | `#8a8f98` | Meta |
| primary | `#5e6ad2` | same | Brand, completed check |
| danger | `#ff6369` | `#c2262b` | Irreversible confirm |
| success | `#3dd68c` | `#218358` | A release is waiting |
| hairline | `rgb(255 255 255 / 0.06)` | `rgb(0 0 0 / 0.06)` | Structure |

Lavender is only for focus, glow, the wordmark, and completed checks. Selected row text stays ink, not primary.

Danger is a semantic signal, not a second accent. It appears on the confirm button of a dialog whose action cannot be undone — and on the warning glyph beside that dialog's title — and nowhere else: never on a row, a section, a label, or a normal button.

Success is the same kind of signal with exactly one home: the arrow on the update bar, where it says a release is waiting rather than that something went wrong. Like danger it is never decoration — a second use is a decision to write down, not a colour to reach for.

## Type

Stack: `Inter Variable`, Inter, SF Pro Display, Segoe UI, system-ui. `font-feature-settings: "calt", "kern", "liga"`. CJK falls through to the system UI face.

| Role | Size | Weight | Line height |
| --- | --- | --- | --- |
| Search / title | 16px | 500 | 1.45 |
| Row title / body | 14px | 500 | 1.45 |
| Caption | 12px | 400 | 1.45 |

## Shape and space

- Window: 12px radius, 600×400, 8px transparent gutter, dual `box-shadow` ring.
- Search field: 12px radius, padding 12×16, icon gap 8px.
- List rows: 8px radius, padding 12×16, 8px row gap, 8px icon-to-text.
- Buttons: 6px radius. A text button is 32px tall; 40px is the icon-only hit target, not a button height.
- Icon tiles: 6px. Icon stroke: 1.5px at 16px. Press scale `0.96`.
- Focus is a 2px lavender outline, offset 0, on every keyboard-reachable control.

## Motion

| Name | Change | Duration | Easing | Where |
| --- | --- | --- | --- | --- |
| scaleIn | opacity 0→1, scale 0.95→1 | 150ms | ease-out | Palette show |
| scaleOut | opacity 1→0, scale 1→0.95 | 100ms | ease-out | Palette hide |
| glowPulse | lavender box-shadow | 1.2s loop | ease-in-out | Search focus |
| rowFade | opacity 0→1, delay index×30ms (cap 12) | 120ms | ease-out | Empty-home list on show |

Show/hide uses CSS transitions so a second hotkey can reverse mid-flight. Do not stagger search results or other high-frequency lists. Hover/selected only tween `background-color` (150ms ease).

## Components

**Palette shell** — Glass panel, always-on-top, no chrome.

**SearchBar** — Borderless 16px/500 field. Focus glow only; no fill change.

**Command row** — Icon tile + title + description + prefix kbd. Selected and hover are translucent fills, not borders. Text color does not change.

**Todo row** — 40px toggle and delete. Completed text uses ink-tertiary + strikethrough. Counts are tabular.

**Confirm dialog** — 320px card on a 55% tint over the palette, 12px radius, hairline ring plus the elevation shadow, 16px padding. Two 32px buttons at the bottom right, each carrying its own key chip; cancel is quiet, and the action a second Enter runs is the one with weight. A dialog whose action cannot be undone adds a 16px danger warning glyph beside its title and paints its confirm button in danger; the glyph and the colour are never the only signal, because the title and the body already say what will happen.

## Do not

- True `#000000` canvas.
- Solid `#333` hairlines.
- Lavender as a section fill or selected-row text.
- Danger anywhere but a confirm button that cannot be undone.
- Pill-shaped primary controls.
- `transition: all`.
- Stagger on every keystroke.
