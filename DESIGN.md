---
name: Smartbook
description: Your books, rebound in buckram and gold foil, rewritten chapter by chapter.
colors:
  library: "#0B0B0C"
  library-deep: "#1A1A1C"
  foil: "#D8B45C"
  foil-bright: "#EDD08A"
  foil-deep: "#A9873A"
  foil-ink: "#1B1A14"
  paper: "#ECE6D9"
  paper-muted: "#B8B1A2"
  ribbon: "#B0322E"
  error-rose: "#F0A39A"
  cloth-madder: "#7A2E2A"
  band-madder: "#3B1513"
  cloth-bottle: "#1F4A3A"
  band-bottle: "#0E241B"
  cloth-oxford: "#26365E"
  band-oxford: "#111A30"
  cloth-plum: "#4E2A45"
  band-plum: "#26121F"
  cloth-umber: "#5A3A22"
  band-umber: "#2B1A0E"
  cloth-slate: "#24555A"
  band-slate: "#10292C"
  band-library: "#050505"
typography:
  display:
    fontFamily: "Jost, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3.75rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.22em"
  headline:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Jost, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.16em"
  subhead:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  body-ui:
    fontFamily: "Jost, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Jost, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.14em"
  button:
    fontFamily: "Jost, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: "0.14em"
rounded:
  hairline: "2px"
  sm: "3px"
  md: "4px"
  page: "6px"
  pill: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  gutter-phone: "20px"
  gutter: "32px"
  section: "64px"
  section-lg: "96px"
  touch: "44px"
  field: "48px"
components:
  button-foil-plate:
    backgroundColor: "{colors.foil}"
    textColor: "{colors.foil-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 40px"
    height: "48px"
  button-foil-plate-hover:
    backgroundColor: "{colors.foil-bright}"
    textColor: "{colors.foil-ink}"
  button-foil-plate-disabled:
    backgroundColor: "rgba(216, 180, 92, 0.4)"
    textColor: "rgba(27, 26, 20, 0.7)"
  button-foil-line:
    backgroundColor: "transparent"
    textColor: "{colors.foil}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-foil-line-hover:
    backgroundColor: "rgba(0, 0, 0, 0.2)"
    textColor: "{colors.foil}"
  field:
    backgroundColor: "rgba(0, 0, 0, 0.3)"
    textColor: "{colors.paper}"
    typography: "{typography.body-ui}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "48px"
  spine-upright:
    backgroundColor: "{colors.cloth-oxford}"
    textColor: "{colors.foil}"
    rounded: "{rounded.sm}"
    width: "84px"
    height: "300px"
  spine-flat:
    backgroundColor: "{colors.cloth-oxford}"
    textColor: "{colors.foil}"
    rounded: "{rounded.hairline}"
    height: "64px"
  ribbon:
    backgroundColor: "{colors.ribbon}"
    textColor: "{colors.paper}"
    width: "20px"
    height: "40px"
  contents-item:
    backgroundColor: "transparent"
    textColor: "{colors.paper-muted}"
    rounded: "{rounded.sm}"
    padding: "10px 12px 10px 32px"
    height: "44px"
  contents-item-active:
    textColor: "{colors.foil}"
  wayfinding-next:
    backgroundColor: "rgba(0, 0, 0, 0.25)"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "56px"
  wayfinding-next-hover:
    backgroundColor: "rgba(0, 0, 0, 0.4)"
  workshop-panel:
    backgroundColor: "rgba(0, 0, 0, 0.25)"
    rounded: "{rounded.md}"
    padding: "32px"
---

# Design System: Smartbook

## Overview

**Creative North Star: "The Library Rebind"**

Every book is a library rebind. The app is both bindery and shelf: each title gets its own buckram cloth and gold-foil spine, and reading happens inside that binding. Cloth with a fine woven tile owns whole regions of the screen: near-black for the app itself, and one of six per-book cloths for each title. Titles, actions and section marks are stamped in flat gold foil, set in widely tracked Jost capitals. The reading page is a pure black ground carrying warm-white Literata at a fixed 66ch measure.

The system is dark, quiet and material. Depth comes from cloth against page tone and from soft, low drop shadows, never from glass, blur or gradients across surfaces. State is expressed as a physical mark rather than a hue change: a red silk ribbon marks where the reader stopped, and a two-colour headband stripe is the progress rule. Density is low on the reader and moderate on the binding form; touch targets never drop below 44px.

The world rejects the category default for AI reading tools: dark slate, purple-blue gradients, glass cards, and "AI-generated" labels.

**Key Characteristics:**
- Buckram cloth fields (raster weave tile, soft-light blend over a flat colour) own whole regions.
- Six per-book cloths, each with its own dark band colour, assigned deterministically from the book's name.
- Flat gold foil for stamped titles, the primary action, rules and focus.
- Two hands: tracked Jost caps for anything stamped or operated, Literata for anything read.
- Ribbon marks the reading place; headband stripe shows progress and waiting.
- Fixed 66ch reading measure; margins give, the measure holds.

## Colors

A near-black and book-cloth palette, stamped in gold, with one red silk mark.

### Primary
- **Library Black** (library): the app's own ground. Fills the home screen, the reader frame, the 404, and the theme-color; it is the default `--cloth`.
- **Library Shadow** (library-deep): the shelf plank under upright spines.

### Secondary
- **Gold Foil** (foil): stamped titles, the masthead, section labels, list markers, icon strokes in actions, the foil-plate button fill, and field focus borders. Used at reduced opacity (20–60%) for blind-stamped rules and outlines.
- **Bright Foil** (foil-bright): hover fill for the foil plate and the global focus outline.
- **Deep Foil** (foil-deep): reserved shade of the foil family for darker gilt; not a surface colour.
- **Foil Ink** (foil-ink): text on a foil plate and text on a selection highlight.

### Tertiary
- **Silk Ribbon** (ribbon): the reading-place marker only, on spines and in the contents rail. A reddish thread of the same family runs through the headband stripe.
- **Error Rose** (error-rose): inline validation and failure messages, always as text on the dark ground.

### Book Cloths
Each book is bound in one cloth, chosen by hashing the title, and carries a matching band colour; cloths appear only on the shelf spines: **Madder** (cloth-madder / band-madder), **Bottle Green** (cloth-bottle / band-bottle), **Oxford Blue** (cloth-oxford / band-oxford), **Plum** (cloth-plum / band-plum), **Umber** (cloth-umber / band-umber), **Teal Slate** (cloth-slate / band-slate). The app's own pairing is Library Black with **Library Band** (band-library). A cloth and its band are always set together through the `--cloth` and `--band` custom properties. The reading page is pure black.

### Neutral
- **Warm Paper** (paper): primary text on cloth and on the page; reading text runs at 90% opacity.
- **Faded Paper** (paper-muted): secondary text, placeholders, chapter counts, idle contents entries, the tagline.
- **Shadow washes** (black at 20–50%): the only "surface" tints. Fields at 30%, the workshop panel and next-chapter control at 25%, hover at 20–40%, the progress track at 30%.

### Named Rules
**The Cloth Owns the Field Rule.** Colour commits as unbroken cloth across whole regions: the screen, a spine, the reader frame. Never place cloth colours as accents on a neutral ground, and never introduce a light surface.

**The Stamped Gold Rule.** Gold is foil: it appears as stamped type, hairline rules, outlines, icon strokes, and the single foil-plate fill per form. It is never a background wash or a gradient.

**The Ribbon Is a Mark Rule.** Ribbon red marks the reading place and nothing else. Errors use Error Rose text; buttons and links never turn red.

## Typography

**Display Font:** Jost (with ui-sans-serif, system-ui)
**Body Font:** Literata (with Georgia), optical sizes 7–72
**Label Font:** Jost, uppercase and tracked

**Character:** Jost in spaced capitals reads as tooling stamped into cloth; Literata is a calm, screen-tuned book face for long reading in low light. The pairing separates what you operate from what you read.

### Hierarchy
- **Display** (Jost 500, 2.25rem → 3.75rem at md, line-height 1, 0.22em tracking, uppercase, foil): the SMARTBOOK masthead only.
- **Headline** (Literata 600, 1.75rem on phones → 2.25rem from sm, line-height 1.25, balanced wrap, paper): the chapter title at the head of the reading column.
- **Title** (Jost 500, 1.25rem, 0.16em tracking, uppercase, foil): stamped section titles such as "Bind a new book", "Not on the shelf", and the book title in the reader bar (0.875–1rem there).
- **Subhead** (Literata 600, 1.25rem, line-height 1.375, paper): headings inside a chapter rewrite.
- **Body** (Literata 400, 1.0625rem on phones → 1.125rem from sm, line-height 1.75, paper at 90%): chapter text, max 66ch. Lists use foil markers at 80%. Bold runs go full paper at 600.
- **Body UI** (Jost 400, 1rem): field text and file names; inputs never go below 16px.
- **Label** (Jost 500, 0.75rem, 0.14em tracking, uppercase, foil at 90%): field labels, section labels ("Your shelf", "Contents"), the in-chapter "Summary" mark, and the small caption naming a wayfinding button's direction (11px there).
- **Button** (Jost 600, 0.875rem, 0.14em tracking, uppercase): the foil plate.

### Named Rules
**The Two Hands Rule.** Jost caps are the binder's stamp: titles, labels, controls, counts. Literata is the reader's page: chapter text, subheads, the tagline, empty-state and explanatory sentences. Never set reading text in Jost or a control in Literata.

**The Fixed Measure Rule.** The reading column is 66ch at every width; only its side padding (20px phone, 32px from sm) and top spacing change.

## Layout

Two screens, one frame each. Home is a single centred column (max 64rem, gutters 20px → 32px) on full-bleed near-black: masthead, then the shelf, then the binding workshop panel, separated by 48–96px. The binding form is one column on phones and a two-column grid from md (40px column gap, 28px row gap), with the PDF drop zone spanning two rows.

The reader is a fixed-height app frame on the book's own cloth: a thin top bar (56px phone, 64px from sm), the 6px headband progress strip, then a contents rail (288px at md, 320px at lg) beside the page ground, which scrolls independently. Below md the rail becomes a horizontally scrolling strip of chapter chips that fades out at its right edge and auto-centres the active chapter. Focus mode removes the bar and the rail, leaving progress and the page with a single floating "Leave focus" control; Escape also leaves.

The shelf changes posture with the viewport: upright spines on a plank from md (84px wide, 300–355px tall by title, 8px apart), flat stacked spines lying on top of each other on phones, each nudged a few pixels sideways so the stack reads as handled books. Breakpoints are Tailwind defaults (sm 640, md 768, lg 1024); nothing overflows horizontally at 390px.

## Elevation & Depth

Depth is material and tonal. The cloth is the ground; the page is the same cloth sunk into shadow; panels and fields are black washes on the cloth. Shadows are soft, low and pulled in with large negative spread, as if lit from above in a dim room. There is no blur, glass, or floating card layer.

### Shadow Vocabulary
- **Plate** (`0 6px 14px -8px rgb(0 0 0 / 0.7)`): under the foil-plate button; removed when disabled.
- **Upright spine** (`0 10px 18px -10px rgb(0 0 0 / 0.9)`): a standing book.
- **Flat spine** (`0 6px 12px -8px rgb(0 0 0 / 0.8)`): a book lying in the phone stack.
- **Plank** (`0 14px 24px -12px rgb(0 0 0 / 0.9), inset 0 1px 0 rgb(255 255 255 / 0.06)`): the shelf board.
- **Ribbon** (`0 4px 8px -4px rgb(0 0 0 / 0.6)`): the silk marker hanging off a spine.
- **Page edge** (`inset 0 1px 0 rgb(255 255 255 / 0.04), -12px 0 24px -18px rgb(0 0 0 / 0.8)`): the reading page set into the binding at md and up.
- **Panel lip** (`inset 0 1px 0 rgb(255 255 255 / 0.05)`): top highlight on the workshop panel.

### Named Rules
**The Dim Bindery Rule.** Shadows only fall downward or inward, soft and tight to the object. Depth otherwise comes from cloth versus page tone and black washes, never from blur or translucent glass.

## Shapes

Corners are nearly square, like board and cloth: 2px on flat spines and the plank, 3px on buttons, fields, spine heads and contents entries, 4px on the workshop panel, 6px on the top-left corner of the reading page where it sits into the binding. Headband strips used as ornaments, loaders and the summary mark are full pills. The ribbon is a swallowtail: a rectangle with a V notch cut from its foot (`polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%)`). Upright spines carry paired foil hairlines (40px wide) above and below the title, which runs vertically. Dividers are single foil hairlines at 20% opacity.

## Components

### Buttons
Stamped and tactile.
- **Shape:** gently squared (3px).
- **Foil plate (primary):** flat gold fill, foil-ink caps, 48px tall, full width on phones and 40px side padding from sm, with the Plate shadow. One per form or screen.
- **Hover / Active / Focus:** hover brightens to Bright Foil over 200ms; pressing sinks it 1px; focus is the global 2px Bright Foil outline at a 3px offset. Disabled drops to 40% foil with no shadow.
- **Foil line (secondary):** transparent with a 40% foil hairline border and foil label caps, 44px tall; hover firms the border to full foil and lays a 20% black wash. In the reader bar on phones it collapses to a 44px icon-only square with no border.
- **Quiet icon button:** 48px (44px from sm) square, faded paper icon, black wash on hover; used to remove a chapter row.

### Inputs / Fields
- **Style:** 48px (44px from sm) tall, 30% black wash, 25% foil hairline, 3px corners, 16px Jost text in paper, faded-paper placeholders. Numeric fields use tabular figures.
- **Focus:** the border goes to full foil; no glow.
- **Error:** an Error Rose sentence below the field, announced as an alert.
- **Drop zone:** a 1.5px dashed foil border (35%, 70% on hover or when filled, full foil plus 10% foil wash while dragging) around a foil upload icon and the file name.

### Workshop Panel
- **Corner Style:** 4px.
- **Background:** 25% black wash on the cloth with the Panel lip highlight.
- **Internal Padding:** 20px on phones, 32px from sm. Holds the one binding form; it is the only panel in the system.

### Navigation
- **Reader bar:** back-to-shelf link (faded paper caps, brightening on hover), centred foil book title (two lines on phones, one from sm), Focus and PDF foil-line buttons.
- **Contents rail:** label "Contents", numbered entries in Jost 14px. Idle entries are faded paper with a black wash on hover; the active entry turns foil and carries a small ribbon hanging into its left margin. On phones it becomes a horizontal chip strip.
- **Chapter wayfinding:** after the chapter, a foil hairline then Previous (plain) and Next chapter (25% black wash, 40% on hover) controls, at least 56px tall, each with a tracked caption above the chapter name and a foil arrow. On the last chapter, Next becomes "Back to the shelf".

### Spine (signature)
A book on the shelf, bound in its cloth with the buckram tile. Upright: headband across the head, paired foil hairlines, vertical foil title, chapter count at the foot; lifts 8px on hover over 300ms (hover-capable devices only). Flat: headband and a foil hairline along the left edge, the title in foil caps, chapter count right; nudges 4px right when pressed. A stored reading place hangs a ribbon off the spine showing the chapter number.

### Headband
A silk headband stripe: alternating foil and madder threads over the cloth's band colour, with a soft top-lit sheen. It is the reader's progress bar (a 25% full-width track plus a full-strength fill that follows scroll), the loading and processing indicator (threads run sideways continuously), and the ornament above the masthead, the 404 title and each chapter's Summary mark.

### Motion
Easing is out-expo (`cubic-bezier(0.16, 1, 0.3, 1)`). Each chapter enters with a 450ms rise of 10px and fade; spines lift over 300ms; colour changes take 200ms; the progress fill tracks scroll over 100ms. Under reduced motion the chapter entrance and running headband stop.

## Do's and Don'ts

### Do:
- **Do** bind every book in exactly one of the six cloths, chosen from its title, and set its `--cloth` and `--band` together on the book's root.
- **Do** lay the buckram tile (128px, soft-light blend) over any cloth region, including spines and the reader frame.
- **Do** keep reading text in Literata at 66ch, line-height 1.75, paper at 90% on the cloth-tinted page ground.
- **Do** use tracked Jost caps (0.14–0.22em) in foil for titles, labels and controls.
- **Do** show reading place with the ribbon and progress or waiting with the headband stripe.
- **Do** keep every touch target at least 44px and every input at 16px or larger.

### Don't:
- **Don't** use dark slate, purple-blue gradients, or glass cards; the only gradients in the system are the headband's threads and sheen.
- **Don't** introduce light or white surfaces; the page is always the cloth in shadow.
- **Don't** use ribbon red for errors, buttons, or decoration.
- **Don't** fill large areas with gold or use more than one foil plate in a view.
- **Don't** add "AI-generated" labels, invented covers, stats, or badges to books.
- **Don't** let the reading measure grow with the viewport; widen the margins instead.
