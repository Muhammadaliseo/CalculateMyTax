// Dev-only page assembler for CalculateMyTax.
//
// Reads page bodies from src/pages, wraps each with the shared head, header and footer fragments, fills
// config-driven figures, tables and navigation from data/*.json, and writes plain static HTML into docs/,
// the folder GitHub Pages publishes. The published site never runs this file.
//
// Usage: npm run build          Pin the date with BUILD_DATE=2026-09-13 npm run build

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
// OUT_DIR and SITE_FILE let checks build into a scratch folder with a test copy of site.json.
const OUT = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(ROOT, 'docs');

const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));

const site = process.env.SITE_FILE ? JSON.parse(fs.readFileSync(process.env.SITE_FILE, 'utf8')) : readJson('data/site.json');
const rates = readJson('data/rates.json');
const expenses = readJson('data/expenses.json');
const mtd = readJson('data/mtd.json');
const purchaseRates = readJson('data/purchase-rates.json');
const engine = require(path.join(ROOT, 'assets', 'js', 'tax-engine.js'));
const yieldEngine = require(path.join(ROOT, 'assets', 'js', 'yield-engine.js'));
const purchaseTaxEngine = require(path.join(ROOT, 'assets', 'js', 'purchase-tax-engine.js'));
const CONFIG = { rates, expenses, mtd, purchaseRates, site };

const BUILD_DATE = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
// CHECK_ONLY=1 renders and validates every page without touching docs/, so several people can check at once.
const CHECK_ONLY = process.env.CHECK_ONLY === '1';
const YEARS = engine.listTaxYears(rates);
const CURRENT = engine.currentTaxYear(rates, BUILD_DATE) || YEARS[YEARS.length - 1];
const NEXT = YEARS[YEARS.indexOf(CURRENT) + 1] || null;

const problems = [];
const warnings = [];

/* Formatting */

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function money(pence) {
  const abs = Math.abs(pence);
  const text = (abs / 100).toLocaleString('en-GB', { minimumFractionDigits: abs % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 });
  return `${pence < 0 ? '-' : ''}£${text}`;
}
const percent = (rate) => `${Math.round(rate * 1000) / 10}%`;
const longDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const yearLabel = (key) => (rates[key] ? rates[key].label : key.replace('-', '/'));
const yearKey = (alias) => ({ current: CURRENT, next: NEXT }[alias] || alias);
const lookup = (object, dotted) => dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);

function figure(raw, text, plain) {
  return plain ? text : `<data class="config-figure" value="${raw}">${text}</data>`;
}

/* Worked examples computed by the engine, so figures in the copy can never drift from the calculator */

function computeExamples(examples = {}, route) {
  const results = {};
  for (const [id, spec] of Object.entries(examples)) {
    const pence = (pounds) => Math.round((pounds || 0) * 100);
    const input = {
      taxYear: yearKey(spec.taxYear || 'current'),
      region: spec.region || 'england_wales_ni',
      otherIncome: pence(spec.otherIncome),
      properties: (spec.properties || []).map((p) => ({ rent: pence(p.rent), expenses: pence(p.expenses), financeCosts: pence(p.financeCosts) })),
      ownerShare: spec.ownerShare,
      partner: spec.partner ? { otherIncome: pence(spec.partner.otherIncome) } : null,
      lettingType: spec.lettingType,
      rentARoomShared: spec.rentARoomShared,
      reliefMode: spec.reliefMode || 'auto',
      lossesBroughtForward: pence(spec.lossesBroughtForward),
      financeCostsBroughtForward: pence(spec.financeCostsBroughtForward),
    };
    const result = engine.calculate(input, rates);
    if (!result.ok) {
      problems.push(`${route}: example "${id}" is invalid: ${JSON.stringify(result.errors)}`);
    }
    results[id] = result;
  }
  return results;
}

// Rental yield examples, so the yield calculator page opens showing real results before its script runs.
function computeYieldExamples(examples = {}, route) {
  const results = {};
  const pence = (pounds) => Math.round((pounds || 0) * 100);
  for (const [id, spec] of Object.entries(examples)) {
    const input = {
      price: pence(spec.price),
      monthlyRent: pence(spec.monthlyRent),
      runningCosts: pence(spec.runningCosts),
      lettingFeeRate: spec.lettingFeeRate || 0,
      voidWeeks: spec.voidWeeks || 0,
      buyingCosts: pence(spec.buyingCosts),
      mortgage: spec.mortgage || null,
      tax: spec.tax ? { taxYear: yearKey(spec.tax.taxYear || 'current'), region: spec.tax.region || 'england_wales_ni', otherIncome: pence(spec.tax.otherIncome) } : null,
    };
    const result = yieldEngine.calculate(input, { taxEngine: engine, rates });
    if (!result.ok) {
      problems.push(`${route}: yield example "${id}" is invalid: ${JSON.stringify(result.errors)}`);
    }
    results[id] = result;
  }
  return results;
}

const yieldPercent = (rate) => `${(Math.round(rate * 10000) / 100).toFixed(2)}%`;

// The stamp duty page opens showing a worked example, the same £250,000 additional property its form starts on.
const stampDutyExample = (() => {
  const price = 25000000;
  const result = purchaseTaxEngine.purchaseTax(price, 'england_ni', 'additional', purchaseRates);
  return { ...result, price, withTax: price + result.total };
})();

/* Tables and lists rendered from config */

function bandsTable(regionKey, alias) {
  const key = yearKey(alias);
  const year = rates[key];
  const region = year && year.regions[regionKey];
  if (!region) {
    return undefined;
  }
  const taperEnd = year.paTaperThreshold + year.personalAllowance * year.paTaperRate;
  const gross = (taxable) => (taxable >= taperEnd ? taxable : taxable + year.personalAllowance);
  const rows = region.bands.map((band, i) => {
    const lower = i === 0 ? 0 : region.bands[i - 1].upTo;
    const taxableRange = band.upTo === null
      ? `Over ${money(lower)}`
      : `${money(lower === 0 ? 0 : lower + 100)} to ${money(band.upTo)}`;
    const grossRange = band.upTo === null
      ? `Over ${money(gross(lower))}`
      : `${money(lower === 0 ? year.personalAllowance + 100 : gross(lower) + 100)} to ${money(gross(band.upTo))}`;
    return `<tr><th scope="row">${escapeHtml(band.name)}</th><td>${percent(band.rate)}</td><td>${taxableRange}</td><td>${grossRange}</td></tr>`;
  }).join('');
  const note = region.assumed && region.notes ? `<p class="data-table__note">${escapeHtml(region.notes)}</p>` : '';
  return `<div class="data-table" data-config="bands:${regionKey}:${key}">
  <table class="data-table__table">
    <caption class="data-table__caption">Income tax bands for ${year.label}, ${escapeHtml(region.label)}</caption>
    <thead><tr><th scope="col">Band</th><th scope="col">Rate</th><th scope="col">Taxable income</th><th scope="col">Total income, standard personal allowance</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${note}<p class="data-table__note">Last verified ${longDate(year.lastVerified)} against GOV.UK and HMRC.</p>
</div>`;
}

function propertyRatesTable(alias) {
  const key = yearKey(alias);
  const year = rates[key];
  const region = year && year.regions.england_wales_ni;
  if (!region || !region.propertyIncomeBands) {
    return undefined;
  }
  const rows = region.bands.map((band, i) => {
    const property = region.propertyIncomeBands[i];
    return `<tr><th scope="row">${escapeHtml(band.name)}</th><td>${percent(band.rate)}</td><td>${percent(property.rate)}</td></tr>`;
  }).join('');
  return `<div class="data-table" data-config="property-rates:${key}">
  <table class="data-table__table">
    <caption class="data-table__caption">Income tax rates from ${longDate(year.startDate)}, England, Wales and Northern Ireland</caption>
    <thead><tr><th scope="col">Band</th><th scope="col">Rate on salary, pension and trading income</th><th scope="col">Rate on property income</th></tr></thead>
    <tbody>${rows}<tr><th scope="row">Mortgage interest credit</th><td colspan="2">${percent(year.financeReliefRate)}</td></tr></tbody>
  </table>
  <p class="data-table__note">Last verified ${longDate(year.lastVerified)}. ${escapeHtml(region.notes || '')}</p>
</div>`;
}

function allowancesTable() {
  const head = YEARS.map((key) => `<th scope="col">${rates[key].label}</th>`).join('');
  const row = (label, cell) => `<tr><th scope="row">${label}</th>${YEARS.map((key) => `<td>${cell(rates[key])}</td>`).join('')}</tr>`;
  return `<div class="data-table" data-config="allowances">
  <table class="data-table__table">
    <caption class="data-table__caption">Allowances and reliefs for landlords</caption>
    <thead><tr><th scope="col">Allowance</th>${head}</tr></thead>
    <tbody>
      ${row('Personal allowance', (y) => money(y.personalAllowance))}
      ${row('Allowance starts to fall above', (y) => money(y.paTaperThreshold))}
      ${row('Property allowance', (y) => money(y.propertyAllowance))}
      ${row('Rent a Room limit', (y) => money(y.rentARoom))}
      ${row('Rent a Room limit, shared', (y) => money(y.rentARoomShared))}
      ${row('Mortgage interest credit', (y) => percent(y.financeReliefRate))}
    </tbody>
  </table>
  <p class="data-table__note">Last verified ${longDate(rates[CURRENT].lastVerified)} against GOV.UK and HMRC.</p>
</div>`;
}

function mtdTable() {
  const rows = mtd.phases.map((phase) => `<tr><td>Over ${money(phase.threshold)}</td><td>${yearLabel(phase.testYear)}</td><td>${longDate(phase.startDate)}</td></tr>`).join('');
  return `<div class="data-table" data-config="mtd">
  <table class="data-table__table">
    <caption class="data-table__caption">When Making Tax Digital for Income Tax applies</caption>
    <thead><tr><th scope="col">Qualifying income</th><th scope="col">Based on your tax return for</th><th scope="col">You must use it from</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="data-table__note">${escapeHtml(mtd.qualifyingIncomeBasis)} Last verified ${longDate(mtd.lastVerified)}.</p>
</div>`;
}

function expensesList() {
  const items = expenses.categories.map((c) => `<div class="expense-list__item"><dt class="expense-list__term">${escapeHtml(c.label)}</dt><dd class="expense-list__detail">${escapeHtml(c.tooltip)}</dd></div>`).join('');
  return `<dl class="expense-list" data-config="expenses">${items}</dl>`;
}

/* Navigation */

const pathName = new Map([
  ...site.tools.map((t) => [t.path, t.name]),
  ...site.guides.map((g) => [g.path, g.name]),
  [site.whoWeCanHelp.path, site.whoWeCanHelp.name],
  ...site.whoWeCanHelp.children.map((c) => [c.path, c.name]),
  [site.ourServices.path, site.ourServices.name],
  ...site.ourServices.children.map((c) => [c.path, c.name]),
  ...site.company.map((c) => [c.path, c.name]),
]);

function navLink(className, name, target, ctx) {
  const current = target === ctx.route ? ' aria-current="page"' : '';
  return `<a class="${className}" href="${ctx.root}${target}"${current}>${escapeHtml(name)}</a>`;
}

function navGroup(id, label, links, ctx) {
  const items = links.map(([name, target]) => `<li class="site-nav__menu-item">${navLink('site-nav__menu-link', name, target, ctx)}</li>`).join('');
  const holdsCurrent = links.some(([, target]) => target === ctx.route) ? ' data-current="true"' : '';
  return `<li class="site-nav__item">
        <button class="site-nav__toggle" type="button" aria-expanded="false" aria-controls="menu-${id}"${holdsCurrent}>${escapeHtml(label)}</button>
        <ul class="site-nav__menu" id="menu-${id}">${items}</ul>
      </li>`;
}

function renderNav(ctx) {
  const live = site.tools.filter((t) => t.status === 'live');
  const header = site.header || {};
  const items = [`<li class="site-nav__item">${navLink('site-nav__link', header.homeLabel || 'Home', '', ctx)}</li>`];
  if (live.length === 1) {
    items.push(`<li class="site-nav__item">${navLink('site-nav__link', 'Calculators', live[0].path, ctx)}</li>`);
  } else if (live.length > 1) {
    items.push(navGroup('calculators', 'Calculators', live.map((t) => [t.name, t.path]), ctx));
  }
  items.push(navGroup('guides', 'Guides', site.guides.map((g) => [g.name, g.path]), ctx));
  // Who we can help is listed in the footer only.
  const parent = (section) => [[section.name, section.path], ...section.children.map((c) => [c.name, c.path])];
  items.push(navGroup('our-services', site.ourServices.name, parent(site.ourServices), ctx));
  const contact = site.company.find((c) => c.path === 'contact/');
  items.push(`<li class="site-nav__item">${navLink('site-nav__link', contact.name, contact.path, ctx)}</li>`);
  if (header.cta) {
    items.push(`<li class="site-nav__item">${navLink('site-nav__cta', header.cta.label, header.cta.path, ctx)}</li>`);
  }
  return `<ul class="site-nav__list">
      ${items.join('\n      ')}
    </ul>`;
}

function footerColumn(heading, links, ctx) {
  if (!links.length) {
    return '';
  }
  const items = links.map((l) => `<li class="site-footer__item">${navLink('site-footer__link', l.name, l.path, ctx)}</li>`).join('');
  return `<details class="site-footer__group" open>
        <summary class="site-footer__heading">${escapeHtml(heading)}</summary>
        <ul class="site-footer__list">${items}</ul>
      </details>`;
}

function renderFooterColumns(ctx) {
  return [
    footerColumn('Calculators', site.tools.filter((t) => t.status === 'live'), ctx),
    footerColumn(site.whoWeCanHelp.name, site.whoWeCanHelp.children, ctx),
    footerColumn(site.ourServices.name, site.ourServices.children, ctx),
    footerColumn('Company', site.company, ctx),
  ].join('\n      ');
}

const SOCIAL_ICONS = {
  LinkedIn: '<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3zM9.5 9.5h3.8v1.6h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.6 4.8 6V21h-4v-5.2c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4z"/>',
  Facebook: '<path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.2A21 21 0 0 0 14.6 2C12.2 2 10.6 3.5 10.6 6.2v2.3H8V12h2.6v10H14V12h2.7l.4-3.5z"/>',
  X: '<path d="M17.7 3H21l-7.2 8.2L22 21h-6.6l-5.2-6.4L4.3 21H1l7.7-8.8L1 3h6.8l4.7 5.9zm-1.2 16h1.8L6.6 4.9H4.7z"/>',
  YouTube: '<path d="M22.5 7.2a2.8 2.8 0 0 0-2-2C18.8 4.8 12 4.8 12 4.8s-6.8 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 4.8 2.8 2.8 0 0 0 2 2c1.7.4 8.5.4 8.5.4s6.8 0 8.5-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-4.8zM9.8 15V9l5.7 3z"/>',
};

function renderFooterLegal() {
  const social = site.social.filter((s) => s.enabled && s.url);
  const socialList = social.length
    ? `<ul class="site-footer__social">${social.map((s) => `<li class="site-footer__social-item"><a class="site-footer__social-link" href="${escapeHtml(s.url)}" rel="me noopener"><svg class="site-footer__social-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${SOCIAL_ICONS[s.platform] || ''}</svg><span class="site-footer__social-name">${escapeHtml(s.platform)}</span></a></li>`).join('')}</ul>`
    : '';
  return `<p class="site-footer__copyright">© ${BUILD_DATE.slice(0, 4)} ${escapeHtml(site.legal.copyrightHolder)}</p>
      <p class="site-footer__compliance">${escapeHtml(site.legal.compliance)}</p>
      ${socialList}`;
}

/* Guide images: a featured image on each guide page and image cards on the home page */

function guideFor(route) {
  return site.guides.find((g) => g.path === route && g.image);
}

// Each guide image exists as <image>.webp (1200 wide), <image>-600.webp and <image>.jpg for browsers without WebP.
function pictureHtml(guide, ctx, options) {
  const base = `${ctx.root}${guide.image}`;
  const srcset = options.small ? `${base}-600.webp` : `${base}-600.webp 600w, ${base}.webp 1200w`;
  const sizes = options.sizes ? ` sizes="${options.sizes}"` : '';
  const loading = options.eager ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<picture><source type="image/webp" srcset="${srcset}"${sizes}><img class="${options.className}" src="${base}.jpg" width="1200" height="630" alt="${escapeHtml(options.alt)}"${loading} decoding="async"></picture>`;
}

function featuredImage(ctx) {
  const guide = guideFor(ctx.route);
  if (!guide) {
    return undefined;
  }
  return `<figure class="intro__figure">${pictureHtml(guide, ctx, { className: 'intro__image', sizes: '(min-width: 48em) 44rem, 100vw', alt: guide.imageAlt || '', eager: true })}</figure>`;
}

function guideCards(ctx) {
  return site.guides.filter((g) => g.image).map((g) => `<a class="post-card" href="${ctx.root}${g.path}">
        ${pictureHtml(g, ctx, { className: 'post-card__image', small: true, alt: '' })}
        <span class="post-card__tag">Guide</span>
        <h3 class="post-card__title">${escapeHtml(g.name)}</h3>
        <p class="post-card__text">${escapeHtml(g.summary || '')}</p>
        <span class="post-card__more">Read the guide</span>
      </a>`).join('\n      ');
}

/* Tokens */

function renderToken(name, arg, ctx) {
  const plain = ctx.plain;
  switch (name) {
    case 'root':
      return ctx.root;
    case 'site': {
      const value = lookup(site, arg);
      return value === undefined ? undefined : escapeHtml(value);
    }
    case 'verified':
      return longDate(rates[CURRENT].lastVerified);
    case 'purchase-verified':
      return longDate(purchaseRates.lastVerified);
    case 'label':
      return rates[yearKey(arg)] ? rates[yearKey(arg)].label : undefined;
    case 'money':
    case 'pct':
    case 'date': {
      const [alias, ...rest] = arg.split('.');
      const year = rates[yearKey(alias)];
      const raw = year && lookup(year, rest.join('.'));
      if (raw === undefined || raw === null) {
        return undefined;
      }
      if (name === 'date') {
        return longDate(raw);
      }
      return figure(raw, name === 'money' ? money(raw) : percent(raw), plain);
    }
    case 'mtd-money': {
      const raw = lookup(mtd.phases, arg);
      return raw === undefined ? undefined : figure(raw, money(raw), plain);
    }
    case 'mtd-date': {
      const raw = lookup(mtd.phases, arg);
      return raw === undefined ? undefined : longDate(raw);
    }
    case 'mtd-year': {
      const raw = lookup(mtd.phases, arg);
      return raw === undefined ? undefined : yearLabel(raw);
    }
    case 'calc':
    case 'calc-pct': {
      const [id, ...rest] = arg.split('.');
      const raw = ctx.examples[id] && lookup(ctx.examples[id], rest.join('.'));
      if (typeof raw !== 'number') {
        return undefined;
      }
      return name === 'calc' ? money(raw) : percent(raw);
    }
    case 'calc-month': {
      const [id, ...rest] = arg.split('.');
      const raw = ctx.examples[id] && lookup(ctx.examples[id], rest.join('.'));
      if (typeof raw !== 'number') {
        return undefined;
      }
      return `£${(Math.round(raw / 12) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    case 'calc-band': {
      const [id, ...rest] = arg.split('.');
      const result = ctx.examples[id] && lookup(ctx.examples[id], rest.join('.'));
      if (!result || typeof result.marginalRate !== 'number') {
        return undefined;
      }
      return result.marginalBandName ? `${escapeHtml(result.marginalBandName)}, ${percent(result.marginalRate)}` : 'Within your personal allowance';
    }
    case 'calc-year-options':
      return YEARS.map((key) => `<option value="${key}"${key === CURRENT ? ' selected' : ''}>${rates[key].label}${rates[key].isForecast ? ' (future year)' : ''}</option>`).join('');
    case 'calc-region-options':
      return Object.entries(rates[CURRENT].regions)
        .map(([key, region], i) => `<option value="${key}"${i === 0 ? ' selected' : ''}>${escapeHtml(region.label)}</option>`).join('');
    case 'links':
      if (arg !== 'guides') {
        return undefined;
      }
      return site.guides
        .filter((guide) => guide.path !== ctx.route)
        .map((guide) => `<a class="related__link" href="${ctx.root}${guide.path}">${escapeHtml(guide.name)}</a>`)
        .join('\n        ');
    case 'calc-diff': {
      const [a, b] = arg.split('|').map((part) => {
        const [id, ...rest] = part.trim().split('.');
        return ctx.examples[id] && lookup(ctx.examples[id], rest.join('.'));
      });
      return typeof a === 'number' && typeof b === 'number' ? money(a - b) : undefined;
    }
    case 'include': {
      const file = path.join(SRC, 'partials', `${arg}.html`);
      return fs.existsSync(file) ? fill(fs.readFileSync(file, 'utf8'), ctx) : undefined;
    }
    case 'breadcrumb':
      return ctx.breadcrumbHtml;
    case 'table': {
      const [kind, a, b] = arg.split(':');
      if (kind === 'bands') return bandsTable(a, b || 'current');
      if (kind === 'property-rates') return propertyRatesTable(a || 'next');
      if (kind === 'allowances') return allowancesTable();
      if (kind === 'mtd') return mtdTable();
      return undefined;
    }
    case 'list': {
      if (arg === 'expenses') {
        return expensesList();
      }
      const tool = arg.startsWith('capabilities:') && site.tools.find((t) => t.id === arg.slice('capabilities:'.length));
      return tool ? tool.capabilities.map((c) => `<li class="feature__item">${escapeHtml(c)}</li>`).join('') : undefined;
    }
    case 'ymoney':
    case 'ypct':
    case 'ycover': {
      const [id, ...rest] = arg.split('.');
      const raw = ctx.yieldExamples && ctx.yieldExamples[id] && lookup(ctx.yieldExamples[id], rest.join('.'));
      if (typeof raw !== 'number') {
        return undefined;
      }
      if (name === 'ymoney') {
        // Whole pounds, as the yield calculator's script shows them, so nothing changes when it loads.
        const pounds = Math.round(Math.abs(raw) / 100);
        return `${raw < 0 && pounds > 0 ? '-' : ''}£${pounds.toLocaleString('en-GB')}`;
      }
      return name === 'ypct' ? yieldPercent(raw) : `${Math.round(raw * 100)}%`;
    }
    case 'sdlt':
    case 'sdlt-pct': {
      const [id, ...rest] = arg.split('.');
      if (id !== 'example') {
        return undefined;
      }
      const raw = lookup(stampDutyExample, rest.join('.'));
      if (typeof raw !== 'number') {
        return undefined;
      }
      return name === 'sdlt' ? money(raw) : yieldPercent(raw);
    }
    case 'sdlt-band': {
      const rule = purchaseRates.nations[arg];
      return rule ? money(rule.limits[0]) : undefined;
    }
    case 'sdlt-money': {
      const raw = lookup(purchaseRates, arg);
      return typeof raw === 'number' ? money(raw) : undefined;
    }
    case 'year-key':
      return rates[yearKey(arg)] ? yearKey(arg) : undefined;
    case 'calc-pct-value': {
      const [id, ...rest] = arg.split('.');
      const raw = ctx.examples[id] && lookup(ctx.examples[id], rest.join('.'));
      return typeof raw === 'number' ? String(Math.round(raw * 1000) / 10) : undefined;
    }
    case 'guide-cards':
      return guideCards(ctx);
    case 'featured-image':
      return featuredImage(ctx);
    case 'nav':
      return renderNav(ctx);
    case 'footer-columns':
      return renderFooterColumns(ctx);
    case 'footer-legal':
      return renderFooterLegal();
    default:
      return undefined;
  }
}

function fill(html, ctx) {
  return html.replace(/\{\{\s*([a-z-]+)(?::([^}]*?))?\s*\}\}/gi, (whole, name, arg = '') => {
    const out = renderToken(name, arg.trim(), ctx);
    if (out === undefined) {
      problems.push(`${ctx.route || 'fragment'}: cannot resolve ${whole}`);
      return whole;
    }
    return out;
  });
}

/* Pages */

function findPages(dir, base = '') {
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      pages.push(...findPages(full, `${base}${entry.name}/`));
    } else if (entry.name.endsWith('.html')) {
      pages.push({ file: full, route: entry.name === 'index.html' ? base : `${base}${entry.name}` });
    }
  }
  return pages;
}

function parsePage(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const match = raw.match(/^<!--page\s*([\s\S]*?)-->\s*/);
  if (!match) {
    throw new Error(`${file} needs a <!--page { ... } --> header`);
  }
  return { meta: JSON.parse(match[1]), body: raw.slice(match[0].length) };
}

function breadcrumbFor(route, meta) {
  if (!route || route.endsWith('.html')) {
    return [];
  }
  const segments = route.split('/').filter(Boolean);
  const trail = [{ name: 'Home', path: '' }];
  segments.forEach((_, i) => {
    const target = `${segments.slice(0, i + 1).join('/')}/`;
    const last = i === segments.length - 1;
    trail.push({ name: last ? (meta.crumb || pathName.get(target) || meta.title) : (pathName.get(target) || segments[i]), path: target });
  });
  return trail;
}

function breadcrumbHtml(trail, ctx) {
  if (!trail.length) {
    return '';
  }
  const parts = trail.map((item, i) => (i === trail.length - 1
    ? `<span class="breadcrumb__current" aria-current="page">${escapeHtml(item.name)}</span>`
    : `<a class="breadcrumb__link" href="${ctx.root}${item.path}">${escapeHtml(item.name)}</a><span class="breadcrumb__separator" aria-hidden="true">/</span>`));
  return `<nav class="breadcrumb" aria-label="Breadcrumb">${parts.join('')}</nav>`;
}

function faqSchema(html) {
  const items = [...html.matchAll(/<details class="faq__item"[^>]*>\s*<summary class="faq__question">([\s\S]*?)<\/summary>\s*<div class="faq__answer">([\s\S]*?)<\/div>\s*<\/details>/g)];
  return items.map((m) => ({
    '@type': 'Question',
    name: stripTags(m[1]),
    acceptedAnswer: { '@type': 'Answer', text: stripTags(m[2]) },
  }));
}

function howToSchema(html) {
  const items = [...html.matchAll(/<li class="steps__item">\s*<h3 class="steps__title">([\s\S]*?)<\/h3>\s*<p class="steps__text">([\s\S]*?)<\/p>\s*<\/li>/g)];
  return items.map((m, i) => ({ '@type': 'HowToStep', position: i + 1, name: stripTags(m[1]), text: stripTags(m[2]) }));
}

function schemaGraph(meta, route, url, trail, body) {
  const orgId = `${site.brand.url}/#organization`;
  const graph = [
    { '@type': 'Organization', '@id': orgId, name: site.brand.name, url: `${site.brand.url}/`, logo: `${site.brand.url}/${site.brand.logoPng}`, email: site.contact.email, address: site.contact.address ? { '@type': 'PostalAddress', ...site.contact.address } : undefined },
    { '@type': 'WebSite', '@id': `${site.brand.url}/#website`, name: site.brand.name, url: `${site.brand.url}/`, publisher: { '@id': orgId }, inLanguage: 'en-GB' },
  ];
  if (trail.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: trail.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: `${site.brand.url}/${item.path}` })),
    });
  }
  const types = meta.schema || [];
  if (types.includes('WebApplication')) {
    const tool = site.tools.find((t) => t.path === route);
    graph.push({
      '@type': 'WebApplication',
      name: tool ? tool.name : meta.title,
      url,
      description: meta.description,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
      featureList: tool ? tool.capabilities : undefined,
      publisher: { '@id': orgId },
    });
  }
  if (types.includes('FAQPage')) {
    const questions = faqSchema(body);
    if (questions.length) {
      graph.push({ '@type': 'FAQPage', mainEntity: questions });
    } else {
      problems.push(`${route}: FAQPage schema requested but no faq__item blocks found`);
    }
  }
  if (types.includes('HowTo')) {
    const steps = howToSchema(body);
    if (steps.length) {
      graph.push({ '@type': 'HowTo', name: meta.howToName || meta.title, description: meta.description, step: steps });
    } else {
      problems.push(`${route}: HowTo schema requested but no steps__item blocks found`);
    }
  }
  if (types.includes('Service') && meta.service) {
    graph.push({ '@type': 'Service', name: meta.service.name, serviceType: meta.service.serviceType, description: meta.description, areaServed: { '@type': 'Country', name: 'United Kingdom' }, provider: { '@id': orgId }, url });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2).replace(/</g, '\\u003c');
}

function checkBody(route, html) {
  const h1s = (html.match(/<h1[\s>]/g) || []).length;
  if (h1s !== 1) {
    problems.push(`${route}: expected exactly one <h1>, found ${h1s}`);
  }
  for (const tag of html.match(/<section\b[^>]*>/g) || []) {
    if (!/data-section="[^"]+"/.test(tag)) {
      problems.push(`${route}: section without a data-section name: ${tag}`);
    }
  }
}

function renderPage(page) {
  const { meta, body } = parsePage(page.file);
  const route = page.route;
  const is404 = route === '404.html';
  const depth = route.split('/').filter(Boolean).length;
  const root = is404 ? site.basePath : depth === 0 ? './' : '../'.repeat(depth);
  const url = `${site.brand.url}/${is404 ? '' : route}`;
  const trail = breadcrumbFor(route, meta);
  const ctx = { route, root, examples: computeExamples(meta.examples, route), yieldExamples: computeYieldExamples(meta.yieldExamples, route), plain: false };
  ctx.breadcrumbHtml = breadcrumbHtml(trail, ctx);
  const plainCtx = { ...ctx, plain: true };

  const title = fill(meta.title, plainCtx);
  const description = fill(meta.description, plainCtx);
  const content = fill(body, ctx);
  checkBody(route, content);

  const header = fill(readText('src/partials/header.html'), ctx);
  const footer = fill(readText('src/partials/footer.html'), ctx);
  const styles = ['tokens', 'base', 'layout', ...(meta.styles || [])]
    .map((name) => `<link rel="stylesheet" href="${root}assets/css/${name}.css">`).join('\n  ');
  const scripts = [...(meta.scripts || []), 'site']
    .map((name) => `<script src="${root}assets/js/${name}.js" defer></script>`).join('\n');
  const inlineData = (meta.data || [])
    .map((name) => `<script type="application/json" id="cmt-config-${name}">${JSON.stringify(CONFIG[name]).replace(/</g, '\\u003c')}</script>`).join('\n');
  const robots = meta.noindex ? 'noindex, follow' : 'index, follow';
  const guide = guideFor(route);
  const image = guide ? `${site.brand.url}/${guide.image}.jpg` : `${site.brand.url}/${site.brand.socialImage}`;

  const html = `<!doctype html>
<html lang="en-GB" class="no-js">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${robots}">
  ${is404 ? '' : `<link rel="canonical" href="${url}">`}
  <meta property="og:type" content="${meta.ogType || 'website'}">
  <meta property="og:site_name" content="${escapeHtml(site.brand.name)}">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${image}">
  <meta name="theme-color" content="${site.brand.themeColour}">
  <link rel="icon" href="${root}assets/img/brand/favicon-32.png" sizes="32x32" type="image/png">
  <link rel="icon" href="${root}assets/img/brand/icon-512.png" sizes="512x512" type="image/png">
  <link rel="apple-touch-icon" href="${root}assets/img/brand/apple-touch-icon.png">
  <link rel="preload" href="${root}assets/fonts/atkinson-hyperlegible-next-latin.woff2" as="font" type="font/woff2" crossorigin>
  ${styles}
  <link rel="stylesheet" href="${root}assets/css/print.css" media="print">
  <script>document.documentElement.className = document.documentElement.className.replace('no-js', 'js');</script>
  <script type="application/ld+json">
${schemaGraph(meta, route, url, trail, content)}
  </script>
</head>
<body class="site-body">
<a class="skip-link" href="#main">Skip to main content</a>
${header}
<main class="site-main" id="main">
${content}
</main>
${footer}
${inlineData}
${scripts}
</body>
</html>
`;
  return { route, meta, title, description, url, html, is404 };
}

/* Output */

function hrefsIn(html) {
  return [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
}

function checkLinks(built, routes) {
  for (const page of built) {
    const base = page.is404 ? '/' : `/${page.route}`;
    for (const value of hrefsIn(page.html)) {
      if (/^(https?:|mailto:|tel:|#|data:)/.test(value)) {
        continue;
      }
      const clean = value.split('#')[0].split('?')[0];
      const resolved = page.is404
        ? clean.slice(site.basePath.length - 1)
        : path.posix.normalize(path.posix.join(base, clean));
      const target = resolved.replace(/^\//, '');
      const exists = target === '' || target.endsWith('/')
        ? routes.has(target)
        : fs.existsSync(path.join(CHECK_ONLY ? ROOT : OUT, target));
      if (!exists) {
        problems.push(`${page.route || '(home)'}: broken link ${value}`);
      }
    }
  }
}

function checkKeywords(built) {
  const seen = new Map();
  for (const page of built) {
    const keyword = page.meta.keyword && page.meta.keyword.toLowerCase();
    if (!keyword) {
      continue;
    }
    if (seen.has(keyword)) {
      problems.push(`keyword "${keyword}" targeted by both ${seen.get(keyword)} and ${page.route}`);
    }
    seen.set(keyword, page.route || '(home)');
    if (page.title.length > 60) {
      warnings.push(`${page.route || '(home)'}: title is ${page.title.length} characters`);
    }
    if (page.description.length < 110 || page.description.length > 160) {
      warnings.push(`${page.route || '(home)'}: description is ${page.description.length} characters`);
    }
  }
}

function writeFile(rel, text) {
  if (CHECK_ONLY) {
    return;
  }
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function main() {
  if (!CHECK_ONLY) {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    // The original logo upload is a source file for build/asset-studio.html, not a published asset.
    const logoSource = site.brand.logoSource ? path.join(ROOT, site.brand.logoSource) : null;
    fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true, filter: (from) => from !== logoSource });
    fs.cpSync(path.join(ROOT, 'data'), path.join(OUT, 'data'), { recursive: true });
  }

  const built = findPages(path.join(SRC, 'pages')).map(renderPage);
  const routes = new Set(built.filter((p) => !p.is404).map((p) => p.route));
  for (const page of built) {
    writeFile(page.is404 ? '404.html' : `${page.route}index.html`, page.html);
  }

  const indexable = built.filter((p) => !p.is404 && !p.meta.noindex);
  writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${indexable.map((p) => `  <url><loc>${p.url}</loc><lastmod>${BUILD_DATE}</lastmod></url>`).join('\n')}
</urlset>
`);

  writeFile('robots.txt', `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

Sitemap: ${site.brand.url}/sitemap.xml
`);

  const byRoute = new Map(built.map((p) => [p.route, p]));
  const entry = (target) => {
    const page = byRoute.get(target);
    return page ? `- [${pathName.get(target) || page.title}](${page.url}): ${page.description}` : null;
  };
  writeFile('llms.txt', `# ${site.brand.name}

> ${site.brand.description}

Every figure comes from published GOV.UK, HMRC and gov.scot rates, last verified ${longDate(rates[CURRENT].lastVerified)}. Tax years covered: ${YEARS.map((k) => rates[k].label + (rates[k].isForecast ? ' (future year, some figures assumed)' : '')).join(', ')}. Results are estimates, not tax advice.

## Calculators

${site.tools.filter((t) => t.status === 'live').map((t) => `${entry(t.path)}\n${t.capabilities.map((c) => `  - ${c}`).join('\n')}`).join('\n')}

## Guides

${site.guides.map((g) => entry(g.path)).filter(Boolean).join('\n')}

## Who we can help and services

${[site.whoWeCanHelp.path, ...site.whoWeCanHelp.children.map((c) => c.path), site.ourServices.path, ...site.ourServices.children.map((c) => c.path)].map(entry).filter(Boolean).join('\n')}

## Company

${site.company.map((c) => entry(c.path)).filter(Boolean).join('\n')}

Contact: ${site.contact.email}
`);
  writeFile('.nojekyll', '');
  if (site.customDomain) {
    writeFile('CNAME', `${site.customDomain}\n`);
  }

  checkLinks(built, routes);
  checkKeywords(built);

  for (const w of warnings) console.warn(`warning  ${w}`);
  if (problems.length) {
    for (const p of problems) console.error(`problem  ${p}`);
    console.error(`\nBuilt ${built.length} pages with ${problems.length} problem(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Built ${built.length} pages into docs/ for ${BUILD_DATE} (tax year ${rates[CURRENT].label}). No problems.`);
  }
}

main();
