# Rikki Design

Product design spec for the Spotlight-style launcher. Token source: root `DESIGN.md` (Linear analysis). This file is the in-app system; do not duplicate marketing-page layout rules here.

## Principles

- Near-black canvas, charcoal surfaces, one lavender accent.
- Hairline borders carry depth. No drop shadows on dark chrome, no second hue, no atmospheric gradients.
- Motion is short, spatial, and interruptible. `prefers-reduced-motion` disables enter/exit and glow.

## Color

| Token | Value | Use |
| --- | --- | --- |
| canvas | `#010102` | Transparent glass mix `rgba(1, 1, 2, 0.85)` |
| surface-1 | `#0f1011` | Search field, todo rows |
| surface-2 | `#141516` | Selected command row |
| ink | `#f7f8f8` | Primary text |
| ink-muted | `#d0d6e0` | Secondary |
| ink-subtle | `#8a8f98` | Hints, icons |
| ink-tertiary | `#62666d` | Meta, completed todos |
| primary | `#5e6ad2` | Brand mark, completed check |
| primary-hover | `#828fff` | Glow peak |
| primary-focus | `#5e69d1` | Focus ring, selected outline |
| hairline | `#23252a` | Structure |

Lavender is only for focus, glow, the wordmark, and completed checks.

## Type

Fallback stack: `SF Pro Display, -apple-system, system-ui, Segoe UI, Inter, Roboto, sans-serif`.

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Search | 16px | 400 | -0.05px |
| Row title | 14px | 500 | 0 |
| Body / todo | 14px | 400 | 0 |
| Caption | 12–13px | 400–500 | 0 / +0.4px eyebrow |

## Shape and space

- Window: 12px radius, 600×400, 1px `rgba(255,255,255,0.06)` edge.
- Controls: 8px radius (`rounded-md`).
- Search inset: 12px.
- Icon stroke: 1.5px at 16px. Press scale `0.96`.
- Icon-only hit target: 40px.

## Motion

| Name | Change | Duration | Easing | Where |
| --- | --- | --- | --- | --- |
| scaleIn | opacity 0→1, scale 0.96→1, y -8→0 | 150ms | ease-out | Palette show |
| scaleOut | opacity 1→0, scale 1→0.96, y 0→-4 | 100ms | ease-in | Palette hide |
| glowPulse | lavender box-shadow | 1.2s loop | ease-in-out | Search focus |
| slideIn | y -8→0, opacity 0→1 | 120ms | ease-out | Command rows, todo enter |

Show/hide uses CSS transitions so a second hotkey can reverse mid-flight. Glow is 1.2s, not 300ms, so it does not strobe. Todo rows use the same distances on the way out (y -4, 100ms).

## Components

**Palette shell** — Glass panel, always-on-top, no chrome.

**SearchBar** — Borderless 16px field. Focus glow only; no fill change.

**Command row** — Icon tile + title + description + prefix kbd. Selected: surface-2 + 2px primary-focus outline at 50%.

**Todo row** — 40px toggle and delete. Completed text uses ink-tertiary + strikethrough. Counts are tabular.

## Do not

- Light theme.
- Lavender as a section fill.
- Pill-shaped primary controls.
- True `#000000` canvas.
- `transition: all`.
