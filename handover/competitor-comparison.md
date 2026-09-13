# q.tax and checkmytax.uk compared

Tested by hand on 13 September 2026, using the live pages the client's keyword sheet lists for "rental income tax calculator":

- q.tax: https://q.tax/calculator/rental-income-tax (position 6, domain authority 5)
- checkmytax.uk: https://checkmytax.uk/rental-property-tax-calculator/ (position 4, domain authority 8)

Every figure below was entered into both live tools. The correct answers come from CalculateMyTax's tested engine and were checked by hand against HMRC's rules.

## Accuracy

All cases use England and 2026/27 rates unless stated. "Tax on rent" means the extra income tax the rental profit causes.

| Test | Inputs | Correct answer | q.tax | checkmytax.uk |
|---|---|---|---|---|
| Standard landlord | Salary £45,000, rent £18,000, expenses £3,200, interest £6,400 | Tax on rent £3,586; total tax £10,072 | Total £10,072 is right, but it is labelled "Tax Due on Rental" | Right: £3,586 |
| Property allowance instead of expenses | Same, using the £1,000 allowance | £12,232 total, no mortgage interest credit | **Wrong: £10,952.** Keeps the £1,280 credit, which the law does not allow | Not offered |
| Income in the allowance taper | Salary £110,000, same property | Total tax £41,032; tax on rent £7,600 | **Wrong: £41,635 total** (£603 too high) | **Wrong: £5,243 on rent** (£2,357 too low) |
| Credit limited by profit | Salary £45,000, rent £10,000, expenses £2,000, interest £12,000 | Credit £1,600; total £7,032; £4,000 carried forward | **Wrong: credit £2,400, total £6,232** (limit ignored) | Right: credit £1,600, tax on rent £546 |
| Rental loss | Salary £30,000, rent £6,000, expenses £9,000, interest £1,000 | No credit; total £3,486; loss of £3,000 carried forward | **Wrong: credit £200 on a loss, total £3,286** | Right: tax on rent £0 (carry-forward not shown) |
| No other income | Rent £20,000, expenses £2,000, interest £15,000 | Credit £1,086; tax £0; £9,570 carried forward | Tax £0 is right, but the credit is shown as £3,000 | Right: credit £1,086, tax £0 |
| Negative expenses typed in | Expenses of minus £500 | Should be refused | **Accepted:** adds £500 to profit | **Accepted:** adds £500 to profit |

**Result:** q.tax is right on 1 of 6 figures and mislabels that one. checkmytax.uk is right on 4 of 5 applicable figures, missing only the allowance taper. Neither checks for negative numbers.

## Scope

| Feature | q.tax | checkmytax.uk | CalculateMyTax |
|---|---|---|---|
| Tax year | 2025/26 only (out of date) | 2026/27 | 2025/26, 2026/27 and 2027/28 |
| Scotland | No | Separate general calculator | Built in |
| Joint owners | No | No | Any split, with the other owner's income |
| Several properties | No | No | Yes, pooled |
| Property allowance | Manual tick box, wrong credit | No | Compared automatically with a warning |
| Rent a Room | No | No | Methods A and B compared |
| Losses and unrelieved interest brought forward | No | No | Yes |
| Section 24 against the old rules | No | No | Yes, as a cash figure |
| April 2027 property rates | No | Written guide only | Alert with the cash difference |
| Making Tax Digital check | No | No | Yes |
| Shareable link, print | No | No | Yes |
| Sign-up or email gate | None | None | None |

## Page quality

| | q.tax | checkmytax.uk |
|---|---|---|
| Words on the page | 171 | 2,011 |
| Heading outline | H1, one form heading, a sales H2, related calculators | H1 plus 14 H2 sections (stacking, rates table, April 2027, Section 24, landlord types, expenses, Let Property Campaign, limited companies, yield, FAQ with 6 questions) |
| Sources cited | None | None (one unlinked mention of HMRC) |
| Date shown | None (title says 2025/26) | "Updated for the 2026/2027 UK tax year" |
| Schema | Organization, WebSite, BreadcrumbList, SoftwareApplication | WebPage, BreadcrumbList, WebSite, Organization, WebApplication. **No FAQPage despite an FAQ** |
| Internal links in content | 5 | 5 |
| Outdated or wrong copy | Intro promises "wear &amp; tear deductions", abolished in April 2016 | Menu typo "Landloards" |
| Labels linked to inputs | Yes | **No** |
| Numeric keypad on phones | No (number inputs, no inputmode) | No |
| Results announced to screen readers | No | No |
| Tabular figures | No (Inter) | No (system font) |
| Weight and speed (unthrottled lab) | 410 KB, 26 requests, LCP 1.7 s, CLS 0, no third parties | 215 KB, 24 requests, LCP 1.9 s, CLS 0, 5 third-party hosts |
| Phone layout | Form starts about 560px down; result below the whole form | Form starts about 550px down; result below the form |
| Business model | Funnel for £39.99 a year Self Assessment software, sole traders only | None visible |

## What each does well

- **checkmytax.uk** ranks at position 4 with domain authority 8 largely on content depth. One long page answers most landlord questions, from the stacking principle to the April 2027 rates. Its calculator is simple and mostly right.
- **q.tax** has a useful idea: a message saying whether the user is on the cheapest method. The logic behind it is wrong, but the pattern is worth keeping, and CalculateMyTax's route comparison does it correctly.

## How CalculateMyTax beats both

1. **Correct in every case above.** All seven are in the 40-test suite, including HMRC's own worked examples.
2. **Depth that q.tax lacks, split the way checkmytax.uk is not.** Rather than one 2,000-word page, the calculator page stays focused and links to nine guides. Each guide targets its own keyword and carries its own schema, and the FAQ page carries FAQPage schema.
3. **Accessibility neither offers:** labelled inputs, a numeric keypad on phones, results announced to screen readers, visible focus and a pinned result strip on mobile.
4. **Trust signals neither shows:** GOV.UK and HMRC sources on every guide, and a "last verified" date filled in from the rates file.

## Gaps worth considering later

These are topics checkmytax.uk covers that are not on CalculateMyTax's page list. They are suggestions, not additions:

- Accidental landlords, HMO landlords and non-resident landlords, as audience pages under Who we can help.
- The Let Property Campaign, for landlords who have not declared past rental income.
- Owning property through a limited company, which the calculator deliberately leaves out.
