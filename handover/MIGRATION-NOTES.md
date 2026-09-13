# CalculateMyTax: moving the site to WordPress and Elementor

These notes are for whoever rebuilds calculatemytax.uk in WordPress with Elementor. You should not need to have seen the project before. Read sections 1 and 2 first, then work through the rest in order.

## 1. What you are moving

- **A static website** of 21 pages plus a 404 page, built from plain HTML, CSS and JavaScript. There is no framework and no database.
- **One tool**, the rental income tax calculator. It runs entirely in the visitor's browser.
- **Where to look:**
  - `docs/` is the finished site exactly as visitors see it. Use it as your visual reference. You can open it with `npm run preview`, or just look at the files on GitHub Pages.
  - `src/pages/` holds each page's content, one folder per page, and `src/partials/` holds the header, footer and calculator markup.
  - `data/` holds every tax figure and site setting as JSON.
  - `assets/` holds the CSS, JavaScript, fonts and images.
  - `handover/section-inventory.md` lists every page and its containers (see section 8).
  - `handover/screenshots/` shows the key pages at 320, 768 and 1440 pixels wide.
- **Do not copy** `build/`, `tests/` or `docs/` into WordPress. They are development tools and generated output.

You will need WordPress 6 or newer, **Elementor Pro** (Theme Builder, Custom Fonts, sticky header and the FAQ schema option on the Accordion widget all need Pro), and an SEO plugin such as Rank Math or Yoast.

## 2. How the static site is organised, and why it helps you

Every page is a stack of blocks. Each block is exactly one `<section>` holding one wrapper `<div>`. **Each section is one Elementor container.** The inner wrapper is the container's content box, not a second container. Each section carries a plain-English name in `data-section`, such as `data-section="Worked example"`. Use that name as the container's name in the Elementor Navigator.

Every colour, font, size and gap lives in one file, `assets/css/tokens.css`. Nothing else in the CSS uses a raw value, so the lists in sections 3 to 6 are complete.

Layout is flexbox throughout. **CSS Grid is not used anywhere**, so every block maps onto a flexbox container.

There is one breakpoint, 768px, which matches Elementor's mobile breakpoint (767px and below). Below it, rows stack into columns.

## 3. Global Colours

Set these in **Site Settings, Global Colours**. The first four fill Elementor's system colours; add the rest as custom colours with the same names.

| CSS token | Elementor Global Colour | Hex | Use it for |
|---|---|---|---|
| `--colour-navy` | Primary: **Navy** | `#03214B` | Headings, body text, links, the results panel, heavy rules |
| `--colour-brand` | Secondary: **Brand blue** | `#016DF8` | Primary buttons, the hero highlight, icon tiles, progress bars, card hover borders |
| `--colour-navy` | Text: **Navy** | `#03214B` | Body text (the same navy) |
| `--colour-signal` | Accent: **Signal blue** | `#4C9AFF` | The tax figure on the navy results panel only. It is a lighter tint of the brand blue, so it stays readable on navy |
| `--colour-muted` | Custom: **Muted** | `#56627E` | Hints, captions, dates, breadcrumbs, card text |
| `--colour-brand-deep` | Custom: **Brand deep** | `#0156C4` | Button hover, badge and pill text, light button text, card links |
| `--colour-ledger` | Custom: **Ledger** | `#F4F7FC` | Page background |
| `--colour-sheet` | Custom: **Sheet** | `#FFFFFF` | Header, footer, page intros, cards, inputs |
| `--colour-sky` | Custom: **Sky** | `#EAF2FE` | Light end of the home hero gradient |
| `--colour-sky-deep` | Custom: **Sky deep** | `#C6DBFB` | Dark end of the home hero gradient |
| `--colour-rule` | Custom: **Rule** | `#7B869E` | Borders that must be visible: input borders, table heads, dropdown borders |
| `--colour-hairline` | Custom: **Hairline** | `#D8E1EE` | Thin dividers between rows, card borders |
| `--colour-navy-wash` | Custom: **Navy wash** | `#E7EFFB` | Hover backgrounds, badges, pills, invalid input background |
| `--colour-navy-deep` | Custom: **Navy deep** | `#021633` | Reserved dark tint |
| `--colour-navy-soft` | Custom: **Navy soft** | `#B6C9E4` | Secondary text on the navy results panel, small dividers |

Navy, Brand blue and Navy soft are sampled from the CalculateMyTax logo. The other colours are tints of them.

Three more tokens are not colours but belong with them:
- `--gradient-hero`: a 135° linear gradient from Sky to Sky deep. Set it with a container's **Background, Gradient** option.
- `--shadow-card`: 0 20px 40px, navy at 14%. Use it for the quick estimate card and for cards on hover, with **Box Shadow**.
- `--shadow-soft`: 0 4px 12px, navy at 7%. Use it for resting cards and the light button.

Every text pairing passes WCAG AA; the ratios are in `handover/audit-checks.md`.

## 4. Global Fonts

Set these in **Site Settings, Global Fonts** after uploading the fonts (section 5).

| Elementor Global Font | Family | Weight | Size (desktop / mobile) | Line height | Letter spacing | CSS tokens |
|---|---|---|---|---|---|---|
| Primary: **Headings** | Besley | 700 | H1 52px / 41px, H2 33px, H3 21px | 1.12 | -0.01em | `--font-display`, `--weight-bold`, `--size-h1`, `--size-700`, `--size-500` |
| Secondary: **Labels** | Atkinson Hyperlegible Next | 600 | 17px | 1.6 | 0 | `--font-text`, `--weight-semibold` |
| Text: **Body** | Atkinson Hyperlegible Next | 400 | 17px | 1.6 | 0 | `--font-text`, `--weight-regular`, `--size-400` |
| Accent: **Tax figure** | Besley | 800 | 81px / 52px | 1.12 | -0.02em | `--font-display`, `--weight-figure`, `--size-figure-fluid` |

Add these as custom typography styles:

| Name | Family and weight | Size | Token |
|---|---|---|---|
| Small | Atkinson Hyperlegible Next 400 | 13.6px | `--size-300` |
| Lede | Atkinson Hyperlegible Next 400 | 21.3px, line height 1.35 | `--size-500`, `--leading-snug` |
| Home hero title | Besley 700 | 55px desktop, 38px mobile | `--size-hero` |
| Stat figure (quick estimate) | Besley 800 | 33px desktop, 27px mobile | `--size-stat` |
| Badge | Atkinson Hyperlegible Next 700, uppercase, letter spacing 0.06em | 11.9px | `--size-200`, `--tracking-caps` |

The body font size is 17px, set as `html { font-size: 106.25% }`, so 1rem is 17px everywhere in the CSS. Figures use tabular lining numerals (`font-variant-numeric: tabular-nums lining-nums`); the Custom CSS in section 6 keeps that.

## 5. Custom Fonts

Upload in **Elementor, Custom Fonts**. The files are in `assets/fonts/`.

| Font name to enter | File | Upload it for these weights |
|---|---|---|
| Atkinson Hyperlegible Next | `atkinson-hyperlegible-next-latin.woff2` (34 KB) | 400, 600 and 700. It is one variable font file, so upload the same file three times |
| Besley | `besley-latin.woff2` (37 KB) | 700 and 800, the same file twice |

Both fonts use the SIL Open Font License. Keep `OFL-AtkinsonHyperlegibleNext.txt` and `OFL-Besley.txt` with the files.

Set font display to **swap**. Do not load either font from Google; the site hosts its own fonts.

The logo's lettering exists only inside the logo image files. It is not a site font and does not need uploading.

## 6. Spacing, sizes and the one piece of Custom CSS

Elementor has no global spacing setting, so use these values whenever you set padding, margins and gaps.

| Token | Value | Typical use |
|---|---|---|
| `--space-3xs` | 2px | Tiny gaps between a label and its value |
| `--space-2xs` | 4px | Breadcrumb gaps, list gaps |
| `--space-xs` | 8px | Gaps inside rows, compact padding |
| `--space-s` | 12px | Row padding, small gaps |
| `--space-m` | 16px | Default gap between elements |
| `--space-l` | 24px | Container side padding, gaps between groups |
| `--space-xl` | 32px | Gaps between columns, callout padding |
| `--space-2xl` | 48px | Top and bottom padding of most sections |
| `--space-3xl` | 72px | Top and bottom padding of the home hero and feature blocks |
| `--width-page` | 72rem (1224px) | Content width of every container (set as the container's max width) |
| `--measure` | 68ch | Maximum width of paragraphs |
| `--radius-s` | 3px | The results panel, quiet buttons |
| `--radius-m` | 6px | Primary and light buttons, quick estimate inputs |
| `--radius-l` | 12px | Cards, icon tiles, stat boxes, featured images |
| `--radius-xl` | 20px | The quick estimate card |
| `--radius-pill` | 999px | Badges, pills, the progress bar |
| `--border-thin` / `--border-rule` / `--border-heavy` | 1px / 2px / 4px | Dividers / input rules and table tops / header and footer top rules |
| `--border-double` | 6px double | The "ledger total" rule under totals (Elementor border type Double) |
| `--control-height` | 44px | Minimum height of buttons and inputs |

**Paste `assets/css/tokens.css` into Site Settings, Custom CSS** (or the child theme stylesheet), together with the `@font-face` rules and element defaults from `assets/css/base.css`. The calculator stylesheet reads these tokens, so without them it will not render correctly. Then, if you change a Global Colour, change the matching token value too. That is the only place the two must be kept in step.

## 7. Header and footer (Theme Builder)

Neither depends on page-specific CSS. Source files: `src/partials/header.html` and `src/partials/footer.html`.

### Header template: container "Site header"

- **Row container:** white background (Sheet), 1px Hairline bottom border, content width 1224px, padding 16px top and bottom, 24px sides, items spaced between.
- **Site Logo widget:** `assets/img/brand/calculatemytax-logo.webp`, with the PNG as a fallback. It is 798 by 160 pixels and leaves out the tagline, which is unreadable at header size. Display it 51px tall, or 34px below 768px. Link to home. Alt text "CalculateMyTax home".
- **Nav Menu widget** using a WordPress menu called "Main":
  - **Calculators.** One link while there is one live tool; a dropdown of tools once there are two or more (see section 11 for the tools registry).
  - **Guides:** a dropdown with the nine guide pages in the order in section 12, ending with Frequently asked questions.
  - **Who we can help:** a dropdown with the parent page first, then First-time filers.
  - **Our services:** a dropdown with the parent page first, then Self Assessment tax returns.
  - **Contact.**
  - Dropdown panels: white, 1px Rule border with a 4px Navy top border, 17rem minimum width. Item hover background is Navy wash.
- **Sticky:** set the section to sticky top. On scroll it should **shrink, not hide**: the logo goes from 51px to 40px and the vertical padding from 16px to 8px. Use Elementor Pro's sticky "Effects offset" with Custom CSS on `.elementor-sticky--effects`.
- **Mobile, below 768px:** the Nav Menu collapses behind a **Menu** button. Sub-menus open inline, with a 2px Navy left border.

### Footer template: container "Site footer"

- **Container:** white background, 4px Navy top border, content width 1224px, padding 48px top, 24px sides and bottom.
- **Inner container "Brand"** (flex basis 16rem): the full logo with its tagline (`calculatemytax-logo-full.webp`), 340px wide and never wider than its container; the one-line description "Free UK tax calculators and plain-English guides for landlords, built on current HMRC rates."; the contact email as a mailto link.
- **Inner container "Columns"** (flex basis 36rem), holding four columns, each with a Besley heading and a list of links:
  1. **Calculators:** every live tool from the tools registry (section 11). Currently Rental income tax calculator.
  2. **Who we can help:** First-time filers.
  3. **Our services:** Self Assessment tax returns.
  4. **Company:** About, Contact, Privacy policy, Terms of use, Cookie policy, Disclaimer.
- **Inner container "Legal bar"** (full width, 1px Hairline top border, 13.6px Muted text), holding:
  - `© [current year] CalculateMyTax`. Use the dynamic tag for the year.
  - The compliance line: "All figures are estimates based on published HMRC rates and are not a substitute for professional advice."
  - Social icons on the right. **They ship disabled.** Add the Social Icons widget only once the client supplies real profile addresses, and never show an icon without a working link.
- **Mobile:** the four columns become accordions, closed by default. Use the Toggle widget, or Nav Menu widgets inside a Toggle.

## 8. Pages and their containers

Create one WordPress page per folder in `src/pages/`, with the permalinks in section 12. `handover/section-inventory.md` lists every page with its containers in order; each name there is the `data-section` value to use as the container name.

Each block type is rebuilt like this:

| Block (CSS class) | Elementor build |
|---|---|
| `intro`: page opening | Container, white background, 1px Hairline bottom border, padding 32px top and 48px bottom, column direction, 16px gap. Widgets: SEO plugin breadcrumbs, Heading (H1, max width 24ch), Text Editor for the lede (21.3px), Text Editor for the "last verified" line (Small, Muted) |
| `intro` on guides | After the "last verified" line, an Image widget with the page's featured image: max width 44rem, 12px radius, soft shadow |
| `home-hero`: home page opening | Container row, Background Gradient (Sky to Sky deep, 135°), 72px padding, two inner containers. **Left** (max width 34rem, column, 24px gap): Heading H1 (55px) with the highlighted words in Brand blue using a span; Text Editor; an inner column of two Buttons, Primary and Light, max width 24rem; an Icon List of three trust points with Brand deep icons. **Right:** the quick estimate form, which is a shortcode (section 10), in a white card with a 20px radius, 24px padding and the card shadow |
| `tools`: home "Choose the calculator or guide you need" | Container, Ledger background, column, centred: Heading H2 (41px), Text in Muted, a 48 by 4px Navy soft divider, then an inner row container of six cards. Each card is a container link (flex basis 20rem, 24px padding, 1px Hairline border, 12px radius, soft shadow, Brand border on hover). A card holds an Icon in a 44px tile with a 12px radius, a badge (Text, uppercase, pill, Navy wash background, Brand deep text) pushed to the right, a Heading H3 and Text. The tile is Brand, Navy or Navy wash, set by the card's `data-tone`. Below the cards, a row of three Icon Box trust points above a 1px Hairline rule |
| `posts`: home guide cards | Container, white, column: Heading H2 and Text, then a **Loop Grid** of the guide pages, four per row on desktop, two on tablet and one on mobile. Each loop item shows the featured image, a "Guide" badge, the title as H3, the page's summary (Muted, 13.6px) and "Read the guide" in Brand deep. Style the cards like `tools`. The summaries are in `data/site.json` under `guides` |
| `prose`: guide content | Container, column, 16px gap, 48px padding. One Text Editor per heading and its paragraphs, with paragraphs capped at 68ch. Tables and worked examples go in HTML widgets (section 9) |
| `steps`: numbered steps on the calculation guide | Container. Text Editor with an ordered list, each item an H3 plus a paragraph, 1px Rule top border per item |
| `faq`: questions | Container. **Accordion widget with FAQ schema switched on.** Question 21.3px bold; answers as paragraphs; a 1px Rule line under each item |
| `callout`: link to the calculator | Container row, white background, 4px Navy top border, 32px padding. A column of Heading (26.6px) and Text, then a Button |
| `related`: related guides | Container, with a Heading (H2) and an inner row container of Button widgets styled as text links: 1px Rule bottom border, flex basis 16rem, wrapping |
| `sources`: sources | Container, 13.6px Muted text. Heading (H2, 21.3px) and a Text Editor list of external links |
| `feature`: home calculator block | Container row with two inner containers: text with a button, and a list with a 2px Navy top border and Hairline row dividers |
| `audience`: home "Who we help" | Container row, white background, two inner columns, each a Heading, Text and Button |
| `contact`: contact page | Container, column: Heading, a mailto link at 33px in Besley, Text |
| `Calculator` | **Shortcode widget, not containers.** See section 10 |

Buttons have three styles.

| Style | Background and text | Border | Hover |
|---|---|---|---|
| **Primary** (`.button`) | Brand blue background, white text | 2px Brand border, 6px radius | Brand deep |
| **Quiet** (`.button-quiet`) | Transparent background, Navy text | 2px Navy border, 3px radius | Navy wash background |
| **Light** (`.button-light`) | White background, Brand deep text, soft shadow | 1px Hairline border, 6px radius | Brand border |

All three are at least 44px tall and bold, with 8px top and bottom and 24px side padding, and centre their text when it wraps. **Never add arrow characters to button text.**

## 9. Figures that come from the tax configuration

No tax rate, threshold, allowance or date is typed into any page. In the source files they are tokens, and in the built pages each one is wrapped in `<data class="config-figure" value="…">`, so you can find them all by searching the built HTML for `config-figure`.

| Source token | Example output | What it reads |
|---|---|---|
| `{{money:current.personalAllowance}}` | £12,570 | A money value from `rates.json` for the current tax year (`current`, `next` or a year key such as `2027-28`) |
| `{{pct:current.financeReliefRate}}` | 20% | A rate from `rates.json` |
| `{{date:next.startDate}}` | 6 April 2027 | A date from `rates.json` |
| `{{label:current}}` | 2026/27 | A tax year label |
| `{{verified}}` | 13 September 2026 | The `lastVerified` date |
| `{{mtd-money:1.threshold}}`, `{{mtd-date:1.startDate}}`, `{{mtd-year:1.testYear}}` | £30,000, 6 April 2027, 2025/26 | Making Tax Digital phases from `mtd.json` |
| `{{table:bands:scotland:current}}`, `{{table:property-rates:next}}`, `{{table:allowances}}`, `{{table:mtd}}` | Whole tables | Tables built from the config |
| `{{list:expenses}}` | The expenses checklist | `expenses.json` |
| `{{calc:example.owner.result.propertyTax}}` | £3,586 | A worked-example figure computed by the tax engine from inputs in the page header |

**Recommended WordPress approach:** register shortcodes that map one to one onto these tokens, for example `[cmt_money key="current.personalAllowance"]`, `[cmt_pct key="current.financeReliefRate"]` and `[cmt_table type="bands" region="scotland" year="current"]`. They read the options records in section 11. Then a new tax year updates every page at once, as it does now.

**Worked-example figures** (`calc` tokens) are computed by the JavaScript engine. You have three options:
- Output them from a shortcode that runs the engine in the browser.
- Port the engine to PHP.
- The simplest: keep them as typed figures and update them once a year. Rebuild the static site with the new rates using `npm run build`, then copy the figures across.

These pages have worked examples: tax on rental income, property allowance vs expenses, Section 24, property income tax rates 2027, Rent a Room, and Scotland. Also the calculator page intro.

## 10. The calculator: what becomes the plugin

The calculator is a self-contained unit. It is deliberately **not** rebuilt from Elementor widgets: it nests five levels deep and depends on JavaScript. Wrap it in a small plugin:

| Static file | In the plugin |
|---|---|
| `assets/js/tax-engine.js` | Enqueued script, no dependencies. Pure calculation, no page code |
| `assets/js/quick-estimate.js` | Enqueued on the home page, depends on `tax-engine.js`. It starts every form marked `data-quick-estimate` and exposes `CalculateMyTaxQuickEstimate.init(form)`. The form markup, `form.quick` in `src/pages/index.html`, is the output of a second shortcode such as `[cmt_quick_estimate]`, and needs only the rates JSON block. Submitting it opens the calculator page with the same figures, because its field names match the calculator's shareable link |
| `assets/css/home.css` | Home page stylesheet for the hero, quick estimate, tool cards and guide cards. Enqueue it on the home page, or rebuild those blocks with the container settings in section 8 |
| `assets/js/calculator.js` | Enqueued script, depends on `tax-engine.js`. It starts every element with `data-calculator` on the page and exposes `CalculateMyTaxCalculator.init(element)` |
| `assets/css/calculator.css` | Enqueued stylesheet. Needs the tokens from section 6 |
| `assets/css/print.css` | Enqueued with `media="print"` on the calculator page, so "Print or save as PDF" gives a clean summary for an accountant |
| `src/partials/calculator.html` | The output of a shortcode such as `[cmt_rental_calculator]`, placed on the page in a Shortcode widget. Before output, replace its tokens: `{{calc-year-options}}` and `{{calc-region-options}}` with `<option>` elements from the rates record; `{{label:current}}` and the `{{calc…}}` example figures; `{{root}}` with the site's home URL |
| `data/rates.json`, `data/expenses.json`, `data/mtd.json` | Printed on the page as `<script type="application/json" id="cmt-config-rates">…</script>` (and `-expenses`, `-mtd`) using `wp_add_inline_script`, from the options records in section 11. The calculator reads these first, and fetches `data/*.json` only if they are missing |

A minimal plugin needs one PHP file that registers the shortcode, enqueues the four files and prints the three JSON blocks. No other markup or settings are needed.

**Two calculators on one page work.** This was tested with two copies side by side: each keeps its own figures, element IDs are generated per instance, and both share the one set of JSON blocks.

**Content written by JavaScript.** This is the only place it happens, and only for:
- the calculated results;
- the tax year and region options (from `rates.json`);
- the expense checklist rows (from `expenses.json`);
- extra property rows cloned from a `<template>`.

All wording, including error messages, alerts and the plain-English summary, lives in the markup as `<template data-text>` and hidden elements. So text can be edited in `calculator.html` without touching JavaScript.

## 11. The JSON configuration in WordPress

| File | Becomes | Notes |
|---|---|---|
| `data/rates.json` | Option `cmt_rates` | An array keyed by tax year (`"2026-27"`). **Money is in pence, as integers**; rates are decimals. Each year also holds `lastVerified`, its sources and notes. Keep the shape exactly, because the engine reads it as is |
| `data/expenses.json` | Option `cmt_expenses` | A list of `id`, `label` and `tooltip` |
| `data/mtd.json` | Option `cmt_mtd` | Thresholds in pence, each with its test year and start date |
| `data/site.json` | Several WordPress settings | See below |

What `site.json` becomes:
- **`brand`:** Site title, tagline, and Site Logo. Use `icon-512.png` as the Site Icon.
- **`contact.email`:** an option used in the footer and Contact page.
- **`tools`:** the tools registry. Make it a custom post type "Tools" with a status field. The Calculators menu item and the footer Calculators column should list every Tool whose status is live; use a Loop Grid in the footer and a menu filter or a dynamic Nav Menu in the header. **Adding a live tool must add it to both with no other change**, as it does on the static site.
- **`guides`, `whoWeCanHelp`, `ourServices` and `company`:** WordPress menus.
- **`social`:** add profile addresses to the Social Icons widget only when real ones exist.
- **`legal`:** the footer copyright holder and compliance line.

An admin screen, such as an ACF options page or a small settings page, can edit `cmt_rates` in the same shape. **Each new tax year, check the new figures against GOV.UK, add the year, update `lastVerified`, and test at least one worked example before publishing.** In the static project, `npm test` does this and must pass before release.

## 12. URL map

Set **Settings, Permalinks** to "Post name". Every address stays exactly the same, so no redirects are needed.

| Static address | WordPress page | Parent |
|---|---|---|
| `/` | Home (static front page) | |
| `/rental-income-tax-calculator/` | Rental income tax calculator | |
| `/tax-on-rental-income/` | Tax on rental income | |
| `/allowable-expenses-for-landlords/` | Allowable expenses for landlords | |
| `/section-24-mortgage-interest-relief/` | Section 24 mortgage interest relief | |
| `/property-allowance-vs-expenses/` | Property allowance or expenses | |
| `/rent-a-room-scheme/` | The Rent a Room Scheme | |
| `/rental-income-tax-scotland/` | Rental income tax in Scotland | |
| `/property-income-tax-rates-2027/` | Property income tax rates from April 2027 | |
| `/making-tax-digital-for-landlords/` | Making Tax Digital for landlords | |
| `/faq/` | Frequently asked questions | |
| `/who-we-can-help/` | Who we can help | |
| `/who-we-can-help/first-time-filers/` | First-time filers | Who we can help |
| `/our-services/` | Our services | |
| `/our-services/self-assessment-tax-returns/` | Self Assessment tax returns | Our services |
| `/about/` | About | |
| `/contact/` | Contact | |
| `/privacy-policy/` | Privacy policy | |
| `/terms-of-use/` | Terms of use | |
| `/cookie-policy/` | Cookie policy | |
| `/disclaimer/` | Disclaimer | |
| `/404.html` | Theme Builder 404 template | |

## 13. SEO carry-over

- **Title and meta description:** copy each page's from the `<title>` and `<meta name="description">` in `docs/…/index.html` into the SEO plugin. Each page targets one keyword; the keyword is the `keyword` field at the top of each file in `src/pages/`. Do not change them without checking for overlap.
- **Social sharing image:** set `assets/img/brand/calculatemytax-social.png` (1200 by 630) as the default Open Graph and Twitter image. Each guide uses its own featured image (`assets/img/guides/<page>.jpg`) instead. Set it as the page's Featured Image and the SEO plugin will use it.
- **Structured data.** Copy each JSON-LD block from the built pages where the plugin cannot produce it:
  - Organization, WebSite and BreadcrumbList on every page, via the SEO plugin settings.
  - WebApplication on the calculator page (FinanceApplication, price 0). Add it as custom schema.
  - FAQPage on the home page, the FAQ page and every guide with a questions block. Use the Accordion widget's FAQ schema switch. The home page questions are different from the FAQ page's, so no question is marked up twice.
  - HowTo on "Tax on rental income". Use custom schema.
  - Service on "Self Assessment tax returns". Use custom schema.
- **`robots.txt`:** allows every crawler, including GPTBot, PerplexityBot, ClaudeBot and Google-Extended, and points to the sitemap. Keep that when the SEO plugin takes over `robots.txt`.
- **`llms.txt`:** upload `docs/llms.txt` to the site root, and update its links if pages change.
- **Sitemap:** let the SEO plugin generate it.

## 14. Images

Brand images are in `assets/img/brand/` and guide images in `assets/img/guides/`.

| File | Size | Use |
|---|---|---|
| `calculatemytax-logo.webp` / `.png` | 798 × 160 | Header logo, without the tagline |
| `calculatemytax-logo-full.webp` / `.png` | 798 × 160 | Footer logo, with the tagline "Free UK Tax Calculators & Tools" |
| `favicon-32.png`, `apple-touch-icon.png`, `icon-512.png` | 32 to 512 square | Site icon, cropped from the logo's calculator mark. Use `icon-512.png` as the WordPress Site Icon |
| `calculatemytax-social.png` / `.webp` | 1200 × 630 | Default social sharing image |
| `assets/img/guides/<page>.webp`, `<page>-600.webp`, `<page>.jpg` | 1200 × 630 and 600 × 315 | Featured image for each guide. Upload the JPEG as the page's Featured Image; WordPress makes the smaller sizes |

The logo files are cropped from the client's upload, `Calculate tax name logo.png`. It stays in `assets/img/brand/` as the source file but is not published. `build/asset-studio.html` draws the guide images and the social image. **Ask the client for the original vector logo** if a larger or print version is needed.

## 15. What needs rebuilding by hand

Everything not listed here converts directly into containers and standard widgets as described above.

1. **The calculator.** Plugin and shortcode, not containers (section 10). This is deliberate.
2. **The tools registry.** Header and footer calculator links need the custom post type and dynamic menu or loop described in section 11.
3. **Header behaviour:**
   - the shrink on scroll needs sticky effects plus a little Custom CSS;
   - dropdowns open on hover on desktop, and on tap or keyboard everywhere;
   - Escape closes them.
4. **Footer accordions** below 768px. Rebuild them with Toggle widgets.
5. **Data tables and worked examples** (rates tables, Making Tax Digital table, allowances table, the `worked` ledgers). Use shortcodes (section 9) or HTML widgets. They contain configuration figures.
6. **Configuration figures in body text.** Replace them with shortcodes, or accept that they become typed text that must be updated each tax year.
7. **FAQ blocks.** The static site uses native `<details>` elements; rebuild them as Accordion widgets with FAQ schema.
8. **The numbered steps** on the calculation guide use CSS counters. Use an ordered list in a Text Editor.
9. **Structured data** that the SEO plugin does not generate (section 13).
10. **Breadcrumbs.** Use the SEO plugin's breadcrumbs widget.
11. **The 404 page.** Use a Theme Builder 404 template.
12. **Print stylesheet.** Enqueue it (section 10). Sections that should not print carry a `data-print-hide` attribute. On the calculator page that is the Intro section. In Elementor Pro, select the container, open Advanced → Attributes and enter `data-print-hide|`.
13. **Absolute and fixed positioning** is used only for:
    - dropdown panels;
    - the skip link;
    - the plus and minus icon on FAQ questions;
    - the mobile result strip pinned to the bottom of the calculator page, which is part of the calculator plugin.

    None of it is used for page layout.
14. **The quick estimate form in the home hero.** A small shortcode that belongs to the calculator plugin (section 10), not Form widgets, because it recalculates as you type.
15. **Guide cards on the home page.** A Loop Grid of the guide pages with their featured images and summaries (section 8).

**Not used anywhere, so there is nothing to rework:** CSS Grid, `:has()`, container queries, clip-path, scroll-driven animation, utility classes, third-party scripts, or fonts loaded from Google.
