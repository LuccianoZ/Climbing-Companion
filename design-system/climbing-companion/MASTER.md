# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Climbing Companion
**Generated:** 2026-09-08 13:02:20
**Category:** Running & Cycling GPS
**Design Dials:** Variance 5/10 (Balanced / Modern) | Motion 5/10 (Standard) | Density 6/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#EA580C` | `--color-primary` |
| On Primary | `#000000` | `--color-on-primary` |
| Secondary | `#F97316` | `--color-secondary` |
| On Secondary | `#000000` | `--color-on-secondary` |
| Accent/CTA | `#059669` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#0F172A` | `--color-background` |
| Foreground | `#FFFFFF` | `--color-foreground` |
| Card | `#192134` | `--color-card` |
| Card Foreground | `#FFFFFF` | `--color-card-foreground` |
| Muted | `#201C27` | `--color-muted` |
| Muted Foreground | `#94A3B8` | `--color-muted-foreground` |
| Border | `rgba(255,255,255,0.08)` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#EA580C` | `--color-ring` |

**Color Notes:** Energetic orange + pace green on dark

### Typography

- **Heading Font:** Space Grotesk
- **Body Font:** Inter
- **Mood:** web3, bitcoin, defi, digital gold, fintech, crypto, trustless, luminescent, precision, dark
- **Google Fonts:** [Space Grotesk + Inter](https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap');
```

### Spacing Variables

*Density: 6/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #059669;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #EA580C;
  border: 2px solid #EA580C;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #0F172A;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #EA580C;
  outline: none;
  box-shadow: 0 0 0 3px #EA580C20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Dark Mode (OLED)

**Keywords:** Dark theme, low light, high contrast, deep black, midnight blue, eye-friendly, OLED, night mode, power efficient

**Best For:** Night-mode apps, coding platforms, entertainment, eye-strain prevention, OLED devices, low-light

**Key Effects:** Minimal glow (text-shadow: 0 0 10px), dark-to-light transitions, low white emission, high readability, visible focus

### Page Pattern

> **Overridden by hand, Sept 8 2026.** The generator returned a marketing
> landing pattern ("Hero + Testimonials + CTA"). Climbing Companion is not a
> landing page -- it is a 5-tab authenticated mobile app plus a separate
> desktop admin console. The palette, style, typography and motion tier above
> came from the search and are kept as returned; only this section is replaced.

**Pattern Name:** Map-first mobile app shell + dense desktop admin console

Two registers, deliberately not unified (Foundation sections 14 and 17):

- **Climber app** -- strictly mobile-first, max-width 430px, centred on desktop.
  Fixed header, bleed content area, bottom tab bar of 4 items (Map / Search /
  Alerts / Profile-or-Log in). Primary surface is a full-bleed dark map;
  everything else is a bottom sheet or a scrolling card list over it.
- **Admin console** -- explicitly optimised for a dense multi-column desktop
  layout. Developer-console aesthetic: monospace for IDs, timestamps and
  hashes; destructive actions in crimson/orange. It inherits the token layer
  but NOT the app's spacing or radii.

**Screen order (climber):** Map (default) > detail sheet > in-range action sheet
> confirmation. Every write action in the product is gated on a 300m GPS check,
so "in range / out of range" is the single most important state the UI has to
communicate, and it must never be carried by color alone.

**CTA placement:** the floating submit FAB on the map, and the in-range action
buttons at the foot of a detail sheet. There is no marketing CTA anywhere.

---

## Motion

Implemented with **Framer Motion (`motion` v13)**, not GSAP -- the app is a
React 19 tree whose motion is overwhelmingly bottom sheets, presence
transitions and list entrances, which is exactly the declarative case. The
GSAP snippets the search returns are kept below as timing/easing reference
only; do not add GSAP as a second animation runtime.

Durations and easings live as tokens in `apps/web/app/globals.css`
(`--dur-*`, `--ease-*`) so they are shared by CSS transitions and by Framer
Motion configs. Never hardcode a duration in a component.

| Surface | Motion | Timing |
|---|---|---|
| Bottom sheet (detail, actions) | slide up from 100%, drag-to-dismiss past 120px | spring, stiffness 380 / damping 34 |
| Sheet exit | slide down | `--dur-fast`, `--ease-standard` (exit faster than entrance) |
| Route/list rows | staggered rise-in, 40ms apart, capped at ~8 items | `--dur-base`, `--ease-spring` |
| Status pill, badges | scale 0.9 -> 1 fade | `--dur-base`, `--ease-spring` |
| Tab switch | icon chip color + `active:scale-95` press | `--dur-fast` |
| Map pin select | scale + elevation lift, no bounce | `--dur-fast` |
| Charts (Recharts) | built-in series animation only | `--dur-slow` |

**Non-negotiable:** `prefers-reduced-motion: reduce` is handled globally in
`globals.css` (all durations collapse to 1ms). Framer Motion components must
additionally use `useReducedMotion()` where the motion is *positional* rather
than decorative -- a global duration collapse still runs a drag-dismiss.

**Reference snippet from the search (Stagger List, Standard tier)** -- for
timing values, not for adoption:

```js
// GSAP reference only -- implement with Framer Motion's `staggerChildren`.
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```

- Do not use overshoot easing on dense informational UI -- the admin console's
  tables and queues get `--ease-standard`, never `--ease-spring`.
- Group DOM writes; never interleave `getBoundingClientRect` between staggered
  entrances.

---

## Anti-Patterns (Do NOT Use)

- ❌ Pure white backgrounds
- ❌ Muted colors
- ❌ Low energy

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
