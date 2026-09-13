# Quality gate audit

Checked on 13 September 2026 against the build in `docs/`. Each gate lists how it was checked and what was found. Where a check could not be run here, that is stated rather than assumed.

Re-run the automatic checks at any time:

```
npm test
node build/assemble.mjs
node build/audit.mjs
```

`node build/audit.mjs` rewrites `handover/audit-checks.md` with the full line-by-line results.

## Summary

| Gate | Result |
|---|---|
| Tax engine tests (at least 25, including HMRC examples and per-year regression) | Pass: 40 of 40 |
| No raw colours, fonts or lengths outside `tokens.css` | Pass |
| Flexbox only, no Grid | Pass: Grid used 0 times |
| One section and one wrapper per block, every section named | Pass |
| One class per element, no utility classes | Pass |
| No frameworks, no runtime dependencies, no third-party scripts | Pass |
| Page weight under 300 KB excluding fonts | Pass: largest page 273 KB (home page) |
| WCAG AA colour contrast | Pass: every pair |
| Keyboard use | Pass, with one tool limitation noted below |
| Layout at 320, 768 and 1440 px | Pass after the fixes listed below |
| Print produces one clean page | Pass: one A4 page |
| Two calculators on one page work independently | Pass |
| Registry test: adding a tool updates header and footer | Pass |
| Token test: changing tokens restyles the whole site | Pass |
| No placeholder text, no broken internal links | Pass |
| One H1 per page, unique keyword per page, schema parses | Pass |
| Lighthouse 95+ on mobile, LCP under 2 s, CLS under 0.05 | **Not measured here.** Run PageSpeed Insights after deploy |
| Migration notes for a non-developer | Done: `handover/MIGRATION-NOTES.md` |

## Tax engine

`npm test` runs 40 tests in `tests/tax-engine.test.mjs`. All pass. They cover:

- the personal allowance taper above £100,000
- all three Section 24 limits (finance costs, property profits, adjusted total income), the credit cap and carry-forward
- the property allowance, including the rule that it cannot be combined with finance costs brought forward
- Rent a Room relief, shared and sole, against HMRC helpsheet HS223
- Scotland, including a starter-rate case
- joint owners at 50/50 and 70/30, and pooled properties
- 2027/28 property income rates and the employment-first allowance order
- HMRC's own case studies (Sophia, John and Brian)
- regression snapshots for 2025/26, 2026/27 and 2027/28
- whole-pence output, input validation and the Making Tax Digital thresholds

Every case in `handover/competitor-comparison.md` is in the suite.

## Stylesheets and markup

From `build/audit.mjs`:

- No hex colours, colour functions, font stacks or lengths appear outside `tokens.css`. Comments, `@font-face` and `@page` rules are skipped.
- CSS Grid is used 0 times. No `:has()`, container queries, `clip-path` or scroll-driven animation, because Elementor's custom CSS cannot rely on them.
- Every element carries at most one class, and none are utility classes.
- Every `<section>` has a `data-section` name and exactly one `__wrap` child.
- Containers sit at most two levels deep inside a wrapper, except the calculator at five levels. It is a single portable unit that moves into WordPress as a plugin, not as Elementor containers.
- There are no scripts or stylesheets from other hosts. Both fonts are self-hosted.
- `package.json` has scripts only and no dependencies. The build tools use Node's built-in modules and are never shipped to visitors.

## Page weight

Excluding fonts, every page is under 300 KB.

| Page | Weight | Why |
|---|---|---|
| Home | 273 KB | Loads the tax engine and rates for the quick estimate, plus eight 600px guide images that load lazily as they scroll into view |
| Calculator | 204 KB | Rates, expenses and Making Tax Digital settings are inlined as JSON, plus the usage guide and questions added after the keyword research |
| Tax on rental income guide, typical of the guides | 137 KB | Mostly the 1200px featured image |

The audit counts the WebP image a browser actually downloads, not the PNG or JPEG fallback inside the same `<picture>`, which only very old browsers fetch. The two font files add 71 KB in total and are cached after the first page. The full per-page list is in `handover/audit-checks.md`.

## Contrast (WCAG 2.1 AA)

Computed from the values in `tokens.css`:

| Pair | Ratio | Needs |
|---|---|---|
| Navy text on white | 15.87:1 | 4.5:1 |
| Navy text on the page background (Ledger) | 14.78:1 | 4.5:1 |
| Navy text on the darkest end of the hero gradient | 11.28:1 | 4.5:1 |
| Muted text on white | 6.10:1 | 4.5:1 |
| Muted text on Ledger | 5.68:1 | 4.5:1 |
| White text on Brand blue (primary buttons) | 4.62:1 | 4.5:1 |
| White text on Brand deep (button hover) | 6.71:1 | 4.5:1 |
| Brand deep text on white (light buttons, card links) | 6.71:1 | 4.5:1 |
| Brand deep text on Navy wash (badges, pills) | 5.80:1 | 4.5:1 |
| Brand blue highlight in the hero title, on Sky deep | 3.28:1 | 3:1 (large text) |
| Brand deep trust icons on Sky deep | 4.77:1 | 3:1 (non-text) |
| Brand blue progress bar on Navy wash | 3.99:1 | 3:1 (non-text) |
| White text on Navy (results panel) | 15.87:1 | 4.5:1 |
| Navy soft labels on Navy | 9.42:1 | 4.5:1 |
| Signal blue tax figure on Navy | 5.57:1 | 4.5:1 (passes even as normal-size text) |
| Navy text on Navy wash (hover, invalid field) | 13.71:1 | 4.5:1 |
| Rule lines on white | 3.65:1 | 3:1 (non-text) |
| Rule lines on Ledger | 3.40:1 | 3:1 (non-text) |

## Keyboard and screen readers

Checked in the browser:

- The skip link is the first tab stop and moves focus to the main content.
- Every control has a visible focus ring, 3 px navy with a 2 px offset.
- Header dropdowns open with their button. Tab moves into the open menu, Escape closes it and returns focus to the button, and clicking outside closes it.
- Calculator fields, disclosures and actions are native `<input>`, `<select>`, `<details>` and `<button>` elements, so Enter and Space work as browsers define them.
- Every input has a `<label>`. Money fields use `inputmode="decimal"` for a numeric keypad on phones.
- Results are announced through an `aria-live` region after the 200 ms debounce.
- Animated figures respect `prefers-reduced-motion`.

**Tool limitation:** the automation tool used here cannot send a real Enter or Space key press, so activating buttons from the keyboard was confirmed through native element behaviour and scripted clicks, not by pressing the keys. A 30-second manual check after deploy is worthwhile: tab to "Guides", press Enter, press Escape.

## Layouts at 320, 768 and 1440 px

Screenshots are in `handover/screenshots/`, for the home page, calculator, Section 24 guide, FAQ and Self Assessment service page. The 320 px shots are taken inside an iframe exactly 320 px wide (`tests/browser/frame.html`), because headless Edge will not open a window that narrow.

Found and fixed:

1. **320 px, calculator:** the "Where you live" select was wider than the screen because a flex item will not shrink below its longest option. Fixed with `min-width: 0` on the setting and `width: 100%` on the control.
2. **320 px, every page:** the Menu button wrapped under the logo. The logo now uses the compact height below the 48em breakpoint, so both fit on one line.
3. **320 px, home:** the main button's label wrapped to two lines left-aligned with no vertical padding. Buttons now centre their text and have vertical padding.
4. **320 px, every page, after the rebrand:** the wider CalculateMyTax logo pushed the Menu button under it again. The logo is now 1.75rem tall below 768px.
5. **Desktop calculator, after fix 1:** the "Where you live" select was cut to "England, Wales and North…", because the two settings shared the row equally. The region setting now takes the width its longest option needs and the tax year takes the rest. When both cannot fit, the region moves to its own row.
6. **New home page, all three widths:** the hero, quick estimate card, tool cards and guide cards were checked in full-length screenshots. Every card row is full at each width: six tool cards in threes or twos, and eight guide cards in fours or twos.

No horizontal scrolling, clipped text or overlapping elements remain in the shots. At 768 px the calculator stacks with the result directly under the form, and a pinned strip shows the tax figure while the form is on screen. At 1440 px the result panel sits beside the form and stays in view while scrolling.

Known and accepted: at 320 px the "Where you live" select shows "England, Wales and Norther…" when closed. That truncation is the browser's native select, and the full name shows when opened.

## Print

Edge's print-to-PDF of the calculator page produces **one A4 page**. It keeps the logo, the tax figure and rates, the April 2027 alert, how the rent is taxed, the Section 24 credit, the relief route comparison, a summary of the figures entered with the date, and the compliance line. It drops navigation, form controls, the page intro, the plain-English paragraph (it repeats the tables) and everything below the calculator.

Blocks hidden only in print carry a `data-print-hide` attribute. In Elementor, add it under Advanced → Attributes.

## Calculator portability

- **Two instances:** `tests/browser/two-calculators.html` puts two calculators on one page. Changing rent in the second (to £30,000, giving £8,386) left the first unchanged at £3,586. Element ids are generated per instance, so labels never point at the wrong field.
- **Registry test:** marking a second tool as live in `data/site.json` turned "Calculators" in the header into a dropdown and added the tool to the footer column, with no template edits. A tool marked as a draft appeared nowhere. The test used a temporary copy of the settings and a separate output folder, so the real site was not changed.
- **Token test:** changing the colour tokens in the browser restyled the header, pages, calculator and results panel together, with no colours left behind.

## Content and SEO

Checked by `build/assemble.mjs` on every build:

- every internal link resolves to a built page
- each page has exactly one H1
- each page's target keyword is unique across the site
- every section is named

Checked by `build/audit.mjs`:

- no placeholder text ("lorem ipsum", "TODO", "TBC", "coming soon")
- no skipped heading levels
- all JSON-LD parses
- titles and meta descriptions are unique
- every image has a width and height

A script requested all 30 external links in the built site (GOV.UK, HMRC manuals, legislation.gov.uk). One GOV.UK address had been retired and was still used as a source on three guides. It was replaced with the current page, and all 30 now return a working page.

`sitemap.xml`, `robots.txt` (which allows the main AI crawlers), `llms.txt` and `404.html` are generated.

## Rebrand and new home page

Checked after renaming the site CalculateMyTax:

- **Name.** The built site has no trace of the old name, JavaScript prefix or domain. A search of every HTML, CSS, JavaScript, JSON, XML and text file in `docs/` finds none.
- **Logo.** The header logo, footer logo, favicons and social image are cropped from the client's upload, not redrawn. The upload itself is not published.
- **Quick estimate.** With the example figures and the rent changed to £24,000, the form showed £5,986 tax, £8,414 kept, a 24.9% effective rate and £498.83 a month. The full calculator gives the same figures. Typing letters marks the field invalid, blanks the result and gives a message for screen readers. Submitting opened the calculator with the same figures filled in and the same £5,986 result.
- **Opening the site from disk.** Clicking a link showed a dark file listing instead of a page when `docs/index.html` was opened straight from the computer. That happens because links end in a folder, and a browser lists a folder's files instead of opening its `index.html`. `assets/js/site.js` now points links and form addresses at `index.html` whenever a page is opened from a file. Headless Edge opened the home page, the calculator and the Self Assessment page from disk. All 50, 41 and 35 page links respectively pointed at an `index.html` that exists, and none still ended in a folder. On GitHub Pages nothing changes.
- **Home page questions.** Seven questions from the question searches in the keyword sheet, marked up as FAQPage. None repeats a question on the FAQ page or a guide, so no question is marked up twice.
- **Guide images.** Each of the eight guides has a 1200 × 630 featured image (WebP with a JPEG fallback), a 600px copy for the home page cards, and uses the image for social sharing.

## Performance

Lighthouse and PageSpeed Insights could not be run from this machine: the PageSpeed API returned "too many requests", and there is no local Lighthouse install. The scores are therefore not claimed here.

What the build does to meet the targets:

- no third-party requests at all
- two self-hosted variable fonts (71 KB) with `font-display: swap` and system fallback stacks
- every image has width and height, and the logo is served as WebP
- the result panel is rendered at build time with the example figures, so it does not jump when the script runs
- scripts load with `defer`
- only the calculator page loads calculator CSS and JS

**After deploy:** run https://pagespeed.web.dev/ on the home page, calculator page and one guide, on mobile. If a score is under 95, the report names the element responsible.
