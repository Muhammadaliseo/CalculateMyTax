## Stylesheets
- PASS: no raw hex values, colour functions, font stacks or lengths outside tokens.css
- PASS: CSS Grid used 0 time(s)
- PASS: no :has(), container queries, clip-path or scroll-driven animation

## Built pages (24)
- PASS: one class per element (no class soup)
- PASS: no utility classes
- PASS: every section is named and holds exactly one __wrap div
- PASS: container nesting inside wraps: 3 section(s) deeper than two levels (listed for the migration notes)
  - Contact form: 3 levels
  - Calculator: 5 levels
  - Rental yield calculator: 6 levels
- PASS: no third-party scripts or stylesheets
- PASS: every page under 300 KB excluding fonts (largest index.html at 279 KB)
- PASS: no skipped heading levels
- PASS: no placeholder text
- PASS: every image has width and height
- PASS: all JSON-LD parses
- PASS: titles and descriptions are unique

### Page weight (KB, excluding fonts)
- 404.html: 12
- about/index.html: 94
- allowable-expenses-for-landlords/index.html: 141
- contact/index.html: 99
- contact/thank-you/index.html: 89
- cookie-policy/index.html: 91
- disclaimer/index.html: 91
- faq/index.html: 107
- index.html: 279
- making-tax-digital-for-landlords/index.html: 138
- our-services/index.html: 91
- our-services/self-assessment-tax-returns/index.html: 97
- privacy-policy/index.html: 93
- property-allowance-vs-expenses/index.html: 137
- property-income-tax-rates-2027/index.html: 140
- rent-a-room-scheme/index.html: 130
- rental-income-tax-calculator/index.html: 209
- rental-income-tax-scotland/index.html: 138
- rental-yield-calculator/index.html: 202
- section-24-mortgage-interest-relief/index.html: 139
- tax-on-rental-income/index.html: 141
- terms-of-use/index.html: 91
- who-we-can-help/first-time-filers/index.html: 101
- who-we-can-help/index.html: 93

## Contrast (WCAG 2.1, computed from tokens.css)
- PASS: Navy text on Sheet: #03214B on #FFFFFF = 15.87:1 (needs 4.5:1)
- PASS: Navy text on Ledger: #03214B on #F4F7FC = 14.78:1 (needs 4.5:1)
- PASS: Navy text on Sky deep (darkest end of the hero gradient): #03214B on #C6DBFB = 11.28:1 (needs 4.5:1)
- PASS: Muted text on Sheet: #56627E on #FFFFFF = 6.10:1 (needs 4.5:1)
- PASS: Muted text on Ledger: #56627E on #F4F7FC = 5.68:1 (needs 4.5:1)
- PASS: Sheet text on Brand (primary buttons): #FFFFFF on #016DF8 = 4.62:1 (needs 4.5:1)
- PASS: Sheet text on Brand deep (button hover): #FFFFFF on #0156C4 = 6.71:1 (needs 4.5:1)
- PASS: Brand deep text on Sheet (light buttons, card links): #0156C4 on #FFFFFF = 6.71:1 (needs 4.5:1)
- PASS: Brand deep text on Navy wash (badges, pills): #0156C4 on #E7EFFB = 5.80:1 (needs 4.5:1)
- PASS: Brand deep icons on Sky deep (hero trust icons, non-text): #0156C4 on #C6DBFB = 4.77:1 (needs 3:1)
- PASS: Brand highlight on Sky deep (hero title, large text): #016DF8 on #C6DBFB = 3.28:1 (needs 3:1)
- PASS: Brand progress bar on Navy wash (non-text): #016DF8 on #E7EFFB = 3.99:1 (needs 3:1)
- PASS: Sheet text on Navy (results panel): #FFFFFF on #03214B = 15.87:1 (needs 4.5:1)
- PASS: Navy soft text on Navy (panel labels): #B6C9E4 on #03214B = 9.42:1 (needs 4.5:1)
- PASS: Signal tax figure on Navy (large text): #4C9AFF on #03214B = 5.57:1 (needs 3:1)
- PASS: Signal figure on Navy, if read as normal text: #4C9AFF on #03214B = 5.57:1 (needs 4.5:1)
- PASS: Navy text on Navy wash (hover, invalid field): #03214B on #E7EFFB = 13.71:1 (needs 4.5:1)
- PASS: Rule lines on Sheet (non-text): #7B869E on #FFFFFF = 3.65:1 (needs 3:1)
- PASS: Rule lines on Ledger (non-text): #7B869E on #F4F7FC = 3.40:1 (needs 3:1)

**All checks passed.**
