// Purchase tax engine tests. Run with: npm test  (Node's built-in runner; nothing here ships to the browser.)
// Figures are the worked examples published by HMRC, Revenue Scotland and the Welsh Government, or were worked
// out by hand from the band tables in data/purchase-rates.json. Checked against the official pages 8 Nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../assets/js/purchase-tax-engine.js');
const config = JSON.parse(readFileSync(new URL('../data/purchase-rates.json', import.meta.url), 'utf8'));

const gbp = (pounds) => Math.round(pounds * 100);
const tax = (pounds, nation, basis) => engine.purchaseTax(gbp(pounds), nation, basis, config);

/* Standard rates */

test('standard rates match the worked example HMRC publishes', () => {
  // GOV.UK: £295,000 is nothing on the first £125,000, 2% on the next £125,000 and 5% on the last £45,000.
  const r = tax(295000, 'england_ni', 'standard');
  assert.equal(r.total, gbp(4750));
  assert.equal(r.appliedBasis, 'standard');
  assert.equal(r.higher, false);
});

test('an additional property adds the surcharge or the supplement', () => {
  assert.equal(tax(295000, 'england_ni', 'additional').total, gbp(19500));
  // Scotland: £2,100 of LBTT on £250,000, plus 8% of the whole price as the supplement.
  const scotland = tax(250000, 'scotland', 'additional');
  assert.equal(scotland.supplement, gbp(20000));
  assert.equal(scotland.total, gbp(22100));
  // Wales has its own higher table: 5% of £180,000, 8.5% of £70,000, 10% of £10,000.
  assert.equal(tax(260000, 'wales', 'additional').total, gbp(15950));
});

test('the basis may still be given as the booleans the buy-to-let engine passes', () => {
  assert.equal(tax(295000, 'england_ni', true).total, tax(295000, 'england_ni', 'additional').total);
  assert.equal(tax(295000, 'england_ni', false).total, tax(295000, 'england_ni', 'standard').total);
  assert.equal(engine.purchaseTax(gbp(295000), 'england_ni', undefined, config).appliedBasis, 'standard');
});

/* First-time buyer relief */

test('first-time buyer relief in England matches the example HMRC publishes', () => {
  // GOV.UK: nothing up to £300,000, then 5% to £500,000. Its example buys at £500,000 and pays £10,000.
  assert.equal(tax(300000, 'england_ni', 'firstTimeBuyer').total, 0);
  assert.equal(tax(500000, 'england_ni', 'firstTimeBuyer').total, gbp(10000));
  assert.equal(tax(400000, 'england_ni', 'firstTimeBuyer').total, gbp(5000));
});

test('the English relief is worth up to £5,000 and vanishes above £500,000', () => {
  const atLimit = tax(500000, 'england_ni', 'firstTimeBuyer');
  assert.equal(atLimit.firstTimeBuyer.saving, gbp(5000));
  assert.equal(atLimit.firstTimeBuyer.lostOnPrice, false);
  assert.equal(atLimit.appliedBasis, 'firstTimeBuyer');

  // A pound more and the relief is gone, so the standard rates apply to the whole price.
  const over = tax(500001, 'england_ni', 'firstTimeBuyer');
  assert.equal(over.firstTimeBuyer.lostOnPrice, true);
  assert.equal(over.firstTimeBuyer.saving, 0);
  assert.equal(over.appliedBasis, 'standard');
  assert.equal(over.total, tax(500001, 'england_ni', 'standard').total);
  // By hand: 2% of £125,000 plus 5% of £250,001.
  assert.equal(over.total, gbp(2500) + 1250005);
});

test('Scottish relief raises the nil band and saves at most £600', () => {
  assert.equal(tax(175000, 'scotland', 'firstTimeBuyer').total, 0);
  // £200,000: 2% of the £25,000 above £175,000, against 2% of the £55,000 above £145,000.
  const small = tax(200000, 'scotland', 'firstTimeBuyer');
  assert.equal(small.total, gbp(500));
  assert.equal(small.firstTimeBuyer.saving, gbp(600));
  // The saving stays at £600 however dear the property, because only the nil band changes.
  [300000, 500000, 900000].forEach((price) => {
    assert.equal(tax(price, 'scotland', 'firstTimeBuyer').firstTimeBuyer.saving, gbp(600));
  });
  assert.equal(tax(900000, 'scotland', 'firstTimeBuyer').firstTimeBuyer.lostOnPrice, false);
});

test('Wales offers no first-time buyer relief, so the standard rates apply', () => {
  const r = tax(260000, 'wales', 'firstTimeBuyer');
  assert.equal(r.firstTimeBuyer.offeredHere, false);
  assert.equal(r.firstTimeBuyer.saving, 0);
  assert.equal(r.appliedBasis, 'standard');
  assert.equal(r.total, tax(260000, 'wales', 'standard').total);
  assert.equal(r.total, gbp(2100));
});

test('a first-time buyer never pays the additional-property charge', () => {
  const r = tax(250000, 'scotland', 'firstTimeBuyer');
  assert.equal(r.supplement, 0);
  assert.equal(r.higher, false);
});

/* Edges and reporting */

test('the extra charge on an additional property starts at £40,000', () => {
  assert.equal(config.additionalMinimum, gbp(40000));
  assert.equal(tax(39999, 'england_ni', 'additional').higher, false);
  assert.equal(tax(39999, 'england_ni', 'additional').total, 0);
  assert.equal(tax(39999, 'scotland', 'additional').supplement, 0);
  assert.equal(tax(40000, 'england_ni', 'additional').total, gbp(2000));
});

test('a price sitting on a band edge does not spill into the next band', () => {
  assert.equal(tax(125000, 'england_ni', 'standard').total, 0);
  assert.equal(tax(250000, 'england_ni', 'standard').total, gbp(2500));
  assert.equal(tax(145000, 'scotland', 'standard').total, 0);
  assert.equal(tax(225000, 'wales', 'standard').total, 0);
});

test('the result reports the rate the whole price really bears', () => {
  const r = tax(295000, 'england_ni', 'standard');
  assert.equal(r.effectiveRate, Math.round((gbp(4750) / gbp(295000)) * 1000000) / 1000000);
  assert.equal(tax(100000, 'england_ni', 'standard').effectiveRate, 0);
  assert.equal(engine.purchaseTax(0, 'england_ni', 'standard', config).effectiveRate, 0);
});

test('every money figure is a whole number of pence', () => {
  [['england_ni', 'additional'], ['scotland', 'additional'], ['wales', 'additional'],
    ['england_ni', 'firstTimeBuyer'], ['scotland', 'firstTimeBuyer']].forEach(([nation, basis]) => {
    const r = engine.purchaseTax(gbp(437777.77), nation, basis, config);
    [r.total, r.supplement, r.firstTimeBuyer.saving].forEach((value) =>
      assert.ok(Number.isInteger(value), `${nation}/${basis}: not whole pence: ${value}`));
    r.rows.forEach((row) => {
      assert.ok(Number.isInteger(row.tax) && Number.isInteger(row.portion), `${nation}: whole pence in a band`);
    });
    // The bands must account for the whole price, with nothing lost or counted twice.
    assert.equal(r.rows.reduce((total, row) => total + row.portion, 0), gbp(437777.77));
  });
});

test('bad input is refused', () => {
  assert.throws(() => tax(250000, 'ireland', 'standard'), /Unknown property location/);
  assert.throws(() => tax(250000, 'england_ni', 'downsizing'), /Unknown buyer basis/);
  assert.throws(() => engine.purchaseTax(250000.5, 'england_ni', 'standard', config), /whole pence/);
  assert.throws(() => engine.purchaseTax(-1, 'england_ni', 'standard', config), /whole pence/);
});

test('the rates file keeps the shape the engine reads', () => {
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(config.lastVerified));
  const tableIsSound = (limits, rates, where, openEnded) => {
    assert.equal(limits.length, rates.length, `${where}: a rate for every band`);
    if (openEnded) {
      assert.equal(limits[limits.length - 1], null, `${where}: the top band is open-ended`);
    }
    limits.filter((limit) => limit !== null).forEach((limit, i, kept) => {
      assert.ok(Number.isInteger(limit) && limit > 0, `${where}: band ${i} is whole pence`);
      assert.ok(i === 0 || limit > kept[i - 1], `${where}: bands rise`);
    });
    rates.forEach((rate) => assert.ok(rate >= 0 && rate < 1, `${where}: a rate is a decimal`));
  };
  for (const [key, rule] of Object.entries(config.nations)) {
    tableIsSound(rule.limits, rule.rates, `${key} standard`, true);
    if (rule.higherLimits) {
      tableIsSound(rule.higherLimits, rule.higherRates, `${key} higher`, true);
    }
    if (rule.firstTimeBuyer) {
      // A relief table may stop at its maximum price instead of running on, so it need not be open-ended.
      tableIsSound(rule.firstTimeBuyer.limits, rule.firstTimeBuyer.rates, `${key} first-time buyer`,
        rule.firstTimeBuyer.maxPrice === null);
    }
    assert.ok(rule.source.startsWith('https://'), `${key}: has a source`);
  }
});
