# CalculateMyTax

A static UK rental income tax calculator and landlord tax guides for calculatemytax.uk. Plain HTML, CSS and JavaScript with no framework and no runtime dependencies, built so it can move to WordPress and Elementor later.

## Put the site online with GitHub Pages

1. **Upload the project.** Create a new repository on GitHub and upload this whole folder to it (drag the files into the repository page, or push with Git). The published website is the `docs` folder; everything else is source and tools.
2. **Turn on Pages.** In the repository go to **Settings**, then **Pages**. Under **Build and deployment** choose **Deploy from a branch**, pick the **main** branch and the **/docs** folder, and press **Save**.
3. **Open the site.** After a minute or two GitHub shows the address, for example `https://your-username.github.io/your-repository/`. Open it and check the calculator works.

**The site is live at https://muhammadaliseo.github.io/CalculateMyTax/**, published from https://github.com/Muhammadaliseo/CalculateMyTax (branch `main`, folder `/docs`).

`data/site.json` is set up for that address:
- `brand.url` is `https://muhammadaliseo.github.io/CalculateMyTax`, used for canonical links, the sitemap and social images.
- `basePath` is `/CalculateMyTax/`, used by the 404 page.

After any change, run `npm run build`, then commit and push. GitHub Pages republishes `docs` within a few minutes.

### When calculatemytax.uk is registered

1. At your domain registrar, point the domain at GitHub Pages as described in GitHub's guide "Managing a custom domain for your GitHub Pages site".
2. In `data/site.json`, make three changes, then run `npm run build`, commit and push:
   - set `"url"` under `brand` to `"https://calculatemytax.uk"`;
   - set `"customDomain"` to `"calculatemytax.uk"`;
   - set `"basePath"` back to `"/"`.
3. In **Settings**, **Pages**, enter the domain and tick **Enforce HTTPS** once it is offered.

## Working on the site

You need Node.js 20 or newer for these commands. The published site does not use Node.

| Command | What it does |
|---|---|
| `npm test` | Runs the tax engine tests (40 cases, including HMRC's worked examples). |
| `npm run build` | Rebuilds every page into `docs/` and checks for broken links, missing headings and unfilled figures. |
| `npm run preview` | Serves `docs/` at http://localhost:8080 so you can click around as visitors will. |

Never edit files inside `docs/` by hand. They are replaced on every build.

You can also open `docs/index.html` straight from your computer by double-clicking it. When a page is opened from a file, links are pointed at each folder's `index.html`, so every page opens instead of a file listing. The calculator and the quick estimate work the same way. On GitHub Pages the site keeps its clean folder addresses.

## Where things live

| Path | Contents |
|---|---|
| `data/rates.json` | Every tax rate, band, allowance and threshold, one object per tax year, money in pence. |
| `data/expenses.json` | The allowable expense checklist and the one-line explanation for each item. |
| `data/mtd.json` | Making Tax Digital thresholds and start dates. |
| `data/site.json` | Brand name, contact email, tools registry, navigation, footer links and social links. |
| `assets/js/tax-engine.js` | The calculation engine. No page code; reads a tax year from `rates.json`. |
| `assets/js/calculator.js` | The calculator interface. |
| `assets/js/quick-estimate.js` | The quick estimate form in the home page hero. |
| `assets/css/tokens.css` | Every colour, font, size, spacing, radius and shadow value. Change a value here and the whole site follows. |
| `assets/css/home.css` | Home page blocks: hero, quick estimate, tool cards and guide cards. |
| `assets/img/brand/`, `assets/img/guides/` | Logos, icons, the social image and each guide's featured image. |
| `src/pages/` | Page content. Each page is one folder with an `index.html`. |
| `src/partials/` | The header, footer and calculator markup shared by pages. |
| `tests/` | Engine tests. |
| `handover/` | Design plan, migration notes and audit for the WordPress move. |
| `build/` | Development tools: page assembler, preview server, brand asset studio. |

## Common updates

- **New tax year.** Add a year object to `data/rates.json` with its verified figures and `lastVerified` date, add a regression snapshot for it in `tests/tax-engine.test.mjs`, run `npm test`, then `npm run build`. Tables, guide figures and the calculator all update from the file.
- **Add a calculator to the menus.** Add an entry to `tools` in `data/site.json` with `"status": "live"` and run `npm run build`. It appears in the header and footer automatically.
- **Social links.** Fill in a `url` and set `"enabled": true` in `data/site.json`, then rebuild. Disabled or empty links are never shown.
- **Guide cards.** Each guide's `summary` and `imageAlt` in `data/site.json` feed the home page cards and the featured image.
- **Logo and images.** Run `node build/asset-studio.mjs` and open http://localhost:4178/. It crops `assets/img/brand/Calculate tax name logo.png` into the logo files and favicons, and redraws the social image and guide images. The crop is measured for that upload, so a different logo file needs its crop measuring again at the top of `build/asset-studio.html`.

All figures on the site are estimates based on published HMRC rates and are not a substitute for professional advice.
