---
version: alpha
name: ClickUp
website: "https://clickup.com"
description: >-
  ClickUp's homepage is built around a single high-voltage neon-purple
  ("#7612fa") that lives almost entirely inside the primary CTA gradient
  (#fa12e3 → #7612fa → #12d0fa), against a near-white "#ffffff" canvas,
  graphite "#202020" page-floor text, and a quiet lavender utility hue
  "#7b68ee" reserved for inline links and "brand clickup" accents. Display
  type runs Plus Jakarta Sans at weight 650-700 with aggressive negative
  letter-spacing (-3.04px at 76px), body holds Inter at weight 400/500, and a
  dark "#292d34" pill renders the dominant "Get started. It's FREE!" CTA —
  this is a productivity SaaS that treats the gradient as the brand rather
  than a flat purple swatch.

seo:
  title: "ClickUp Design System for React — Neon Purple #7612fa, Plus Jakarta Sans, 22 components"
  metaDescription: "ClickUp's design system as a DESIGN.md file. Neon purple #7612fa, gradient CTA, Plus Jakarta Sans, 22 components. For React, Next.js, and AI tools."
  highlights:
    - "Gradient-as-brand voltage — the primary CTA is a 263deg sweep through #fa12e3, #7612fa and #12d0fa, never a flat fill"
    - "Graphite over true black — page text sits at #292d34 (1830 occurrences) so headings read warm against the white canvas, not stark"
    - "Plus Jakarta Sans for display, Inter for chrome — two-family split with -3.04px tracking at the 76px hero"
    - "Dark-pill primary CTA — the 'Get started. It is FREE!' button renders #292d34 background at 20px radius, not the brand gradient"
    - "Sometype Mono uppercase eyebrows — the only mono surface in a system that otherwise runs two sans families"
  tags:
    - "Project Management"
    - "Productivity & SaaS"
  lastUpdated: "2026-05-13"
  author:
    name: "Dov Azencot"
    url: "https://x.com/dovazencot"
  opening: |
    ClickUp's homepage is a white canvas with one voltage and one gradient. The page floor is "#ffffff" with graphite "#292d34" carrying every heading and every hairline (3585 occurrences across text and border). The dominant chromatic signal is neon purple "#7612fa" — but it appears almost exclusively inside the primary-CTA gradient `linear-gradient(263deg, #fa12e3 -35%, #7612fa 41%, #12d0fa 135%)`, not as a flat fill. The hero CTA itself ("Get started. It's FREE!") is the inversion of that rule: a near-black "#292d34" pill at 20px radius, white text, weight 650. The gradient sits behind secondary "Try ClickUp Brain" surfaces and the wordmark, while the page itself stays calm.

    This DESIGN.md packages the homepage spec into one Google Labs DESIGN.md file. Inside: 22 color tokens grouped into a graphite text ladder ("#292d34" through "#838383", "#b4b4b4"), a near-black-button family, a brand layer for neon purple "#7612fa", lavender link "#7b68ee" and the deep-blue utility "#4a2fff", and the 7 accent badge colors (blue "#0091ff", purple "#6647f0", pink "#ff02f0", orange "#f76808", green "#078d3b", red "#f0382d") drawn from the `--Core-Accents-*` CSS variable set. Typography spans 12 tokens running Plus Jakarta Sans for display and Inter for chrome, with Sometype Mono reserved for uppercase eyebrows. Eight rounded values (4px chip, 9px button, 12px tile, 14px card, 20px hero-pill, 25px section, 35px feature panel, 9999px avatar), nine spacing tokens on a 10px base, and 22 components covering buttons, cards, the workspace-app tile grid, gradient hero CTA, dark pill CTA, top nav and footer.

    Feed the file to Claude, Cursor, or GitHub Copilot and the agent reproduces ClickUp's actual move — gradient reserved for one CTA family, dark pill for the primary, graphite text on white, Plus Jakarta display paired with Inter chrome — instead of a generic purple-SaaS theme. Or reference the tokens directly: every hex, font, radius, and spacing value is a quoted scalar you can paste into Tailwind config, CSS variables, or a component library. ClickUp is worth studying because it positions a multi-color gradient as the brand voltage without letting it leak across the rest of the page — every other surface is sober graphite-on-white.
  related:
    - href: "/design"
      title: "Browse all design systems"
      description: "The full directory of DESIGN.md files on shadcn.io, with live mockups for each."
    - href: "https://clickup.com"
      title: "ClickUp — official site"
      description: "ClickUp's marketing homepage — the everything app for work, with tasks, docs, goals, and chat."
    - href: "https://github.com/google-labs-code/design.md"
      title: "The DESIGN.md specification"
      description: "Google Labs' open spec for machine-readable design system files — the format this page is built on."
  questions:
    - id: "primary-color"
      title: "What is ClickUp's primary brand color?"
      answer: "ClickUp's voltage is neon purple at \"#7612fa\" (426 occurrences as a background) — but it almost never appears as a flat fill. The dominant CTA gradient sweeps 263 degrees through \"#fa12e3\" → \"#7612fa\" → \"#12d0fa\", and that gradient carries the brand identity. A quieter lavender \"#7b68ee\" lives in the `--color-link` and `--color-brand-clickup` CSS variables and shows up on inline links and footer accents. The graphite text \"#292d34\" appears far more often (3585 hits) and does the visual heavy lifting."
    - id: "dark-mode"
      title: "Does ClickUp have a dark mode in this DESIGN.md?"
      answer: "Not as a togglable theme on the marketing site. The captured homepage is light-only with a \"#ffffff\" canvas and a \"#f8f9fa\" surface tier. The single dark surface is the primary CTA pill itself — \"#292d34\" background, white text, 20px radius. The ClickUp product app ships a full dark theme, but this DESIGN.md documents the marketing homepage where dark is scoped to the button level rather than a global mode."
    - id: "typography"
      title: "What fonts does ClickUp use, and what should I substitute?"
      answer: "ClickUp runs two families. Display headlines use Plus Jakarta Sans at weight 650-700 — the hero h2 hits 76px at weight 700 with -3.04px letter-spacing (the `--display-3xl` token). Body copy, nav links, and button labels run Inter at weight 400-600. A third family, Sometype Mono, is reserved for uppercase eyebrow labels at 14px / weight 500. Plus Jakarta Sans is open-source on Google Fonts, as is Inter. Sometype Mono is also free — JetBrains Mono or Geist Mono are acceptable substitutes for the eyebrow role."
    - id: "shape-language"
      title: "Why does ClickUp use such varied border-radius values?"
      answer: "The radius scale is wider than most SaaS marketing pages. Buttons land at 20px (the primary CTA) or 9px (secondary tertiary surfaces), inline chips at 4px, app-grid tiles at 12px, feature cards at 14px, section panels at 25px, and oversized feature frames at 35px. The mix lets ClickUp differentiate the dominant CTA pill geometry from the workspace-app tile grid below it. Avatars and icon chips push to 50 percent (perfect circles) — by far the most frequent radius on the page at 926 occurrences."
    - id: "use-in-project"
      title: "Can I use this DESIGN.md to build a React productivity app?"
      answer: "Yes. Drop the file into Claude, Cursor, or Copilot and the agent will reproduce ClickUp's gradient-CTA discipline, graphite-on-white text ladder, Plus Jakarta display paired with Inter chrome, and the 20px dark pill primary geometry — not a generic purple SaaS theme. You can also pull tokens directly: every hex (\"#7612fa\", \"#292d34\", \"#7b68ee\", the brand-accent badges) and every radius / spacing / typography value is a quoted scalar you can paste into Tailwind config or CSS variables. The 22 component definitions cover the gradient hero CTA, dark pill CTA, app-tile grid, feature cards, top nav and footer."
    - id: "known-gaps"
      title: "What's missing from this DESIGN.md spec?"
      answer: "A few items live in the Known Gaps section. The text-input component was not surfaced on the captured homepage — the public landing is read-only above the fold, so input geometry is inferred from sibling productivity tools. Dark mode is not documented for the marketing surfaces. Animation and transition timings are partially captured (`--transition-short` at 0.25s with the `cubic-bezier(0.5, 0, 0.5, 1)` easing) but motion specifics for the gradient hover state were not extracted. The 7-color accent-badge palette is drawn from CSS variables; the actual in-product label palette may include additional hues."

colors:
  primary: "#7612fa"
  primary-deep: "#4a2fff"
  primary-soft: "#b38cff"
  brand-link: "#7b68ee"
  brand-pink: "#fa24ce"
  brand-pink-deep: "#ff02f0"
  brand-orange: "#f76808"
  brand-coral: "#fc6d7b"
  brand-amber: "#fd9a46"
  brand-sky: "#4fb9fa"
  accent-blue: "#0091ff"
  accent-purple: "#6647f0"
  accent-magenta: "#a43cb4"
  accent-green: "#078d3b"
  accent-red: "#f0382d"
  canvas: "#ffffff"
  surface: "#f8f9fa"
  surface-soft: "#e9ebf0"
  hairline: "#e8e8e8"
  hairline-strong: "#d9d9d9"
  ink: "#292d34"
  ink-deep: "#202020"
  ink-darkest: "#090c1d"
  ink-secondary: "#646464"
  ink-tertiary: "#6f6f6f"   # was #838383 — see the note below
  ink-disabled: "#b4b4b4"
  shadow-indigo: "#122ba5"
  shadow-navy: "#1b1754"

typography:
  display-3xl:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: 76px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-3.04px"
  display-2xl:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: 60px
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-2.1px"
  display-xl:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: 48px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-1.68px"
  display-lg:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: 40px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-1.6px"
  display-md:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: 34px
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-1.36px"
  heading-md:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: 26px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.91px"
  heading-sm:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: 18px
    fontWeight: 650
    lineHeight: 1.33
    letterSpacing: "-0.54px"
  body-lg:
    fontFamily: "Inter, sans-serif"
    fontSize: 18px
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "-0.36px"
  body-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.375
    letterSpacing: "-0.32px"
  body-sm:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.43
    letterSpacing: "-0.15px"
  button-md:
    fontFamily: "Inter, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: "-0.15px"
  eyebrow-mono:
    fontFamily: "Sometype Mono, monospace"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.29
    letterSpacing: "0px"
  caption:
    fontFamily: "Inter, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.12px"

rounded:
  xxs: "4px"
  sm: "9px"
  md: "12px"
  lg: "14px"
  pill: "20px"
  xl: "25px"
  xxl: "35px"
  full: "9999px"

spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "20px"
  lg: "24px"
  xl: "40px"
  xxl: "60px"
  section: "100px"
  hero: "150px"

components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.pill}"
    padding: "14px 20px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.canvas}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.pill}"
    padding: "14px 20px"
  button-gradient:
    backgroundColor: "linear-gradient(263deg, #fa12e3 -35%, #7612fa 41%, #12d0fa 135%)"
    textColor: "{colors.canvas}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.pill}"
    padding: "14px 20px"
    height: "52px"
  button-secondary:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    border: "1px solid {colors.hairline}"
  button-tertiary:
    backgroundColor: "transparent"
    textColor: "{colors.brand-link}"
    typography: "{typography.button-md}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "0"
    height: "60px"
    padding: "0 40px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "0"
    padding: "0"
  card-tile:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "20px"
    border: "1px solid {colors.hairline}"
  card-feature:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "24px"
    border: "1px solid {colors.hairline}"
  card-feature-panel:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xxl}"
    padding: "40px"
    border: "1px solid {colors.hairline}"
  card-section:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xl}"
    padding: "60px"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "0"
    padding: "80px 0 8px"
  pricing-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "32px"
    border: "1px solid {colors.hairline}"
  pricing-card-featured:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "32px"
    border: "2px solid {colors.primary}"
  badge-accent:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.eyebrow-mono}"
    rounded: "{rounded.xxs}"
    padding: "2px 8px"
  badge-pill:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  app-icon-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-deep}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    padding: "8px"
    height: "40px"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    border: "1px solid {colors.hairline-strong}"
    height: "44px"
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
    border: "2px solid {colors.primary}"
  cta-banner-light:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"
    rounded: "{rounded.xxl}"
    padding: "60px"
  footer-region:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    rounded: "0"
    padding: "80px 40px"
    border: "1px solid {colors.hairline}"
  footer-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body-sm}"
    rounded: "0"
    padding: "4px 0"
---

## Overview

> **Read this first.** This file documents ClickUp's marketing design system as
> captured. The Loving Hands Portal follows it with one deliberate exception —
> eyebrows, field labels and table column headers are **sentence case**, not
> uppercase — and adds product-level conventions of its own (the status colour
> palette, truncation recovery, and the rule that a KPI never renders zero on
> first paint). Both are in `docs/specs/00-master.md` §4 "Design conventions",
> and the override is restated under Do's and Don'ts below.

ClickUp's marketing system is a productivity SaaS that hides its purple voltage inside a gradient and leaves the rest of the page on graphite-and-white. The canvas is `{colors.canvas}` ("#ffffff"); the page-floor text is `{colors.ink}` ("#292d34"), a warm graphite that appears 3585 times across text and hairline borders. The single saturated chromatic signal is **neon purple** `{colors.primary}` ("#7612fa"), which lives almost entirely inside the primary CTA gradient `linear-gradient(263deg, #fa12e3 -35%, #7612fa 41%, #12d0fa 135%)`. A quieter lavender `{colors.brand-link}` ("#7b68ee") sits in the `--color-brand-clickup` variable and surfaces on inline links and footer chrome.

**Gradient-as-brand**: where most productivity tools commit to one flat brand swatch (Asana coral, Linear lavender, Notion purple-pill), ClickUp's identity is the 263-degree magenta-to-purple-to-cyan sweep itself. The flat "#7612fa" hex never appears as a section background — it's a stop inside the gradient, not a fill. The hero CTA inverts this rule one more time: "Get started. It's FREE!" renders as a dark pill at `{colors.ink}` ("#292d34") with white text, 20px radius, weight 650. The gradient stays in supporting CTAs and brand surfaces while the dominant action goes graphite.

Display type runs **Plus Jakarta Sans** at weight 650-700 with negative tracking that pulls hardest at the top of the ramp — the hero h2 hits 76px / weight 700 / -3.04px letter-spacing (the `--display-3xl` token). Body copy, nav links, and button labels switch to Inter at weight 400-600. A third family, Sometype Mono uppercase at 14px / 500, is reserved for eyebrow labels — the only mono surface on the page.

Page rhythm leans on a **workspace-app tile grid** rather than atmospheric color. Below the hero, ClickUp renders dense 6-column grids of small product-app icons (Tasks, Docs, Goals, Chat, Whiteboards, Forms…) inside 12px-rounded white tiles with 1px hairline borders. The visual density of the grid is the design move; the marketing chrome stays calm so the grid can do the heavy lifting.

**Key Characteristics:**
- **Light-canvas marketing system** — `{colors.canvas}` ("#ffffff") with graphite `{colors.ink}` ("#292d34") carrying every heading and hairline.
- **Gradient-as-brand voltage** — primary CTA renders the 263deg magenta-purple-cyan sweep; flat "#7612fa" never fills a section.
- Dark pill primary — `{colors.ink}` ("#292d34") background, white text, `{rounded.pill}` 20px radius, weight 650.
- Plus Jakarta Sans display paired with Inter chrome; Sometype Mono reserved for uppercase eyebrows.
- Aggressive negative tracking on display — -3.04px at 76px, scaling to -0.15px at 14px body.
- Eight-step radius scale — from `{rounded.xxs}` 4px chips through `{rounded.xxl}` 35px feature panels.
- Workspace-app tile grid carries the product story; no atmospheric gradients, no spotlight cards.

## Colors

- **ClickUp neon purple (`#7612fa`)** — frequency 426. Used as background (426), text (0), border (0). The brand voltage, but reserved almost exclusively for the primary CTA gradient stop and the "ClickUp Brain" wordmark accent — never a flat section fill.
- **Graphite ink (`#292d34`)** — frequency 3585. Used as text (1830), border (1750), bg (1). The page-floor text color; pairs with the canvas as the dominant ink layer and carries hairline borders below content blocks.
- **Page-floor white (`#ffffff`)** — frequency 173. Used as bg (95), border (32), text (31). Canvas color for `--Core-Background-Main`; also appears as text inside the dark pill CTA and the gradient buttons.
- **Surface soft (`#e9ebf0`)** — frequency 529. Used as bg (510), border (10), text (8). The light tile background carrying app-grid chips, secondary buttons, and the lighter strip dividers between hero sections.
- **Ink secondary (`#646464`)** — frequency 201. Used as text (108), border (91), bg (2). Mapped to `--Core-Text-Secondary`; carries dimmed copy, nav-link inactive states, and footer labels.
- **Focus purple (`--color-focus`, `#7612fa`)** — the same value as brand purple, under a second name.
  **Product deviation (2026-09-06 UI review, C1).** The design system specifies a 2px purple focus ring, and every component asked for it as `outline-primary`. It never rendered: shadcn's `@theme inline` block re-declares `--color-primary` as `var(--primary)`, and `:root` sets `--primary` to ink, so `--color-primary` computed to `#292d34` from Phase 01 until this review. Ink is the *correct* resolution for `bg-primary` — the ClickUp primary CTA is the dark pill, never purple — so the rebinding stays and the focus ring moved to `--color-focus`, which nothing shadows. Use `outline-focus` / `border-focus` for focus states; `bg-primary` remains the dark pill.
- **Brand link lavender (`#7b68ee`)** — frequency 46. Used as text (25), border (21). The `--color-brand-clickup` and `--color-link` value; scoped to inline links, "Learn more" affordances, and footer accent dots — never a button background.
- **Ink tertiary (`#6f6f6f`, ClickUp `#838383`)** — frequency 142. Used as text (71), border (71). Mapped to `--Core-Text-Tertiary`; the third tier of the warm-gray ramp for meta labels and caption copy.
  **Product deviation (2026-09-06 UI review, G4).** ClickUp's `#838383` reads 3.79:1 on canvas and 3.60:1 on surface. In this product the token carries every eyebrow, field label and caption — all of them 12-14px body text, which WCAG AA holds to 4.5:1, and the review flagged them as low-contrast on white. The portal ships `#6f6f6f`: 5.02:1 on canvas, 4.77:1 on surface, and still a visible step lighter than ink-secondary `#646464`.
- **Ink deep (`#202020`)** — frequency 119. Used as text (50), border (54), bg (7). Mapped to `--Core-Text-Main` and `--Core-Button-Primary`; the deepest non-black ink, used for emphasis copy and the hover state of the dark pill CTA.
- **Ink darkest (`#090c1d`)** — frequency 100. Used as text (50), border (50). A near-black navy used for compressed dark surfaces (the bottom CTA banner border, certain dark-mode product mockups).
- **Accent blue (`#0091ff`)** — frequency 28. Used as gradient (17), text (5), border (5), shadow (1). The `--Core-Accents-Blue` value; appears in the in-product UI mockups for "Tasks" and "Calendar" tile icons and in the secondary CTA gradient halo.
- **Accent purple (`#6647f0`)** — frequency 21. Used as text (9), border (9), gradient (3). The `--Core-Accents-Purple` value; mapped to the AI-feature label chips and the "ClickUp Brain" subhead accent.
- **Hairline (`#e8e8e8`)** — drawn from `--Core-Border-Default`. Carries every 1px divider between feature cards, app-tile grids, and the footer region.
- **Hairline strong (`#d9d9d9`)** — frequency 15. Mapped to `--Core-Button-Secondary-Hover`; used as the inactive border on form inputs and the resting state of secondary buttons.
- **Shadow indigo (`#122ba5`)** — frequency 12. Used exclusively as a shadow stop (shadow 12). Tints the deep-purple drop shadow under hero mockups; not a fill color.
- **Brand pink (`#fa24ce`)**, **brand orange (`#f76808`)**, **brand coral (`#fc6d7b`)**, **brand amber (`#fd9a46`)**, **brand sky (`#4fb9fa`)** — each at gradient frequency 4. The brand-color spectrum used inside icon illustrations and gradient halos around feature mockups; none of them fills a content surface.
- **Accent magenta (`#a43cb4`)**, **accent green (`#078d3b`)**, **accent red (`#f0382d`)** — drawn from `--Core-Accents-Pink`, `--Core-Utilities-Green`, `--Core-Utilities-Red`; reserved for in-product status badges and semantic chips.

## Typography

ClickUp runs two type families plus a mono accent. **Plus Jakarta Sans** carries every display tier — `{typography.display-3xl}` lands at 76px / weight 700 with -3.04px tracking (the hero h2 token, `--display-3xl`), and the ramp scales down through 60px, 48px, 40px, 34px, 26px headings, each at weight 650 with proportional negative tracking. **Inter** takes over for body copy, nav links, and button labels: 18px lg / 16px md / 14px sm at weight 400-600 with -0.15px to -0.36px tracking.

**Mono as eyebrow signature**: where most SaaS marketing pages use uppercase Inter or Geist for eyebrow labels, ClickUp swaps in **Sometype Mono** at 14px / weight 500 / uppercase / 0 tracking. The mono family appears only in this eyebrow role — the body copy and headlines stay proportional. It's the typographic signal that the section underneath belongs to a product surface rather than marketing prose.

Weight discipline is tight: display tokens cluster at 650-700, body holds at 400-500, and buttons render at 600-650. No weight 800/900 anywhere, no italic anywhere on the homepage, and the system never crosses Plus Jakarta into a body role or Inter into a display role.

## Layout

The page is centered on a `--size-v3-homepage-container` of 1160px, with `--breakpoint-v3-container` set at 70rem. Section padding lives at 80-150px vertical (`--spacing-stack-spacing-desktop` is 150px); inline gutter is 40px desktop, 20px mobile. The 10px base unit (`--spacing-1` is 10px) drives a generous rhythm — most stacking lands at 20px, 40px, or 60px multiples, not the tighter 4px / 8px scale typical of dev-tooling marketing pages.

The hero is centered (headline, eyebrow, dual CTA pair, mockup floating beneath). Below the hero, the page cycles through 6-column app-icon tile grids, 3-column feature mockup cards, and a centered-headline section pattern that breaks every 100px of vertical scroll. Section dividers are 1px hairlines at `{colors.hairline}` — no full-width band changes inside the body region.

## Elevation & Depth

Shadows are tinted, not gray. The hero mockup card uses a layered drop shadow with `#122ba5` (deep indigo, 12 occurrences as a shadow stop) and `#1b1754` (navy, 4 occurrences as shadow) as the tint colors — the shadow color echoes the brand purple rather than being neutral. Tokens are organized in `--shadow-xs` (0 4px 12px), `--shadow-sm` (0 10px 25px), `--shadow-md` (0 20px 60px), `--shadow-lg` (0 16px 78px), and `--shadow-xl` (0 34px 54px).

The page itself avoids heavy elevation: app-tile grids and feature cards rest on the canvas with 1px hairline borders, not drop shadows. Only the hero mockup and the bottom CTA banner lift visibly. Hover states use the `0.25s cubic-bezier(0.5, 0, 0.5, 1)` transition (the `--transition-short` token) — short, slightly anticipatory.

## Shapes

The corner-radius scale is wider than most SaaS marketing pages. Avatars and icon chips push to `{rounded.full}` (50%, 926 occurrences — by far the dominant radius). Chips and badges land at `{rounded.xxs}` (4px), secondary buttons and inputs at `{rounded.sm}` (9px, 52 occurrences), app-grid tiles at `{rounded.md}` (12px, 16 occurrences), feature cards at `{rounded.lg}` (14px, 9 occurrences), the primary CTA pill at `{rounded.pill}` (20px, 4 occurrences), section panels at `{rounded.xl}` (25px), and oversized feature frames at `{rounded.xxl}` (35px, the `--border-radius-xl` token).

The geometry contrast is deliberate: chips are nearly square (4px), tiles are softly square (12px), buttons are pill-tipped (20px), and feature panels feel oversized-rounded (35px). The radius scale itself carries hierarchy without resorting to color or shadow shifts.

## Components

- **`button-primary`** — the dark pill CTA. Background `{colors.ink}` ("#292d34"), text `{colors.canvas}`, typography `{typography.body-lg}` (Inter 18px / 650), `{rounded.pill}` 20px, padding 14px 20px, height 52px. The dominant action on every section.
- **`button-primary-hover`** — pressed state. Shifts the background to `{colors.ink-deep}` ("#202020") while keeping the rest of the spec.
- **`button-gradient`** — the secondary-tier CTA. Background renders the `263deg, #fa12e3 -35%, #7612fa 41%, #12d0fa 135%` gradient with white text at the same body-lg / pill geometry as the dark primary.
- **`button-secondary`** — the soft secondary action. Background `{colors.surface-soft}` ("#e9ebf0"), `{rounded.sm}` 9px, 1px hairline border.
- **`button-tertiary`** — text-only affordance. Transparent background, `{colors.brand-link}` ("#7b68ee") text for inline "Learn more" links.
- **`top-nav`** — 60px height, canvas background, ink text, no border. Sticky on scroll with a subtle resting-state hairline.
- **`nav-link`** — transparent affordance, `{colors.ink}` text at body-md.
- **`card-tile`** — the app-grid tile. Canvas background, 1px hairline border, `{rounded.md}` 12px, 20px padding. Houses a single product icon and label.
- **`card-feature`** — the 3-column feature mockup tile. Canvas background, `{rounded.lg}` 14px, 24px padding, 1px hairline.
- **`card-feature-panel`** — the oversized feature panel. `{rounded.xxl}` 35px, 40px padding.
- **`card-section`** — the surface-tinted background panel. `{colors.surface}` ("#f8f9fa") background, `{rounded.xl}` 25px, 60px padding — used for the "Brain" and "Chat" feature bands.
- **`hero-band`** — the hero region. Canvas background, no border, 80px top / 8px bottom padding so the mockup card can break out underneath.
- **`pricing-card`** + **`pricing-card-featured`** — the 4-tier pricing comparison rows. Featured tier gets a 2px `{colors.primary}` purple border.
- **`badge-accent`** — the eyebrow badge with Sometype Mono uppercase typography, `{rounded.xxs}` 4px chip geometry.
- **`badge-pill`** — the meta status badge with caption typography, `{rounded.full}` pill shape.
- **`app-icon-chip`** — the 40px circular icon chip in the app-grid header.
- **`text-input`** + **`text-input-focused`** — 44px-tall inputs at `{rounded.sm}` 9px. Focus shifts the border to a 2px `{colors.primary}` purple.
- **`cta-banner-light`** — the bottom-of-page CTA banner. `{colors.surface}` background, `{rounded.xxl}` 35px, 60px padding.
- **`footer-region`** + **`footer-link`** — the multi-column footer with `{colors.ink-secondary}` ("#646464") text at body-sm.

## Do's and Don'ts

> **Project override — Loving Hands Portal, 2026-09-05.** One rule below is
> deliberately not followed. ClickUp's eyebrow is Sometype Mono **uppercase**;
> in this product, eyebrows, field labels and table column headers keep the
> mono family, size and tertiary colour but are set in **sentence case**. A
> design review found the all-caps slowed scanning on screens the ops team
> reads all day, where those labels are functional rather than decorative.
> Everything else here stands: mono still marks a label as chrome, and
> uppercase is still never used on Plus Jakarta Sans headlines. The full set of
> product-level conventions is in `docs/specs/00-master.md` §4 "Design
> conventions", and the canvas linked from `CLAUDE.md` is the picture of them.


**Do** keep neon purple "#7612fa" inside the gradient. The flat hex never appears as a section background on ClickUp's homepage — using it as a fill breaks the gradient-as-brand discipline. For a purple surface, use the lavender brand-link "#7b68ee" instead.

**Do** render the primary CTA in graphite "#292d34" with white text, not in purple. The inversion (dark pill against the gradient-rendered secondary) is the visual rhythm of the page.

**Do** pair Plus Jakarta Sans 650-700 display with Inter 400-600 body. Crossing the families (Inter at 76px, Plus Jakarta at 14px) breaks the two-family contract — the validator can not catch this, only your eye can.

**Don't** use "#7b68ee" lavender for a CTA background. It is a `--color-link` and `--color-brand-clickup` text/border value (46 occurrences, 25 as text, 21 as border) — never a button fill. For a purple-leaning CTA, use the gradient.

**Don't** apply the `--shadow-md` (0 20px 60px) drop shadow with a neutral gray tint. ClickUp's shadows are tinted "#122ba5" deep indigo or "#1b1754" navy — the shadow color echoes the brand purple. A neutral-gray shadow reads as a different design system.

**Don't** mix radius tiers inside a single component cluster. Pricing cards (`{rounded.lg}` 14px) should not sit next to feature panels (`{rounded.xxl}` 35px) in the same row — pick one. The wide radius scale carries hierarchy only when each tier stays within its lane.

**Don't** use uppercase tracking on Plus Jakarta Sans headlines. Uppercase is reserved for the Sometype Mono eyebrow role at 14px / weight 500 — pushing display headings into uppercase breaks the eyebrow-vs-headline reading hierarchy.

## Known Gaps

- The text-input geometry is inferred from sibling productivity tools (the homepage is read-only above the fold and does not surface a styled form input).
- Dark-mode token values are not documented for the marketing surfaces — the in-app dark theme is a separate spec.
- Motion specifics for the gradient hover state (the magenta-to-cyan sweep animates on hover) were not extracted beyond the 0.25s `cubic-bezier(0.5, 0, 0.5, 1)` baseline.
- The 7-color accent badge palette is drawn from `--Core-Accents-*` CSS variables; the actual in-product label palette may include additional hues for project tags and priority levels.
- Form-validation states (success, error) are not surfaced on the captured homepage; the `--color-error` and `--color-success` CSS variables are documented but not visible in components.
