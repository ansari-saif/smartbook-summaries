---
version: 1
slug: "src-pages-summary-tsx"
primary_target: "src/pages/Summary.tsx"
related_targets: ["src/pages/Index.tsx"]
---

## Scope

Whole app: the shelf and binding form at `/` (Operate) and the chapter reader at `/summary` (Read, primary). One reader, phone and desk, often low light.

## Direction contract

THESIS: Every book is a library rebind. The app is the bindery and the shelf: each title gets its own buckram cloth and gold-foil spine, and reading happens inside that binding. Refuses the category default of dark slate, purple-blue gradients, glass cards, and "AI-generated" labels.

OWN-WORLD: Buckram cloth fields with a fine weave own whole regions: library green for the app, and a per-book cloth (madder, bottle green, Oxford blue, plum, umber, teal slate) for each title. Flat gold foil for stamped titles and the primary action, set in tracked Jost caps. A two-colour headband stripe is the progress rule. A ribbon marks the reading place. The page inside is a deep, cloth-tinted dark ground with warm-white Literata.

STORY: The reader sees their shelf, knows which book they are in the middle of from its ribbon, opens it, and lands where they stopped. Binding a new book is a short, honest workshop form below the shelf.

FIRST VIEWPORT: Home: foil SMARTBOOK masthead on green cloth, the tagline, then the shelf of upright spines (a stack of flat spines on phones), with "Bind a new book" starting below. Reader: thin top bar (back to shelf, foil title, Focus, Download), headband progress stripe, contents rail left (strip on phones), and a 66ch Literata column on the dark page with next-chapter wayfinding at its end.

FORM: Bookbinder's buckram and foil stamping, candidate 6 of 7 on the grounded list. seed:d7c1e2c10f0e5a81. Raises: from the cutting-bench rail, state is a mark, not a hue (the ribbon marks where you stopped, stored and re-shown on return). From the WPA park poster, colour commits as unbroken fields (cloth owns whole regions, never accents on a neutral ground). From the ice press, the reading measure holds fixed while margins give.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction

The headband stripe at the top of the reader fills as you read the chapter; the ribbon on the shelf spine shows the chapter you stopped in, and opening the book restores chapter and scroll position.

## Constraints

- Keep the upload function: PDF, book name, start/end page, exact chapter titles.
- Keep mobile behaviour: no horizontal overflow at 390px, 44px touch targets, 16px inputs.
- No invented claims, covers, or stats.
