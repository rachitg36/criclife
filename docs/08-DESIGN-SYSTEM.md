# 08 — Design System

Brief: **futuristic, dynamic, very visual, dark + light mode.**

The reference point is a broadcast graphics package crossed with a modern
trading terminal — not a sports-app template. Dark, deep, luminous, with data
that moves.

---

## 1. Design principles

1. **Data is the hero.** Numbers are large, tabular, and animated. Chrome is quiet.
2. **Light is the material.** Depth comes from glow and translucency, not drop
   shadows and borders.
3. **Motion means something.** Nothing animates for decoration; every animation
   communicates a state change.
4. **The pitch tints the app.** During a live match the whole UI shifts toward
   the batting team's colour. The app feels like it's *at* the match.
5. **Speed beats spectacle in the scorer view.** Effects budget is inverted
   between scorer (minimal) and audience (maximal).

---

## 2. Colour tokens

Defined as CSS custom properties. Dark is the base; light overrides.

```css
:root {
  /* ── Surfaces (dark, default) ───────────────────────── */
  --bg-base:        #05070d;   /* app background, near-black blue */
  --bg-sunken:      #03050a;
  --surface-1:      #0b1020;   /* cards */
  --surface-2:      #121a30;   /* raised cards */
  --surface-3:      #1a2440;   /* popovers, sheets */
  --surface-glass:  rgb(18 26 48 / 0.55);
  --surface-glass-strong: rgb(18 26 48 / 0.80);

  /* ── Borders & lines ────────────────────────────────── */
  --border-subtle:  rgb(255 255 255 / 0.06);
  --border-default: rgb(255 255 255 / 0.11);
  --border-strong:  rgb(255 255 255 / 0.20);
  --border-glow:    color-mix(in oklch, var(--accent) 45%, transparent);

  /* ── Text ───────────────────────────────────────────── */
  --text-primary:   #f2f5ff;
  --text-secondary: #a5b0cc;
  --text-tertiary:  #6b7899;
  --text-inverse:   #05070d;

  /* ── Accent (user-selectable, team-overridable) ─────── */
  --accent:         #22d3ee;   /* cyan default */
  --accent-hover:   #67e8f9;
  --accent-muted:   color-mix(in oklch, var(--accent) 18%, transparent);
  --accent-glow:    color-mix(in oklch, var(--accent) 55%, transparent);
  --accent-fg:      #04141a;   /* text on accent fills */

  /* ── Semantic ───────────────────────────────────────── */
  --run-dot:        #6b7899;
  --run-single:     #a5b0cc;
  --run-four:       #38bdf8;   /* electric blue */
  --run-six:        #a855f7;   /* violet */
  --wicket:         #f43f5e;   /* rose */
  --extra:          #fbbf24;   /* amber */
  --success:        #34d399;
  --warning:        #fbbf24;
  --danger:         #f43f5e;
  --info:           #38bdf8;
  --live:           #ef4444;   /* the LIVE pulse dot */

  /* ── Rank metals ────────────────────────────────────── */
  --gold:   linear-gradient(135deg,#fde68a,#f59e0b,#fbbf24);
  --silver: linear-gradient(135deg,#e5e7eb,#9ca3af,#d1d5db);
  --bronze: linear-gradient(135deg,#fcd9b6,#b45309,#d97706);

  /* ── Elevation (glow-based, not shadow-based) ───────── */
  --glow-sm: 0 0 0 1px var(--border-subtle),
             0 2px 8px rgb(0 0 0 / 0.4);
  --glow-md: 0 0 0 1px var(--border-default),
             0 8px 24px rgb(0 0 0 / 0.5),
             0 0 32px -8px var(--accent-glow);
  --glow-lg: 0 0 0 1px var(--border-strong),
             0 16px 48px rgb(0 0 0 / 0.6),
             0 0 64px -12px var(--accent-glow);

  /* ── Radii ──────────────────────────────────────────── */
  --r-sm: 8px;  --r-md: 14px;  --r-lg: 20px;
  --r-xl: 28px; --r-full: 999px;

  /* ── Motion ─────────────────────────────────────────── */
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 120ms;  --dur-base: 220ms;  --dur-slow: 400ms;
}

[data-theme="light"] {
  --bg-base:        #f6f8fc;
  --bg-sunken:      #eaeef6;
  --surface-1:      #ffffff;
  --surface-2:      #ffffff;
  --surface-3:      #ffffff;
  --surface-glass:  rgb(255 255 255 / 0.72);
  --surface-glass-strong: rgb(255 255 255 / 0.92);

  --border-subtle:  rgb(9 15 33 / 0.06);
  --border-default: rgb(9 15 33 / 0.11);
  --border-strong:  rgb(9 15 33 / 0.18);

  --text-primary:   #0a1020;
  --text-secondary: #48546f;
  --text-tertiary:  #7b869e;
  --text-inverse:   #ffffff;

  --accent:         #0891b2;   /* darker cyan for contrast on white */
  --accent-fg:      #ffffff;
  --run-four:       #0284c7;
  --run-six:        #7c3aed;
  --wicket:         #e11d48;

  /* Light mode uses real shadows, not glows */
  --glow-sm: 0 1px 2px rgb(9 15 33 / 0.06),
             0 0 0 1px var(--border-subtle);
  --glow-md: 0 4px 16px rgb(9 15 33 / 0.08),
             0 0 0 1px var(--border-default);
  --glow-lg: 0 12px 40px rgb(9 15 33 / 0.12),
             0 0 0 1px var(--border-default);
}
```

### Theme switching

```html
<!-- inline in index.html, before any CSS, prevents flash -->
<script>
  (function () {
    var t = localStorage.getItem('theme') || 'system';
    var d = t === 'dark' || (t === 'system' &&
            matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = d ? 'dark' : 'light';
  })();
</script>
```

Toggle is a 3-state segmented control (`Dark · Light · Auto`) in Settings and in
the audience header. The transition uses the View Transitions API for a circular
wipe from the toggle's position, falling back to a 200ms cross-fade.

### Team tinting

During a live match:

```ts
document.documentElement.style.setProperty('--accent', battingTeam.primary_color);
```

Contrast is auto-corrected: if the team colour fails 4.5:1 against the current
surface, we shift its lightness in OKLCH until it passes, rather than rejecting
the colour.

### Accent presets (user setting)
`cyan` (default) · `violet` · `lime` · `amber` · `rose` · `azure` · `team`
(follow the match). Stored in `profiles.accent_pref`.

---

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| Display / scores | **Geist** or **Space Grotesk** | Geometric, technical, tabular figures |
| UI / body | **Inter Variable** | |
| Numerals everywhere | `font-variant-numeric: tabular-nums` | **non-negotiable** — scores must not jitter as they change |
| Commentary | Inter, 15px/1.55 | |

Scale (fluid, `clamp()` between 375px and 768px viewports):

| Token | Size | Weight | Use |
|---|---|---|---|
| `display-xl` | 68–84px | 800 | Live score |
| `display-lg` | 44–56px | 800 | Result, hero numbers |
| `display-md` | 32–38px | 700 | Section heroes |
| `heading-lg` | 24px | 700 | Page titles |
| `heading-md` | 19px | 600 | Card titles |
| `heading-sm` | 16px | 600 | Row headers |
| `body` | 15px | 400 | Default |
| `body-sm` | 13px | 400 | Secondary |
| `label` | 11px | 600, `+0.08em`, uppercase | Overline labels ("THIS OVER") |
| `mono` | 13px | 500 | Figures like `3.3-0-28-2` |

---

## 4. Signature components

### Glass panel
```css
.panel {
  background: var(--surface-glass);
  backdrop-filter: blur(20px) saturate(1.4);
  border: 1px solid var(--border-default);
  border-radius: var(--r-lg);
  box-shadow: var(--glow-md);
}
```
Plus a 1px top highlight (`::before` with a white 8% gradient) that reads as a
light source above the card. Removed in light mode.

### Aurora background
One element, GPU-only, behind the hero. Two conic gradients in the accent hue
rotating at different speeds via an `@property`-registered angle. `filter:
blur(80px)`, `opacity: .35` in dark, `.18` in light. Paused when the tab is
hidden and when `prefers-reduced-motion` is set.

### Count-up number
```tsx
const spring = useSpring(value, { stiffness: 180, damping: 26 });
// render with tabular-nums; the container never changes width
```
Score changes also flash `--accent` on the digit that changed for 200ms.

### Run pad button
- 56–72px square, `--r-md`, glass surface, 1px luminous border.
- Press: `scale(0.94)` in 90ms + a radial ripple originating at the touch point.
- `4` and `6` carry a permanent gradient in `--run-four` / `--run-six`.
- `WICKET` is a wide pill filled `--wicket`, the only red on the screen.

### Over-dot strip
Each ball is a pill. Dot = grey outline. 1–3 = filled grey with a numeral.
4 = `--run-four` filled. 6 = `--run-six` filled with a soft glow. W = `--wicket`
with a single pulse on entry. Extras get a superscript `wd`/`nb`/`b`/`lb`.
New pills spring in from the right (`x: 20 → 0`, spring).

### Live pill
```
● LIVE     — dot pulses at 1.2s, --live colour, subtle outward ring
```

### Rank card (top 3)
Glass panel with a 2px metallic gradient border (`--gold` etc.) and a 3s
shimmer sweep via a masked linear gradient. `prefers-reduced-motion` removes
the sweep, keeps the border.

### Player chip
Circular avatar (or generated initials on a hash-derived gradient), name,
team colour bar. Used everywhere.

---

## 5. Motion language

| Interaction | Spec |
|---|---|
| Button press | `scale .94`, 90ms, `--ease-out` |
| Sheet in | `y: 100% → 0`, spring `{stiffness: 340, damping: 32}` |
| Sheet out | `y: 0 → 100%`, 200ms `--ease-out` |
| List item enter | `opacity 0→1`, `y 12→0`, stagger 30ms |
| Route change | View Transitions cross-fade 180ms; shared `layoutId` on team crests |
| Number change | spring, 400ms settle |
| Tab switch | Underline slides with `layoutId`, content cross-fades 150ms |
| Toast | slide up + fade, auto-dismiss 4s, swipe to dismiss |
| Wicket | shake `x: [0,-8,8,-6,6,0]` 150ms + red vignette fade 600ms |
| Six | canvas particle burst 900ms + hero pulse |
| Rank reorder | `layout` prop on rows, spring `{stiffness: 300, damping: 30}` |

### Reduced motion
`@media (prefers-reduced-motion: reduce)` and the user's `Calm mode` toggle both
collapse everything to opacity fades ≤150ms. Count-ups become instant. The
aurora freezes. Particles are disabled entirely.

---

## 6. Iconography & imagery

- **Lucide** icons, 1.75px stroke, 20px default.
- Cricket-specific glyphs (bat, ball, stumps, helmet, gloves) drawn as custom
  SVGs in the same stroke language — sourced/authored once into
  `src/components/icons/cricket/`.
- Team crests: user-uploaded, auto-cropped to a circle, with a generated
  fallback (two-letter monogram on a gradient derived from `primary_color`).
- Player photos: circular, with a generated fallback the same way.
- **No stock photography anywhere.**

---

## 7. Spacing & layout

4px base scale: `1=4 2=8 3=12 4=16 5=20 6=24 8=32 10=40 12=48 16=64`.

- Mobile page gutter: 16px. Card padding: 16px. Dense rows: 12px vertical.
- Content max-width on desktop: 1080px, centred, with the audience view
  becoming a two-column layout above 900px (score + charts left, feed right).
- Safe areas: `padding-bottom: max(16px, env(safe-area-inset-bottom))` on all
  bottom-docked elements.

---

## 8. Accessibility

- Contrast: all text ≥ 4.5:1, large display text ≥ 3:1, in **both** themes.
  A CI check runs the token pairs through a contrast assertion.
- Never colour alone: a wicket pill has a `W`, a four has a `4`. Colour-blind
  safe because the semantics are also textual.
- Focus rings: 2px `--accent` with a 2px offset, visible on keyboard nav.
- Every icon-only button has an `aria-label`.
- The Scoring Rights Map has a fully equivalent list view.
- Live regions: the audience score uses `aria-live="polite"`; wickets use
  `aria-live="assertive"`.
- Minimum touch target 44px, 56px in the scorer view.
- Full keyboard scoring path for desktop scorers: `0-6` number keys,
  `W` wide, `N` no-ball, `B` bye, `L` leg-bye, `X` wicket, `U` undo, `Space`
  confirm. Shown in a `?` cheatsheet.

---

## 9. Empty, loading and error states

- **Skeletons**, not spinners — shaped like the content, with a slow shimmer.
- Empty states get a custom line-art cricket illustration + one clear CTA
  ("No teams yet — create your first team").
- Errors are inline and actionable, never a raw code. Network errors show a
  retry button and the offline queue depth.
- Offline is a **state, not an error**: an amber pill, never a blocking modal.
