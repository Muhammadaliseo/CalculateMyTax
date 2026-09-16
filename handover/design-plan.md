# CalculateMyTax design plan

Written before any interface code. Palette follows the client's decision on 13 September 2026: navy and green only, taken from the supplied logo, with green used for the tax figure.

**Update, later on 13 September 2026:** the client renamed the site CalculateMyTax and supplied a new navy and blue logo. Pass three, at the end, replaces the palette and records the home page blocks the client asked for. Passes one and two are kept as the record of the original decisions.

## Pass one

### Colour

| Name | Hex | Role |
|---|---|---|
| Navy | `#243B6B` | Primary. All text, links, buttons and the results panel. Matched to the logo navy. |
| Signal | `#5DBB63` | The annual tax figure only. A lighter step of the logo green, so it reads on the navy panel. |
| Ledger | `#F4F7F3` | Base. The page ground, a pale green-grey like accounts ledger paper. |
| Sheet | `#FFFFFF` | Surface. Header, footer, inputs and page intros. The logo always sits on Sheet. |
| Muted | `#56627E` | Secondary text: hints, captions, dates. |
| Rule | `#7B869E` | Lines that must be seen: input rules, table heads, dropdown borders. |

Derived tints, not extra colours: Hairline `#D9DFE8` for dividers, Navy wash `#E9EDF5` for hover fills, Navy deep `#1B2D52` for pressed buttons, Navy soft `#C9D3EA` for secondary text on the navy panel.

Contrast, from the WCAG 2.1 luminance script:

| Pair | Ratio | Result |
|---|---|---|
| Navy on Sheet | 10.98:1 | AA |
| Navy on Ledger | 10.17:1 | AA |
| Muted on Sheet | 6.10:1 | AA |
| Muted on Ledger | 5.65:1 | AA |
| Sheet on Navy | 10.98:1 | AA |
| Navy soft on Navy | 7.31:1 | AA |
| Rule on Sheet (non-text) | 3.65:1 | Passes 3:1 |

Signal on Navy is checked again in the final audit.

### Type

- **Display: Besley**, a revival of the Clarendon cut by Robert Besley at the Fann Street Foundry, London, in 1845. Used at 700 for headings and 800 for the tax figure. Tabular lining figures confirmed in the browser.
- **Text: Atkinson Hyperlegible Next**, drawn for the Braille Institute so that 1, l and I, and 0 and O, cannot be mistaken. Used at 400, 600 and 700 for body text, labels and every other figure. Tabular figures confirmed.

Scale is a major third (1.25) from a 17px body:

| Token | Size | Use |
|---|---|---|
| `--size-300` | 13.6px | Captions, hints, breadcrumbs |
| `--size-400` | 17px | Body |
| `--size-500` | 21.3px | Lede, H3, FAQ questions |
| `--size-600` | 26.6px | Results secondary figures |
| `--size-700` | 33.2px | H2 |
| `--size-800` | 41.5px | H1 on small screens |
| `--size-900` | 51.9px | H1 on large screens |
| `--size-1000` | 64.9px | Home hero |
| `--size-figure` | 81px | The tax figure |

Headings take -0.01em tracking, the figure -0.02em. Body copy is capped at 68 characters. No capitalised eyebrow labels.

### Layout

**Concept: the ledger sheet.** Pages read like a landlord's accounts ledger: pale ruled paper, navy ink, amounts aligned right. The one solid object is the statement panel that shows the tax.

- **Desktop.** Sticky white header with the logo on the left and navigation on the right. Every page opens with a white intro band (breadcrumb, H1, answer-first lede, verified date), then sections on Ledger. The calculator sits in two flex columns: ledger-line inputs on the left, the navy results panel on the right, sticky, with its height reserved.
- **Mobile.** The header stays pinned at one height, gaining a shadow on scroll, and the navigation folds behind a Menu button. The calculator stacks: settings bar, three fields, then the results panel. A slim navy strip showing the annual tax stays pinned to the bottom once the panel scrolls away. The footer columns become accordions.

### Principles

1. Green appears once on any screen: the tax figure. Everything else is navy on paper.
2. Money is typeset like accounts: right-aligned, tabular, and the final figure double-ruled beneath, as totals are in a ledger.
3. Every rate on the site is filled from the config and dated, so the words can never disagree with the calculator.
4. Structure, not decoration: rules and alignment do the work that cards, shadows and gradients do elsewhere.

## Pass two: would a generic prompt have produced this?

- **Colour.** Partly, yes. Navy and green on white is the default fintech look, and six of the nine competitors use green. The client chose these colours, so I changed how they are used rather than the hues. White is only for surfaces; the page ground is ledger paper. Green is removed from buttons, links, ticks and success states and kept for one number.
- **Type.** A generic build would use Inter, as three competitors do. Besley and Atkinson Hyperlegible Next are chosen for this subject: a Victorian London slab for the figure, and a face built to stop digits being misread.
- **Layout.** A generic build would put a form card beside a results card with rounded corners and soft shadows; Taxfix, q.tax and checkmytax all ship exactly that. Inputs here are ruled ledger lines with no box, and only the results panel is filled. The panel is square-cornered, with the ledger's double rule under the total.
- **Motion.** A generic build fades sections in on scroll. Here only the figures move: the tax counts to its new value and the band bar widths ease, both in response to typing, and both switch off under reduced motion.
- **Removed before shipping.** A repeating ruled-line texture planned for the page ground. It was decoration, it would have needed a gradient, and Elementor could not rebuild it cleanly.

## Pass three: CalculateMyTax rebrand and the new home page

The client renamed the site and asked for a home page modelled on two references: the q.tax hero, with a form beside the headline, and the checkmytax.uk grid of calculator cards. Where that direction conflicts with pass two, the client's direction wins. The home page therefore now uses cards, soft shadows and a gradient.

### Colour

| Name | Hex | Role |
|---|---|---|
| Navy | `#03214B` | Sampled from the logo wordmark. Text, headings, the results panel. |
| Brand blue | `#016DF8` | Sampled from "MyTax" in the logo. Primary buttons, the hero highlight, icon tiles, the progress bar. |
| Signal | `#4C9AFF` | A lighter step of Brand blue, used only for the tax figure on the navy panel (5.57:1). |
| Brand deep | `#0156C4` | Small blue text such as badges and card links, and button hover. Brand blue on pale tints falls below 4.5:1. |
| Ledger | `#F4F7FC` | The page ground, now a blue-grey. |
| Sky to Sky deep | `#EAF2FE` to `#C6DBFB` | The home hero gradient only. |
| Navy soft | `#B6C9E4` | Sampled from the calculator keys in the logo. Secondary text on navy, small dividers. |

Every pair is checked in `handover/audit-checks.md`.

### Type

Unchanged. Besley and Atkinson Hyperlegible Next stay. The logo's geometric lettering exists only in the image.

### Layout

- **Hero.** On a Sky gradient: the headline with its highlighted words, a lede, two stacked buttons and three trust points on the left. On the right, a white card holds the quick estimate form, with two live stat boxes and an effective-rate bar that echo the reference dashboard. Every figure is real, from the same engine as the calculator, and submitting opens the full calculator with the same numbers.
- **Tools and guides.** Six cards, each with an icon tile, a badge and a one-line summary, then a trust row. There are exactly six so every row is full: three columns on desktop, two on tablet, one on mobile.
- **Guide cards.** Eight image cards, four per row on desktop and two on tablet, so rows stay full.
- **Questions landlords ask.** Seven questions taken from the question searches in the keyword sheet. None repeats a question already on the FAQ page or a guide.

Guide featured images are flat illustrations drawn in canvas from the palette, not stock photos. Each carries the guide title and one fact that does not change with the tax year, such as the £7,500 Rent a Room limit.

### What stays from passes one and two

- The ledger-line inputs and the square navy results panel on the calculator page.
- Money set right-aligned and tabular, with the double rule under totals.
- One breakpoint, flexbox only, and every value a token.
