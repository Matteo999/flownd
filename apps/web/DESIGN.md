---
name: Flownd Web
description: Public landing and waitlist surfaces for Flownd, built in the native app's own world.
colors:
  canvas: "#f6f8f7"
  surface: "#ffffff"
  sunken: "#edf1ef"
  ink: "#16211d"
  ink-secondary: "#5c6b64"
  placeholder: "#6b7a73"
  hairline: "#dce3df"
  petrol: "#256b7e"
  petrol-deep: "#1d5666"
  petrol-mist: "#dceaec"
  on-accent: "#ffffff"
  positive: "#2e8b6f"
  save-band: "#277a61"
  wants-band: "#8a6516"
  amber-fill: "#b98a2e"
  amber-text: "#8a6516"
  negative: "#b44d36"
  wall-ink: "#b3beb8"
  wall-dim: "#d9e0dc"
  trust-ink: "#eaf1ed"
  trust-ink-secondary: "#a9b8b0"
  dark-canvas: "#0f1712"
  dark-surface: "#17211c"
  dark-sunken: "#0b120e"
  dark-ink: "#eaf1ed"
  dark-ink-secondary: "#9aaaa2"
  dark-hairline: "#26332c"
  dark-petrol: "#47b3d1"
  dark-petrol-deep: "#6cc5de"
  dark-petrol-mist: "#173842"
  dark-on-accent: "#0b120e"
  dark-positive: "#4fb89a"
  dark-amber: "#d9a94f"
  dark-negative: "#e08469"
  dark-wall-ink: "#3a4a42"
  dark-wall-dim: "#1f2a24"
typography:
  display:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(2.3rem, 1.3rem + 3.6vw, 3.9rem)"
    fontWeight: 700
    lineHeight: 1.03
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.9rem, 1.2rem + 2.4vw, 3.1rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
    letterSpacing: "-0.01em"
  figure:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.5rem, 1rem + 1.6vw, 2.3rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  lead:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "1.1rem"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum"
  label:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.9rem"
    fontWeight: 600
    lineHeight: 1.4
  note:
    fontFamily: "Manrope, system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "0.84rem"
    fontWeight: 400
    lineHeight: 1.5
  statement:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "30px"
rounded:
  control: "10px"
  card: "12px"
  sheet: "24px"
  pill: "99px"
spacing:
  hair: "4px"
  tight: "8px"
  row: "16px"
  block: "28px"
  group: "56px"
  gutter: "clamp(16px, 5vw, 72px)"
  section: "clamp(80px, 11vw, 152px)"
components:
  button-primary:
    backgroundColor: "{colors.petrol}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.petrol-deep}"
    textColor: "{colors.on-accent}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.petrol}"
    rounded: "{rounded.control}"
    padding: "9px 16px"
  nav-cta:
    backgroundColor: "{colors.petrol}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "40px"
  input-email:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "52px"
  chip:
    backgroundColor: "{colors.petrol-mist}"
    textColor: "{colors.petrol-deep}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "clamp(28px, 4vw, 52px) clamp(20px, 4.5vw, 60px)"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px 20px"
  card-sunken:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "22px"
  ranking-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "44px"
  ranking-row-active:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.ink}"
  plan-band-needs:
    backgroundColor: "{colors.petrol}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.card}"
    padding: "18px 20px"
  plan-band-wants:
    backgroundColor: "{colors.wants-band}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.card}"
    padding: "18px 20px"
  plan-band-save:
    backgroundColor: "{colors.save-band}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.card}"
    padding: "18px 20px"
  chat-bubble:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    padding: "12px 16px"
  chat-bubble-me:
    backgroundColor: "{colors.petrol}"
    textColor: "{colors.on-accent}"
    padding: "12px 16px"
---

# Design System: Flownd Web

## Overview

**Creative North Star: "The Statement, Put in Order"**

The web surface is not a marketing skin over the app; it is the app's own world shown at page scale. A cool near-white canvas, white working surfaces, one deep ink, and a single petrol accent carry everything. The defining move is a contrast of registers: raw bank-statement text, set in pale uppercase monospace, sits behind and around the product, and clear Manrope figures, bars, and rankings resolve it. Disorder lives in the mono register; clarity lives in everything else.

Density is calm and numeric. Figures use tabular numerals, bars are thin rounded tracks, rows are separated by hairlines rather than boxes, and the page is mostly flat. Exactly one object lifts off the page with a real shadow: the sheet that holds the resolution (the hero card, the confirm card). Colour beyond petrol is semantic and earned: green for money saved and goals, amber for Desideri and overspend, rust for errors.

Dark mode follows the app's dark palette through `prefers-color-scheme`, swapping the custom-property set while keeping every role identical. The logo lockup swaps between its light and dark raster; the brand's blue-to-mint gradient appears only inside that mark.

**Key Characteristics:**
- One family (Manrope 400 to 700) for all reading text; JetBrains Mono only for raw statement strings.
- One petrol accent for action, selection, and the active data mark.
- Flat by default: hairline borders (1px) and sunken fills build structure; one ambient shadow lifts the resolving sheet.
- Radii locked to the app: 10 / 12 / 24, plus full pills for chips and tracks.
- Tabular numerals everywhere money appears.
- Light and dark are the same system with swapped values, never a separate design.

## Colors

A cool, green-tinted neutral field with one deep petrol voice and a small semantic set for money states.

### Primary
- **Deep Petrol** (petrol): primary buttons, the nav call to action, links, focus rings, input focus border, the ranking bars, budget tracks within limit, the user's chat bubble, outlined proposal card border, and the line icons heading each source. In dark mode it becomes **Glacier Petrol** (dark-petrol).
- **Petrol Depth** (petrol-deep): hover state of every petrol fill; chip text in light mode.
- **Petrol Mist** (petrol-mist): chip fill, text selection, and the 3px focus halo around inputs.

### Secondary
- **Ledger Green** (positive): gains and saving: goal progress fills, goal increments, the end-of-cycle projection figure, the goal flow spine (at 45% opacity).
- **Savings Green** (save-band): solid fill behind white text for the Risparmio band and the monthly savings source tile. Darker than Ledger Green so white text clears 4.5:1.

### Tertiary
- **Desideri Amber** (wants-band): solid fill behind white text for the Desideri band.
- **Overspend Amber** (amber-fill): the app's warning hue, used only as a non-text fill (an over-limit budget track).
- **Amber Ink** (amber-text): warning copy on light surfaces (overspend notes). 5.3:1 on white; it shares its value with Desideri Amber.
- **Rust** (negative): invalid input border and error copy.

### Neutral
- **Mist Canvas** (canvas): page background.
- **Paper White** (surface): hero band, sheets, cards, inputs, the nav bar backing.
- **Sunken Sage** (sunken): inset panels (projection, chat well), bar tracks, hovered or active ranking row, file-name tokens.
- **Deep Ink** (ink): all primary text; also the background of the privacy band in light mode.
- **Slate Sage** (ink-secondary): supporting copy, metadata, nav links at rest, footer.
- **Placeholder Sage** (placeholder): input placeholder text.
- **Hairline** (hairline): every border and row divider.
- **Wall Ink / Wall Dim** (wall-ink, wall-dim): the statement wall's resting text and its dimmed state when a category is focused.
- **Trust Ink** (trust-ink, trust-ink-secondary): text on the privacy band; its icons use Glacier Petrol in both modes.

### Intentional departures from the app tokens
The web inherits `apps/mobile/src/constants/flownd-theme.tsx` value for value except where text contrast on the web demanded a change:
- Desideri band is Desideri Amber, darkened from the app warning `#B98A2E` so white text reaches 4.5:1. The app warning value survives on the web only as Overspend Amber, a non-text fill.
- Warning copy uses Amber Ink (`#8a6516`) instead of the app warning hue, raising white-surface contrast from 3.1:1 to 5.3:1 for its small 0.86rem notes.
- Rust is darker than the app's light `negative` (`#C3573F`) for legible error text.
- The Risparmio band uses Savings Green rather than the app positive; an earlier fixed band colour `#357d8f` was removed so petrol remains the only blue-green in the band row.
- Petrol Depth (hover) and the wall pair have no app equivalent; they are web-only additions.
- In dark mode, on-accent becomes dark-on-accent (deep ink on Glacier Petrol) instead of the app's white, because white on `#47b3d1` fails contrast.

### Named Rules
**The One Petrol Rule.** Petrol is the only accent. It marks what you can press, what is selected, and the data mark currently in focus. Every other hue on the page must mean a money state.

**The Earned Contrast Rule.** A web colour may leave the app token only to clear contrast (4.5:1 for text). Any departure is recorded here with its reason.

**The Mark-Only Gradient Rule.** The brand's blue-to-mint gradient lives inside the logo lockup raster and nowhere else: no gradient fills, text, or borders.

## Typography

**Display Font:** Manrope (with system-ui, -apple-system, Segoe UI, sans-serif)
**Body Font:** Manrope (same stack)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace), statement register only

**Character:** A friendly, geometric grotesk set tight and bold for headings and figures, relaxed for reading; the mono is a quoted material, the bank's own voice, never the brand's.

### Hierarchy
- **Display** (700, clamp 2.3rem to 3.9rem, 1.03, -0.03em, balanced wrap): one per page; the hero question or the confirm-page heading (which steps down to clamp 2rem to 2.6rem).
- **Headline** (700, clamp 1.9rem to 3.1rem, 1.08, -0.03em, balanced wrap): section headings, often capped at 14 to 18ch.
- **Title** (700, 1.05rem, -0.01em): card and row headings; source headings step up to 1.3rem, privacy items to 1.15rem.
- **Figure** (700, clamp 1.5rem to 2.3rem, 1.1, -0.02em): money values in bands and tiles; the projection figure scales to clamp 2.4rem to 3.4rem at line-height 1.
- **Lead** (400, 1.1rem, 1.55): section intros at 62ch max; hero lead clamps 1.02rem to 1.18rem at 54ch.
- **Body** (400, 17px; 16px under 640px, 1.55, tabular numerals, pretty wrap).
- **Label** (600, 0.88rem to 0.95rem): ranking labels, chip text, band labels, form label (700).
- **Note** (400, 0.82rem to 0.86rem, Slate Sage): sample-data notes, form helper text, ranking footnote.
- **Statement** (JetBrains Mono 400, 14px on 30px rows; 12px on 26px under 640px, uppercase source strings): the statement wall, file names, merchant strings quoted inline at 0.86em.

### Named Rules
**The One Family Rule.** Manrope sets every reading word and every figure, weights 400 to 700 only. Hierarchy comes from size, weight, and tracking, not from a second display face.

**The Statement Register Rule.** JetBrains Mono appears only where the text is literally what a bank or file produced: uppercase descriptors, dates, raw amounts, file names. Never for headings, UI labels, or Flownd's own figures.

**The Tabular Money Rule.** Any element showing amounts uses tabular numerals so columns of euros align.

## Layout

Content sits in a centred column of up to 1200px, inset by a fluid gutter (clamp 16px to 72px). Sections open with a fluid top pad (clamp 80px to 152px) and no bottom pad, so rhythm is set by headings rather than boxes. Section intros cap at 760px (880px for wide ones); reading lines cap at 48ch to 62ch.

The hero is a full-bleed white band, at most viewport height minus the nav (capped at 980px), with the statement wall filling it behind a centred sheet up to 840px wide. Feature sections alternate two-column grids (1fr/1fr, 1fr/1.15fr, 1.1fr/1fr, 1.6fr/1fr) with fluid gaps (clamp 28px to 96px); the closing block narrows to 640px and centres.

Rhythm values recur: 8px between paired controls, 16px between row items, 28px between blocks inside the sheet, 56px before a list following an intro. Lists use top and bottom hairlines with 16px to 32px vertical padding instead of cards.

Responsive: at 1100px the wall drops to two columns; at 960px the section nav hides and all two-column grids stack (the coach copy moves above its chat); at 640px body drops to 16px, the wall goes to one column, hero text left-aligns, the email form stacks with a full-width button, the plan band stacks vertically, and ranking and budget rows put their track on a second line.

## Elevation & Depth

Flat by default. Structure comes from 1px hairlines, the white-on-mist surface step, and sunken sage insets. Real shadow is reserved for the sheet that resolves the page's disorder; a second, smaller shadow marks the coach's actionable proposal. The nav bar is a 92% opaque white backing with a light backdrop blur for legibility over scrolled content; it is the only translucent surface. While it floats over the hero it carries a soft offset shadow that fades to nothing as it docks.

### Shadow Vocabulary
- **Resolving Sheet** (`box-shadow: 0 1px 2px rgba(22, 33, 29, 0.06), 0 24px 64px -12px rgba(22, 33, 29, 0.16)`; dark: `0 1px 2px rgba(0,0,0,0.3), 0 24px 64px -12px rgba(0,0,0,0.55)`): the hero card and the confirm card only.
- **Proposal Lift** (`box-shadow: 0 8px 24px -10px rgba(22, 33, 29, 0.25)`): an inline card the user must confirm or edit.

### Named Rules
**The One Lift Rule.** Per view, only one sheet carries the large ambient shadow, and it is the one that holds the answer. Everything else stays on the page plane.

## Shapes

Corners come straight from the app: controls 10px (buttons, inputs, ranking rows, keys), cards 12px (source panels, goals, band segments, projection, proposal), sheets 24px (hero card, plan panel, chat well, confirm card). Fully rounded pills (99px) are for chips, the "In arrivo" badge, and every progress track and bar, whose fills inherit the track radius. Chat bubbles use 18px with one 6px corner pointing to the speaker. Borders are always 1px hairline; the only accent-coloured border is the proposal card's. File-name tokens use a small 8px inset.

**The 10/12/24 Rule.** New elements take one of the three app radii by role (control, card, sheet) or a full pill; no other radius values.

## Components

### Buttons
Solid, compact, unmistakably the one thing to press.
- **Shape:** gently rounded (10px).
- **Primary:** petrol fill, white text, weight 700, 52px tall with 24px side padding in forms; 40px tall, 16px padding in the nav.
- **Hover / Focus:** fill deepens to Petrol Depth over 160ms; pressed nudges down 1px; disabled drops to 70% opacity with a progress cursor. Focus everywhere is a 2px petrol outline at 3px offset.
- **Ghost:** transparent with petrol text and an inset 1px hairline ring, used beside a primary (Modifica / Conferma).
- **Nav CTA:** hidden (faded, 4px up, untabbable) while the hero form is on screen, so each viewport shows one primary action.

### Chips
- **Style:** Petrol Mist fill, Petrol Depth text (petrol in dark), 600 weight, full pill, optional 16px leading line icon.
- **State:** static labels (account, category); no selectable chip variant exists yet.

### Cards / Containers
- **Corner Style:** 12px cards, 24px sheets.
- **Background:** Paper White on the mist canvas, or Sunken Sage for insets inside a white sheet.
- **Shadow Strategy:** none, except the Resolving Sheet and Proposal Lift (see Elevation & Depth).
- **Border:** 1px hairline on white cards; sunken insets carry no border.
- **Internal Padding:** 18px to 22px for cards; fluid (clamp 20px to 60px) for sheets.

### Inputs / Fields
- **Style:** white field, 1px hairline, 10px radius, 52px tall, 16px side padding, petrol caret, label above in 700.
- **Focus:** border turns petrol with a 3px Petrol Mist halo; no outline.
- **Error / Disabled:** invalid border turns Rust and the helper line below becomes Rust at 600 weight; helper text otherwise sits in Note style.

### Navigation
Docking top bar, fixed over the page. At the top of the page it floats: 16px from the top edge, max 1120px wide (viewport minus 32px on small screens), 16px radius, full hairline border and soft shadow. Over the first 140px of scroll a single progress value (`--dock`, 0 → 1, updated once per frame) widens it to the full viewport, removes the top offset, radius, side borders and shadow, and leaves a 1px hairline beneath: docked at the top. Contents: logo lockup (128px) left, section links in Slate Sage at 0.94rem/500 that darken to ink on hover, the Nav CTA right, which stays hidden while the hero form is on screen. Links hide under 960px, leaving logo and CTA.

### Progress Tracks
Thin full-pill rails in Sunken Sage (8px budgets, 10px goals, 12px ranking) with a fill that scales from the left: petrol for spending within limit, Overspend Amber when over, Ledger Green for goals. Inside coloured band segments the track is 4px white at 28% with a white fill.

### Plan Band
A horizontal row of three solid segments (petrol, Desideri Amber, Savings Green) whose widths follow their share, 4px apart, 12px radius, white label, figure, and usage line. Stacks vertically under 640px.

### Statement Wall and Ranking (signature)
The hero's background is a wall of real-looking statement rows in the Statement register (pale Wall Ink, three columns, fading in over the top 140px under the floating bar and out over the bottom 96px). Each column drifts slowly downward, like a statement receiving new rows: a track holding the statement three times moves by one third over 140–170s per column, so the loop closes without a jump; it pauses when the hero leaves the screen. On load it settles from Slate Sage to Wall Ink over 1600ms while the ranking bars grow from 4% over 1100ms with a 90ms stagger. Hovering, focusing, or tapping a ranking row gives it a Sunken Sage background and lights every wall row of that category in petrol while the rest dim to Wall Dim (280ms). This link between raw rows and the ordered total is the system's signature; reuse it wherever a summary is derived from visible raw data. Reduced motion removes the drift, the animations and the transitions.

Below the hero, content enters as it reaches 88% of the viewport height (checked once per frame on scroll, so fast jumps still reveal). Text blocks rise 28px from a 6px blur over 700–900ms; lists and source rows slide in from the left one at a time (120ms stagger); the goal cards rise in sequence; the Coach conversation writes itself in order (question, answer 600ms later, request at 1300ms, proposal at 1900ms); progress bars fill from 2% over 1200ms when their panel arrives. Hidden starting states exist only after the script marks the page ready, so without JavaScript or with reduced motion everything is visible.

### Chat
A Sunken Sage well (24px radius) holding white bubbles from the coach and petrol bubbles from the user, each 18px with a 6px speaker corner, max 86% wide.

## Do's and Don'ts

### Do:
- **Do** take every colour, radius, and type role from the app theme first, and record any web departure with its contrast reason.
- **Do** use petrol for exactly one primary action per viewport; hide competing CTAs while another is visible.
- **Do** separate list rows with 1px hairlines and generous vertical padding instead of boxing each row.
- **Do** set every amount in tabular numerals, and mark sample figures with a small Note-style disclaimer.
- **Do** keep the app's `#B98A2E` amber for non-text fills only; warning text needs a darker amber that clears 4.5:1 on white.
- **Do** ship light and dark together by swapping the custom-property set under `prefers-color-scheme`, and swap the logo raster with it.
- **Do** honour reduced motion by disabling the wall drift and settle, bar growth, scroll entrances and row transitions.

### Don't:
- **Don't** introduce a second accent hue or use petrol as decoration on non-interactive surfaces beyond the feature line icons.
- **Don't** use the brand gradient outside the logo lockup.
- **Don't** use JetBrains Mono for headings, labels, buttons, or Flownd's own figures.
- **Don't** add frosted or translucent cards and panels; translucency stays limited to the nav bar backing.
- **Don't** put more than one large ambient shadow in a view, and don't use hard offset shadows.
- **Don't** set eyebrow or kicker labels above headings; headings stand alone.
- **Don't** place white text on Overspend Amber, Ledger Green, or Glacier Petrol; use the darkened band colours or dark-on-accent instead.
- **Don't** use radii outside 10 / 12 / 24 and the full pill.
