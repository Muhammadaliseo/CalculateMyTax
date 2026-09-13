// Dev-only quality audit of the built site in docs/ and the stylesheets in assets/css.
// Usage: npm run build && node build/audit.mjs > handover/audit-checks.md

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const CSS_DIR = path.join(ROOT, 'assets', 'css');
const out = [];
const say = (line = '') => out.push(line);
let failures = 0;
const verdict = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  say(`- ${ok ? 'PASS' : 'FAIL'}: ${label}${detail ? ` ${detail}` : ''}`);
};

function walk(dir, test) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, test) : test(entry.name) ? [full] : [];
  });
}

/* 1. Stylesheets read tokens only */

say('## Stylesheets');
const cssFiles = fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css'));
const rawFindings = [];
for (const name of cssFiles.filter((f) => f !== 'tokens.css')) {
  const source = fs.readFileSync(path.join(CSS_DIR, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  const lines = source.split('\n');
  let inFontFace = false;
  lines.forEach((line, i) => {
    const code = line;
    // @font-face descriptors and the @page print margin cannot read custom properties, so they are exempt.
    if (/@font-face|@page/.test(code)) inFontFace = true;
    if (inFontFace && /\}/.test(code)) { inFontFace = false; return; }
    const where = `${name}:${i + 1}`;
    if (/#[0-9a-fA-F]{3,8}\b/.test(code)) rawFindings.push(`${where} raw hex colour: ${code.trim()}`);
    if (/\b(rgb|rgba|hsl|hsla)\(/.test(code)) rawFindings.push(`${where} raw colour function: ${code.trim()}`);
    if (/font-family\s*:/.test(code) && !inFontFace && !/var\(--font-|inherit/.test(code)) rawFindings.push(`${where} raw font stack: ${code.trim()}`);
    if (!/^\s*@media/.test(code) && !inFontFace) {
      const property = code.split(':')[0];
      const lengths = code.match(/(?<![\w-])-?\d*\.?\d+(px|rem|em|ch|mm|vw|vh)\b/g);
      if (lengths && !/^\s*--/.test(property)) rawFindings.push(`${where} raw length ${lengths.join(', ')}: ${code.trim()}`);
    }
  });
}
verdict(rawFindings.length === 0, 'no raw hex values, colour functions, font stacks or lengths outside tokens.css', rawFindings.length ? `(${rawFindings.length} found)` : '');
rawFindings.forEach((f) => say(`  - ${f}`));

const allCss = cssFiles.map((f) => [f, fs.readFileSync(path.join(CSS_DIR, f), 'utf8')]);
const gridUses = allCss.flatMap(([f, text]) => text.split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => /display\s*:\s*(inline-)?grid/.test(l)));
verdict(true, `CSS Grid used ${gridUses.length} time(s)`, gridUses.map(([f, n]) => `${f}:${n}`).join(', '));
const forbidden = allCss.flatMap(([f, text]) => ['\\:has\\(', '@container', 'clip-path', 'animation-timeline', 'scroll-timeline', 'view-timeline'].filter((p) => new RegExp(p).test(text)).map((p) => `${f} uses ${p.replace(/\\/g, '')}`));
verdict(forbidden.length === 0, 'no :has(), container queries, clip-path or scroll-driven animation', forbidden.join('; '));

/* 2. Built pages */

const pages = walk(DOCS, (n) => n.endsWith('.html')).sort();
say('');
say(`## Built pages (${pages.length})`);

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const CONTAINERS = new Set(['div', 'section', 'aside', 'form', 'fieldset', 'details', 'nav', 'header', 'footer', 'dl', 'ul', 'ol']);

const multiClass = new Set();
const utility = new Set();
const structure = [];
const depthReport = [];
const weights = [];
const headingIssues = [];
const placeholders = [];
const imageIssues = [];
const schemaIssues = [];
const external = new Set();
const titles = new Map();
const descriptions = new Map();

for (const file of pages) {
  const rel = path.relative(DOCS, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');
  const body = html.slice(html.indexOf('<body'));

  for (const m of html.matchAll(/\sclass="([^"]*)"/g)) {
    const tokens = m[1].trim().split(/\s+/);
    if (tokens.length > 1) multiClass.add(`${rel}: "${m[1]}"`);
    tokens.filter((t) => /^(m[trblxy]?|p[trblxy]?|w|h|text|bg|flex|grid|col|row|gap|d|font|leading|tracking|rounded|shadow|border)-[\w-]+$/.test(t)).forEach((t) => utility.add(`${rel}: ${t}`));
  }

  // Tag walk for section structure and nesting depth
  const stack = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g)) {
    const [, closing, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (tag === 'template' && !closing) { stack.push({ tag, template: true, children: [] }); continue; }
    if (stack.some((s) => s.template) && tag !== 'template') continue;
    if (closing) {
      const node = stack.pop();
      if (node && node.tag === 'section') {
        const elements = node.children;
        const onlyWrap = elements.length === 1 && elements[0].tag === 'div' && /__wrap$/.test(elements[0].cls || '');
        if (!onlyWrap || !node.name) structure.push(`${rel}: section "${node.name || '(no name)'}" has ${elements.length} child element(s)${elements[0] ? `, first <${elements[0].tag} class="${elements[0].cls || ''}">` : ''}`);
        depthReport.push([rel, node.name, node.maxDepth || 0]);
      }
      continue;
    }
    const cls = (attrs.match(/class="([^"]*)"/) || [])[1];
    const name = (attrs.match(/data-section="([^"]*)"/) || [])[1];
    const node = { tag, cls, name, children: [], maxDepth: 0 };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    const section = [...stack].reverse().find((s) => s.tag === 'section');
    if (section && CONTAINERS.has(tag)) {
      const index = stack.indexOf(section);
      const depth = stack.slice(index + 2).filter((s) => CONTAINERS.has(s.tag)).length + 1;
      section.maxDepth = Math.max(section.maxDepth, depth);
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(node);
  }

  // Weight: HTML plus linked CSS, JS and images, excluding fonts
  // A srcset counts its largest candidate, as a high-density screen downloads it. The <img> fallback inside a
  // <picture> is skipped, because browsers that take the WebP source never fetch it.
  const srcsetLargest = [...html.matchAll(/\ssrcset="([^"]+)"/g)].map((m) => m[1].split(',').map((c) => c.trim().split(/\s+/)[0]).pop());
  const withoutFallbacks = html.replace(/(<picture>[\s\S]*?)<img\b[^>]*>/g, '$1');
  const assets = new Set([...[...withoutFallbacks.matchAll(/\s(?:href|src)="([^"]+\.(?:css|js|png|webp|svg))"/g)].map((m) => m[1]), ...srcsetLargest].filter((u) => !/^https?:/.test(u)));
  let bytes = Buffer.byteLength(html);
  for (const asset of assets) {
    const target = path.normalize(path.join(path.dirname(file), asset));
    if (fs.existsSync(target) && !/favicon|apple-touch|icon-512/.test(asset)) bytes += fs.statSync(target).size;
  }
  weights.push([rel, Math.round(bytes / 1024)]);

  const levels = [...body.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));
  levels.forEach((level, i) => { if (i > 0 && level > levels[i - 1] + 1) headingIssues.push(`${rel}: h${levels[i - 1]} followed by h${level}`); });

  const visible = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<template[\s\S]*?<\/template>/g, '').replace(/placeholder="[^"]*"/g, '');
  if (/lorem ipsum|\bTODO\b|\bTBC\b|\bXXX\b|\[insert|coming soon|placeholder text/i.test(visible)) placeholders.push(rel);

  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\swidth="\d+"/.test(m[0]) || !/\sheight="\d+"/.test(m[0])) imageIssues.push(`${rel}: ${m[0].slice(0, 80)}`);

  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { schemaIssues.push(`${rel}: ${e.message}`); }
  }

  const loaded = [
    ...html.matchAll(/<script\b[^>]*\ssrc="(https?:[^"]+)"/g),
    ...html.matchAll(/<link\b(?=[^>]*\srel="(?:stylesheet|preload|modulepreload|icon|apple-touch-icon)")[^>]*\shref="(https?:[^"]+)"/g),
  ];
  for (const m of loaded) external.add(`${rel}: ${m[1]}`);

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const description = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!rel.startsWith('404')) {
    titles.set(title, [...(titles.get(title) || []), rel]);
    descriptions.set(description, [...(descriptions.get(description) || []), rel]);
  }
}

verdict(multiClass.size === 0, 'one class per element (no class soup)', multiClass.size ? `(${multiClass.size})` : '');
[...multiClass].slice(0, 20).forEach((f) => say(`  - ${f}`));
verdict(utility.size === 0, 'no utility classes');
[...utility].slice(0, 20).forEach((f) => say(`  - ${f}`));
verdict(structure.length === 0, 'every section is named and holds exactly one __wrap div', structure.length ? `(${structure.length})` : '');
structure.forEach((f) => say(`  - ${f}`));
const deep = depthReport.filter(([, , d]) => d > 2);
verdict(true, `container nesting inside wraps: ${deep.length} section(s) deeper than two levels`, deep.length ? '(listed for the migration notes)' : '');
[...new Set(deep.map(([, name, d]) => `${name}: ${d} levels`))].forEach((f) => say(`  - ${f}`));
verdict(external.size === 0, 'no third-party scripts or stylesheets', external.size ? [...external].join('; ') : '');
const heavy = weights.filter(([, kb]) => kb > 300);
verdict(heavy.length === 0, 'every page under 300 KB excluding fonts', `(largest ${weights.reduce((a, b) => (b[1] > a[1] ? b : a))[0]} at ${Math.max(...weights.map((w) => w[1]))} KB)`);
verdict(headingIssues.length === 0, 'no skipped heading levels', headingIssues.join('; '));
verdict(placeholders.length === 0, 'no placeholder text', placeholders.join(', '));
verdict(imageIssues.length === 0, 'every image has width and height', imageIssues.join('; '));
verdict(schemaIssues.length === 0, 'all JSON-LD parses', schemaIssues.join('; '));
const dupTitles = [...titles].filter(([, list]) => list.length > 1);
const dupDescriptions = [...descriptions].filter(([, list]) => list.length > 1);
verdict(dupTitles.length === 0 && dupDescriptions.length === 0, 'titles and descriptions are unique', [...dupTitles, ...dupDescriptions].map(([t, l]) => `${t} on ${l.join(', ')}`).join('; '));

say('');
say('### Page weight (KB, excluding fonts)');
weights.forEach(([rel, kb]) => say(`- ${rel}: ${kb}`));

/* 3. Contrast from tokens.css */

const tokens = Object.fromEntries([...fs.readFileSync(path.join(CSS_DIR, 'tokens.css'), 'utf8').matchAll(/--(colour-[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
const lum = (hex) => hex.slice(1).match(/../g).map((h) => parseInt(h, 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((t, c, i) => t + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const pairs = [
  ['Navy text on Sheet', 'colour-navy', 'colour-sheet', 4.5],
  ['Navy text on Ledger', 'colour-navy', 'colour-ledger', 4.5],
  ['Navy text on Sky deep (darkest end of the hero gradient)', 'colour-navy', 'colour-sky-deep', 4.5],
  ['Muted text on Sheet', 'colour-muted', 'colour-sheet', 4.5],
  ['Muted text on Ledger', 'colour-muted', 'colour-ledger', 4.5],
  ['Sheet text on Brand (primary buttons)', 'colour-sheet', 'colour-brand', 4.5],
  ['Sheet text on Brand deep (button hover)', 'colour-sheet', 'colour-brand-deep', 4.5],
  ['Brand deep text on Sheet (light buttons, card links)', 'colour-brand-deep', 'colour-sheet', 4.5],
  ['Brand deep text on Navy wash (badges, pills)', 'colour-brand-deep', 'colour-navy-wash', 4.5],
  ['Brand deep icons on Sky deep (hero trust icons, non-text)', 'colour-brand-deep', 'colour-sky-deep', 3],
  ['Brand highlight on Sky deep (hero title, large text)', 'colour-brand', 'colour-sky-deep', 3],
  ['Brand progress bar on Navy wash (non-text)', 'colour-brand', 'colour-navy-wash', 3],
  ['Sheet text on Navy (results panel)', 'colour-sheet', 'colour-navy', 4.5],
  ['Navy soft text on Navy (panel labels)', 'colour-navy-soft', 'colour-navy', 4.5],
  ['Signal tax figure on Navy (large text)', 'colour-signal', 'colour-navy', 3],
  ['Signal figure on Navy, if read as normal text', 'colour-signal', 'colour-navy', 4.5],
  ['Navy text on Navy wash (hover, invalid field)', 'colour-navy', 'colour-navy-wash', 4.5],
  ['Rule lines on Sheet (non-text)', 'colour-rule', 'colour-sheet', 3],
  ['Rule lines on Ledger (non-text)', 'colour-rule', 'colour-ledger', 3],
];
say('');
say('## Contrast (WCAG 2.1, computed from tokens.css)');
for (const [label, fg, bg, need] of pairs) {
  const r = ratio(tokens[fg], tokens[bg]);
  verdict(r >= need, `${label}: ${tokens[fg]} on ${tokens[bg]} = ${r.toFixed(2)}:1`, `(needs ${need}:1)`);
}

say('');
say(`**${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}**`);
console.log(out.join('\n'));
process.exitCode = failures ? 1 : 0;
