---
version: alpha
name: Void Scriptor Light Cosmic
description: Light cosmic production design system for Void Scriptor website. Grounded in deep ink typography, luminous indigo-violet gradients, and crisp architectural layout.
colors:
  primary: "#0B1B2B"
  secondary: "#41556B"
  tertiary: "#6B4BD6"
  tertiary-deep: "#5A3BC4"
  tertiary-bright: "#704CE6"
  tertiary-hover-deep: "#4A2FB4"
  tertiary-hover-bright: "#6A48D8"
  violet-ink: "#3F2AA8"
  violet-ink-hover: "#24176F"
  violet-badge-ink: "#3C2A86"
  violet-pale: "#E6DDFF"
  cyan: "#0E8FB8"
  cyan-ink: "#0A6F8C"
  cyan-label-ink: "#006B84"
  cyan-num-ink: "#07566E"
  cyan-pale: "#D6F1FB"
  cyan-pale-soft: "#EAF5FF"
  neutral-bg: "#F2F6FB"
  neutral-bg-2: "#E8EEF8"
  neutral-surface: "#FFFFFF"
  neutral-faint: "#5C6F85"
  neutral-white: "#FFFFFF"
  stamp-ink: "#F5F7FF"
  overlay-dark: "#050507"
  success-ink: "#075C3F"
  success-surface: "#E2F7ED"
  offline-ink: "#7A3B12"
  offline-surface: "#FFF0E5"
  warning-ink: "#704B08"
  warning-surface: "#FFF7DF"
  danger-ink: "#8A2525"
  danger-surface: "#FFF1F1"
  danger-hover-ink: "#721C24"
  danger-hover-surface: "#FFE4E4"
  status-pill-ink: "#0A5C3C"
  status-pill-surface: "#DCF7EA"
  diagnostics-ink: "#164B5C"
  carousel-bg: "#EEF3F9"
  carousel-arrow-ink: "#31527A"
  report-warn-ink: "#8A4A12"
  surface-tint: "#EEF4FB"
  surface-tint-alt: "#F1F5FB"
  brand-github: "#24292F"
  brand-google: "#1A73E8"
  hero-title-dark: "#0A1A29"
  hero-title-mid: "#3B23A8"
typography:
  headline-display:
    fontFamily: "Sora, 'Albert Sans', Inter, system-ui, sans-serif"
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline-lg:
    fontFamily: "Sora, 'Albert Sans', Inter, system-ui, sans-serif"
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline-md:
    fontFamily: "Sora, 'Albert Sans', Inter, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  headline-sm:
    fontFamily: "Sora, 'Albert Sans', Inter, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.35
  body-lg:
    fontFamily: "'Albert Sans', Inter, system-ui, sans-serif"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "'Albert Sans', Inter, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.7
  body-sm:
    fontFamily: "'Albert Sans', Inter, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.6
  label-caps:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: 10px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.14em"
  label-tag:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: 10px
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.18em"
  code-snippet:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: 12.5px
    fontWeight: 500
    lineHeight: 1.5
rounded:
  xs: 4px
  sm: 6px
  md: 10px
  lg: 14px
  xl: 18px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  giant: 48px
  colossal: 64px
components:
  page-body:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.primary}"
  panel-card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.xl}"
    padding: 24px
  panel-card-muted:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.xl}"
    padding: 16px
  button-primary:
    backgroundColor: "{colors.tertiary-deep}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.full}"
    padding: 12px
  button-primary-bright-stop:
    backgroundColor: "{colors.tertiary-bright}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.full}"
    padding: 12px
  button-primary-hover:
    backgroundColor: "{colors.tertiary-hover-deep}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.full}"
  button-primary-hover-bright-stop:
    backgroundColor: "{colors.tertiary-hover-bright}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.full}"
  button-ink:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.sm}"
    padding: 10px
  button-ink-hover:
    backgroundColor: "{colors.tertiary-hover-deep}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.sm}"
  badge-violet:
    backgroundColor: "{colors.violet-pale}"
    textColor: "{colors.violet-badge-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  badge-cyan:
    backgroundColor: "{colors.cyan-pale}"
    textColor: "{colors.cyan-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  badge-cyan-soft:
    backgroundColor: "{colors.cyan-pale-soft}"
    textColor: "{colors.cyan-num-ink}"
    rounded: "{rounded.md}"
    padding: 6px
  badge-label:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.cyan-label-ink}"
    rounded: "{rounded.xs}"
    padding: 4px
  status-ready:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  status-pill:
    backgroundColor: "{colors.status-pill-surface}"
    textColor: "{colors.status-pill-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  status-offline:
    backgroundColor: "{colors.offline-surface}"
    textColor: "{colors.offline-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  status-warning:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.warning-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  status-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  status-danger-hover:
    backgroundColor: "{colors.danger-hover-surface}"
    textColor: "{colors.danger-hover-ink}"
    rounded: "{rounded.full}"
    padding: 6px
  diagnostics-box:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.diagnostics-ink}"
    rounded: "{rounded.sm}"
    padding: 12px
  dashboard-auth-tile:
    backgroundColor: "{colors.surface-tint}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 16px
  dashboard-command-tile:
    backgroundColor: "{colors.surface-tint-alt}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.lg}"
    padding: 16px
  carousel-viewport:
    backgroundColor: "{colors.carousel-bg}"
    textColor: "{colors.carousel-arrow-ink}"
    rounded: "{rounded.xl}"
  proof-stamp-box:
    backgroundColor: "{colors.overlay-dark}"
    textColor: "{colors.stamp-ink}"
    rounded: "{rounded.xs}"
    padding: 4px
  report-warning-block:
    backgroundColor: "{colors.warning-surface}"
    textColor: "{colors.report-warn-ink}"
    rounded: "{rounded.sm}"
    padding: 10px
  github-provider-mark:
    backgroundColor: "{colors.brand-github}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.xs}"
  google-provider-mark:
    backgroundColor: "{colors.brand-google}"
    textColor: "{colors.neutral-white}"
    rounded: "{rounded.xs}"
  hero-title-dark-stop:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.hero-title-dark}"
  hero-title-mid-stop:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.hero-title-mid}"
  hero-title-violet-stop:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.tertiary}"
  hero-title-cyan-stop:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.cyan-label-ink}"
  accent-cyan-border:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.cyan-ink}"
    rounded: "{rounded.xs}"
    padding: 6px
  hero-accent-cyan:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 4px
  content-link:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.violet-ink}"
  content-link-hover:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.violet-ink-hover}"
  faint-note:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-faint}"
  neutral-bg-secondary:
    backgroundColor: "{colors.neutral-bg-2}"
    textColor: "{colors.primary}"
---

## Overview

Void Scriptor Light Cosmic represents the daylight manifestation of the Void Scriptor aesthetic. It replaces the traditional monochrome developer template with a luminous, cosmic palette featuring high-contrast indigo-violet interactive drivers, deep obsidian-navy typography, and pristine frosted glass surfaces.

The visual tone is cinematic yet disciplined:
- **Tone:** Authoritative, architectural, precise, and creator-focused.
- **Emotion:** Clarity, focus, and quiet energy without aggressive marketing hyperbole.
- **Audience:** Storytellers, technical authors, worldbuilders, and engineers seeking high legibility and elegant dark-and-light parity.

## Colors

The palette is anchored by a high-contrast ink layer paired with energetic indigo-violet actions and supportive cyan accents:

- **Primary (`#0B1B2B`):** Deep obsidian navy ink providing a minimum 14.9:1 contrast against light backgrounds. Used for all primary headlines, body text, and prominent boundaries.
- **Secondary (`#41556B`):** Balanced slate ink providing at least 6.5:1 contrast for supporting descriptions, table headers, metadata, and footer links.
- **Tertiary (`#6B4BD6`):** The signature brand violet used for focal brand markers and gradient midpoint accents.
- **Tertiary Deep (`#5A3BC4`) & Tertiary Bright (`#704CE6`):** The normative stop values for primary CTA gradients carrying white text (`linear-gradient(135deg, var(--ls-violet-deep), var(--ls-violet-2))`). Every point along this ramp yields a minimum 5.43:1 contrast ratio against white text, resolving axe-core gradient blind spots.
- **Tertiary Hover Deep (`#4A2FB4`) & Tertiary Hover Bright (`#6A48D8`):** Deepened interaction hover stops maintaining AA compliance across user interactions.
- **Violet Inks (`#3F2AA8`, `#24176F`, `#3C2A86`):** Dedicated ink tokens for links, active hover states, and badge typography ensuring full accessibility on light surfaces.
- **Cyan Family (`#0E8FB8`, `#0A6F8C`, `#006B84`):** Celestial cyan accents. Small badges and uppercase labels employ `--ls-cyan-label-ink` (`#006B84`) to guarantee WCAG AA 4.5:1+ compliance.
- **Neutrals (`#F2F6FB`, `#E8EEF8`, `#FFFFFF`):** Cool crystalline canvas backgrounds and crisp elevated white cards.
- **Semantic Status Triads:** Explicit background, text, and border tokens for Ready (`#075C3F` / `#E2F7ED`), Offline (`#7A3B12` / `#FFF0E5`), Warning (`#704B08` / `#FFF7DF`), and Danger (`#8A2525` / `#FFF1F1`).

## Typography

Typography balances clean structural sans-serif for reading comfort with technical monospace accents for data precision, harmonizing editorial distinction with robust geometric fallbacks:

- **Headlines / Display:** `Sora` with `Albert Sans` and `Inter` (`Sora, 'Albert Sans', Inter, system-ui, sans-serif`), anchored by tight line height (1.05 - 1.25) and subtle negative tracking (`-0.025em` to `-0.035em`) for monumental presentation. `Inter` acts as the reliable geometric core.
- **Body Text:** `Albert Sans` with `Inter` (`'Albert Sans', Inter, system-ui, sans-serif`), set at 15px with generous line height (1.7) for continuous readability on long documentation, release notes, and legal copy.
- **Technical Labels & Badges:** Monospace uppercase (`JetBrains Mono`, `Roboto Mono`, `ui-monospace`) with deliberate wide letter-spacing (`0.14em` to `0.18em`) for metadata, timestamps, version identifiers, and architectural tags.

## Layout

Layout follows a strict, responsive content-driven architecture:

- **Shell Boundaries:** Maximum content container width of 1200px (standard pages) or 880px (reading/article pages) centered with safe responsive padding.
- **Rhythm Scale:** Spacing follows a 4px / 8px scale (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`) to establish predictable cadence across cards and sections.
- **Containment:** Information is grouped inside bounded cards with generous internal padding (16px to 24px) rather than floating unbound.
- **Mobile Reflow:** All headings fluidly scale using CSS `clamp()` down to 320px viewport width without horizontal overflow.

## Elevation & Depth

Elevation is achieved through luminous tonal layering and frosted glass rather than heavy, muddy drop shadows:

- **Glass Surfaces:** Semi-transparent white (`rgba(255, 255, 255, 0.72)`) with subtle multi-layer line borders (`rgba(19, 45, 74, 0.12)`).
- **Subtle Elevation:** Soft, diffuse ambient shadow (`0 18px 44px rgba(19, 45, 74, 0.12)`) reserved for elevated panels, floating navigation, and modals.
- **Artwork Horizon:** Distinctive atmospheric page art hero band with a gradient mask anchoring the top of each canonical route.

## Shapes

Shapes communicate architectural stability with refined, modern softening:

- **Cards & Panels:** 14px to 18px corner radius (`--radius-card`, `--radius-lg`) creating friendly but structured containment.
- **Controls & Inputs:** 6px to 10px corner radius for standard form inputs, select dropdowns, and utility controls.
- **Action Buttons & Badges:** Pill-shaped (`9999px`) for primary call-to-action buttons, status badges, and category chips.

## Components

The system establishes strict component tokens and states:

- **Primary CTA Button:** High-contrast gradient background (`#5A3BC4` to `#704CE6`) with white text and minimum 44px touch target height.
- **Secondary & Ghost Actions:** Frosted white surface (`rgba(255, 255, 255, 0.72)`) with dark ink text (`#0B1B2B`), transitioning to crisp white with violet border on hover.
- **Status Chips:** Distinct colored background and ink pairs ensuring every state pill (ready, offline, warning, danger) meets WCAG AA standards.
- **Form Controls:** Clean white background with subtle border, gaining a violet outline with pale violet halo on keyboard focus.

## Do's and Don'ts

### Do's
- Do reference tokens via `var(--token-name)` instead of hardcoding raw hex values in rules.
- Do verify white text on gradient backgrounds with multi-point luminance sampling (ensuring >= 4.5:1 across the entire ramp).
- Do maintain distinct text hierarchy: primary text (`#0B1B2B`), secondary muted (`#41556B`), faint metadata (`#5C6F85`).
- Do ensure standalone interactive cards and action buttons declare at least 44px touch target height.
- Do keep mobile viewports down to 320px completely free of horizontal scroll.

### Don'ts
- Don't use light cyan (`#0E8FB8`) as body text or small label ink on light backgrounds; use `--ls-cyan-label-ink` (`#006B84`) instead.
- Don't use generic AI-slop gradients (blue-purple neon or harsh pastel blocks) without purpose.
- Don't allow raw hex in ordinary component rules when a semantic token is defined.
- Don't nest component variant definitions in token specifications.
- Don't ship buttons or navigation links pointing to nonexistent routes or placeholders without visual indication.
