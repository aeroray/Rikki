# Rikki Design

Product design spec for the Spotlight-style launcher. This file is the in-app system.

## Principles

- Cool near-black canvas (`#07080a`), charcoal panels, one lavender accent.
- 4px spacing grid. Hairlines are translucent, not solid gray.
- Motion is short, spatial, and interruptible. `prefers-reduced-motion` disables enter/exit and glow.

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
| hairline | `rgb(255 255 255 / 0.06)` | `rgb(0 0 0 / 0.06)` | Structure |

Lavender is only for focus, glow, the wordmark, and completed checks. Selected row text stays ink, not primary.

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
- Buttons: 6px radius. Icon tiles: 6px. Icon-only hit target: 40px.
- Icon stroke: 1.5px at 16px. Press scale `0.96`.

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

## Do not

- True `#000000` canvas.
- Solid `#333` hairlines.
- Lavender as a section fill or selected-row text.
- Pill-shaped primary controls.
- `transition: all`.
- Stagger on every keystroke.
