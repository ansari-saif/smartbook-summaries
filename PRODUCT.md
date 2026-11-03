# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferred (not confirmed): Saif, reading his own books. One person, no accounts, no sharing flow. He uploads a book once at a desk, then returns many times to read chapter rewrites, often on a phone.

## Product Purpose

Smartbook turns a book PDF into a plain-English rewrite of each chapter plus a short summary, so the reader gets the ideas of a long book in a fraction of the time without losing its meaning. Success: a chapter is finished in one sitting and remembered.

## Positioning

The book is rewritten chapter by chapter from its own text, in the reader's chosen page range and chapter breaks. It is not a generic web summary of a famous title; it is this copy, cut down.

## Operating Context

- Ingest is occasional and slow: pick a PDF, enter page range and exact chapter titles as they appear in the PDF, then wait minutes while each chapter is rewritten.
- Reading is frequent: open a book, move between chapters, keep the reading place, optionally go full screen, download a chapter PDF.
- Served at https://book.ansarisaif.com.

## Capabilities and Constraints

- Routes: `/` (upload + library), `/summary?book=` (reader).
- API: list books, process PDF, book details, chapter PDF. No delete endpoint; "Remove" only hides a book in the current view.
- Chapter matching is exact string match against PDF text.
- Model output is loose markdown (headings, bold, bullets, numbered lists, a trailing "Summary:" block).
- Undecided: whether others will ever use it.

## Brand Commitments

Inferred: name "Smartbook". Existing lines "Refine Your Books with AI", "Keep the meaning, cut the fluff!", and page title "Read books 900% faster" are not confirmed as binding.

## Evidence on Hand

One real processed book in production ("7 habits of highly effective people", 2 chapters). No covers, testimonials, or usage data; do not invent any.

## Product Principles

1. Reading comes first; the reader is the product, upload is a tool.
2. The book's ideas stay intact; the interface never adds noise the rewrite removed.
3. Keep the place: a returning reader lands where they left off.
4. Honest about the wait: processing is slow and the UI says so plainly.
