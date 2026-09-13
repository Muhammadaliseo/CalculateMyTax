// Tax engine tests. Run with: npm test  (Node's built-in runner; nothing here ships to the browser.)
// Every expected figure was worked out by hand from the verified rate set, not copied from the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const engine = require('../assets/js/tax-engine.js');
const rates = JSON.parse(readFileSync(new URL('../data/rates.json', import.meta.url), 'utf8'));
const mtd = JSON.parse(readFileSync(new URL('../data/mtd.json', import.meta.url), 'utf8'));

const gbp = (pounds) => Math.round(pounds * 100);

function build(overrides = {}) {
  return {
    taxYear: '2026-27',
    region: 'england_wales_ni',
    otherIncome: gbp(45000),
    properties: [{ rent: gbp(18000), expenses: gbp(3200), financeCosts: gbp(6400) }],
    reliefMode: 'auto',
    ...overrides,
  };
}

function run(overrides, table = rates) {
  const result = engine.calculate(build(overrides), table);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result;
}

const owner = (overrides, table) => run(overrides, table).owner;
const property = (rent, expenses = 0, financeCosts = 0) => ({ rent: gbp(rent), expenses: gbp(expenses), financeCosts: gbp(financeCosts) });

// HMRC's published case studies use 2016/17 figures: £11,000 allowance, £32,000 basic rate band, 20% credit.
const caseStudyRates = {
  'case-study': {
    label: 'HMRC case studies',
    startDate: '2016-04-06',
    endDate: '2017-04-05',
    isForecast: false,
    forecastNote: null,
    lastVerified: '2026-09-13',
    personalAllowance: gbp(11000),
    paTaperThreshold: gbp(100000),
    paTaperRate: 2,
    propertyAllowance: gbp(1000),
    rentARoom: gbp(7500),
    rentARoomShared: gbp(3750),
    financeReliefRate: 0.2,
    paOrdering: 'standard',
    regions: {
      england_wales_ni: {
        label: 'England',
        assumed: false,
        notes: null,
        bands: [
          { name: 'Basic rate', upTo: gbp(32000), rate: 0.2 },
          { name: 'Higher rate', upTo: gbp(150000), rate: 0.4 },
          { name: 'Additional rate', upTo: null, rate: 0.45 },
        ],
        propertyIncomeBands: null,
      },
    },
  },
};

/* Core calculation */

test('baseline England 2026/27 matches the hand-checked answer', () => {
  const o = owner();
  assert.equal(o.selectedRoute, 'expenses');
  assert.equal(o.result.profit, gbp(14800));
  assert.equal(o.result.taxBeforeCredit, gbp(11352));
  assert.equal(o.result.finance.credit, gbp(1280));
  assert.equal(o.result.totalTax, gbp(10072));
  assert.equal(o.result.propertyTax, gbp(3586));
  assert.equal(o.result.netRentalIncome, gbp(4814));
  assert.equal(o.result.marginalRate, 0.4);
  assert.equal(o.result.effectiveRate, 0.1992);
});

test('zero property income produces zero property tax', () => {
  const o = owner({ properties: [property(0)] });
  assert.equal(o.result.propertyTax, 0);
  assert.equal(o.result.totalTax, gbp(6486));
  assert.equal(o.result.netRentalIncome, 0);
});

test('a loss this year is not taxed and carries forward with the unrelieved interest', () => {
  const o = owner({ otherIncome: gbp(30000), properties: [property(6000, 9000, 1000)], reliefMode: 'expenses' });
  assert.equal(o.result.taxableProfit, 0);
  assert.equal(o.result.propertyTax, 0);
  assert.equal(o.result.totalTax, gbp(3486));
  assert.equal(o.result.lossCarriedForward, gbp(3000));
  assert.equal(o.result.finance.relieved, 0);
  assert.equal(o.result.finance.carriedForward, gbp(1000));
  assert.equal(o.result.netRentalIncome, gbp(-4000));
});

test('brought-forward losses reduce this year\'s property profit', () => {
  const o = owner({ lossesBroughtForward: gbp(4000) });
  assert.equal(o.result.lossUsed, gbp(4000));
  assert.equal(o.result.taxableProfit, gbp(10800));
  assert.equal(o.result.lossCarriedForward, 0);
  assert.equal(o.result.propertyTax, gbp(1986));
});

test('personal allowance taper between £100,000 and £125,140 gives a 60% effective marginal rate', () => {
  const o = owner({ otherIncome: gbp(110000) });
  assert.equal(o.result.personalAllowance, gbp(170));
  assert.equal(o.result.totalTax, gbp(41032));
  assert.equal(o.result.propertyTax, gbp(7600));
  assert.equal(o.result.netRentalIncome, gbp(800));
  assert.equal(o.result.inTaperZone, true);
  assert.equal(o.result.effectiveMarginalRate, 0.6);
  assert.ok(o.warnings.some((w) => w.code === 'personalAllowanceTaper'));
});

test('allowance fully withdrawn and the additional rate reached', () => {
  const o = owner({ otherIncome: gbp(130000), properties: [property(10000)], reliefMode: 'expenses' });
  assert.equal(o.result.personalAllowance, 0);
  assert.equal(o.result.propertyTax, gbp(4500));
  assert.equal(o.result.marginalRate, 0.45);
  assert.equal(o.result.inTaperZone, false);
});

/* Section 24: each limb on its own */

test('Section 24 limited by finance costs, the first limb', () => {
  const f = owner().result.finance;
  assert.equal(f.limitingFactor, 'financeCosts');
  assert.equal(f.relieved, gbp(6400));
  assert.equal(f.carriedForward, 0);
});

test('Section 24 limited by property profits, the second limb', () => {
  const o = owner({ properties: [property(10000, 2000, 12000)], reliefMode: 'expenses' });
  assert.equal(o.result.finance.limitingFactor, 'profits');
  assert.equal(o.result.finance.relieved, gbp(8000));
  assert.equal(o.result.finance.credit, gbp(1600));
  assert.equal(o.result.finance.carriedForward, gbp(4000));
  assert.equal(o.result.totalTax, gbp(7032));
  assert.equal(o.result.propertyTax, gbp(546));
});

test('Section 24 profit limb uses profits after brought-forward losses', () => {
  const o = owner({ lossesBroughtForward: gbp(10000) });
  assert.equal(o.result.taxableProfit, gbp(4800));
  assert.equal(o.result.finance.limitingFactor, 'profits');
  assert.equal(o.result.finance.credit, gbp(960));
  assert.equal(o.result.finance.carriedForward, gbp(1600));
  assert.equal(o.result.propertyTax, 0);
});

test('Section 24 limited by income above the personal allowance, the third limb', () => {
  const o = owner({ otherIncome: 0, properties: [property(20000, 2000, 15000)], reliefMode: 'expenses' });
  assert.equal(o.result.finance.incomeLimb, gbp(5430));
  assert.equal(o.result.finance.limitingFactor, 'income');
  assert.equal(o.result.finance.credit, gbp(1086));
  assert.equal(o.result.totalTax, 0);
  assert.equal(o.result.finance.carriedForward, gbp(9570));
});

test('the credit never exceeds the tax due, so it cannot create a refund', () => {
  const o = owner({ region: 'scotland', otherIncome: 0, properties: [property(14000, 0, 14000)], reliefMode: 'expenses' });
  assert.equal(o.result.taxBeforeCredit, 27170);
  assert.equal(o.result.finance.relieved, gbp(1430));
  assert.equal(o.result.finance.credit, 27170);
  assert.equal(o.result.finance.creditCappedByTax, true);
  assert.equal(o.result.totalTax, 0);
});

test('brought-forward finance costs join the first limb', () => {
  const o = owner({ financeCostsBroughtForward: gbp(2000), reliefMode: 'expenses' });
  assert.equal(o.result.finance.financeLimb, gbp(8400));
  assert.equal(o.result.finance.credit, gbp(1680));
  assert.equal(o.result.totalTax, gbp(9672));
  assert.equal(o.result.propertyTax, gbp(3186));
});

test('Section 24 panel compares against the pre-2017 full deduction', () => {
  const r = owner().result;
  assert.equal(r.pre2017PropertyTax, gbp(2306));
  assert.equal(r.section24Cost, gbp(1280));
});

/* Relief routes */

test('choosing the property allowance while paying mortgage interest forfeits the credit and warns', () => {
  const o = owner({ reliefMode: 'propertyAllowance' });
  assert.equal(o.selectedRoute, 'propertyAllowance');
  assert.equal(o.result.finance.credit, 0);
  assert.equal(o.result.totalTax, gbp(12232));
  assert.equal(o.result.propertyTax, gbp(5746));
  const warning = o.warnings.find((w) => w.code === 'allowanceForfeitsCredit');
  assert.ok(warning);
  assert.equal(warning.amount, gbp(1280));
});

test('automatic mode compares every route and recommends the cheapest', () => {
  const o = owner();
  assert.equal(o.recommendedRoute, 'expenses');
  assert.equal(o.routes.propertyAllowance.available, true);
  assert.equal(o.routes.propertyAllowance.result.totalTax, gbp(12232));
  assert.equal(o.routes.rentARoom.available, false);
  assert.equal(o.routes.rentARoom.reason, 'onlyForRoomInOwnHome');
});

test('automatic mode picks the property allowance when expenses are under £1,000', () => {
  const o = owner({ properties: [property(5000, 200)] });
  assert.equal(o.selectedRoute, 'propertyAllowance');
  assert.equal(o.result.propertyTax, gbp(800));
  assert.equal(o.routes.expenses.result.propertyTax, gbp(960));
});

test('rent of £1,000 or less is fully covered by the property allowance', () => {
  const o = owner({ properties: [property(900)] });
  assert.equal(o.selectedRoute, 'propertyAllowance');
  assert.equal(o.result.propertyTax, 0);
  assert.equal(o.routes.expenses.result.propertyTax, gbp(180));
});

test('the property allowance is unavailable when brought-forward finance costs would reduce the tax', () => {
  const o = owner({ financeCostsBroughtForward: gbp(500) });
  assert.equal(o.routes.propertyAllowance.available, false);
  assert.equal(o.routes.propertyAllowance.reason, 'broughtForwardFinanceCosts');
});

test('Rent a Room receipts within the limit are tax free', () => {
  const o = owner({ lettingType: 'roomInOwnHome', otherIncome: gbp(30000), properties: [property(7000, 1500)] });
  assert.equal(o.selectedRoute, 'rentARoom');
  assert.equal(o.result.propertyTax, 0);
  assert.equal(o.routes.expenses.result.propertyTax, gbp(1100));
  assert.equal(o.routes.propertyAllowance.available, false);
  assert.equal(o.routes.propertyAllowance.reason, 'notForRentARoomIncome');
});

test('Rent a Room over the limit compares method A and method B (HMRC HS223 example)', () => {
  const o = owner({ lettingType: 'roomInOwnHome', otherIncome: gbp(30000), properties: [property(10600, 9000)] });
  assert.equal(o.routes.expenses.result.taxableProfit, gbp(1600));
  assert.equal(o.routes.expenses.result.propertyTax, gbp(320));
  assert.equal(o.routes.rentARoom.result.taxableProfit, gbp(3100));
  assert.equal(o.routes.rentARoom.result.propertyTax, gbp(620));
  assert.equal(o.selectedRoute, 'expenses');
});

test('the Rent a Room limit halves when someone else shares the income', () => {
  const o = owner({ lettingType: 'roomInOwnHome', rentARoomShared: true, otherIncome: gbp(30000), properties: [property(5000)] });
  assert.equal(o.selectedRoute, 'rentARoom');
  assert.equal(o.result.taxableProfit, gbp(1250));
  assert.equal(o.result.propertyTax, gbp(250));
});

/* Scotland */

test('Scotland 2026/27 taxes property at Scottish rates and gives the credit at 20%', () => {
  const o = owner({ region: 'scotland' });
  assert.equal(o.result.taxBeforeCredit, 1309805);
  assert.equal(o.result.finance.credit, gbp(1280));
  assert.equal(o.result.totalTax, 1181805);
  assert.equal(o.result.propertyTax, gbp(4936));
  assert.equal(o.result.marginalRate, 0.42);
});

test('Scotland starter rate: a 20% credit on 19% income can lower tax on other income', () => {
  const o = owner({ region: 'scotland', otherIncome: gbp(14000), properties: [property(3000, 0, 3000)], reliefMode: 'expenses' });
  assert.equal(o.result.taxBeforeCredit, 84633);
  assert.equal(o.result.finance.credit, gbp(600));
  assert.equal(o.result.totalTax, 24633);
  assert.equal(o.result.propertyTax, -2537);
});

/* Ownership and pooling */

test('joint owners in different tax bands, split 50/50', () => {
  const r = run({ ownerShare: 50, partner: { otherIncome: gbp(20000) } });
  assert.equal(r.owner.grossRent, gbp(9000));
  assert.equal(r.partner.grossRent, gbp(9000));
  assert.equal(r.owner.result.propertyTax, gbp(1266));
  assert.equal(r.partner.result.propertyTax, gbp(840));
});

test('joint owners with a 70/30 split', () => {
  const r = run({ ownerShare: 70, partner: { otherIncome: gbp(20000) } });
  assert.equal(r.owner.result.propertyTax, gbp(2194));
  assert.equal(r.partner.result.propertyTax, gbp(504));
});

test('several properties are pooled into one property business', () => {
  const o = owner({ properties: [property(10000, 1000, 4000), property(8000, 2200, 2400)] });
  assert.equal(o.result.propertyTax, gbp(3586));
});

test('a loss on one property offsets profit on another', () => {
  const o = owner({ properties: [property(10000, 12000), property(18000, 3200)], reliefMode: 'expenses' });
  assert.equal(o.result.profit, gbp(12800));
  assert.equal(o.result.propertyTax, gbp(4066));
});

/* 2027/28 */

test('2027/28 England uses property rates of 22%, 42% and 47% with a 22% credit', () => {
  const o = owner({ taxYear: '2027-28' });
  assert.equal(o.result.taxBeforeCredit, gbp(11648));
  assert.equal(o.result.finance.credit, gbp(1408));
  assert.equal(o.result.totalTax, gbp(10240));
  assert.equal(o.result.propertyTax, gbp(3754));
});

test('2027/28 sets the personal allowance against employment income first', () => {
  const o = owner({ taxYear: '2027-28', otherIncome: gbp(20000), properties: [property(10000)], reliefMode: 'expenses' });
  assert.equal(o.result.paAgainstProperty, 0);
  assert.equal(o.result.totalTax, gbp(3686));
  assert.equal(o.result.propertyTax, gbp(2200));
});

test('2027/28 Scotland keeps Scottish rates and gives the credit at 22%', () => {
  const o = owner({ taxYear: '2027-28', region: 'scotland' });
  assert.equal(o.result.totalTax, 1169005);
  assert.equal(o.result.propertyTax, gbp(4808));
});

test('the April 2027 alert finds the next rate change and its cash difference', () => {
  assert.equal(engine.nextPropertyRateChange(rates, '2026-27'), '2027-28');
  assert.equal(engine.nextPropertyRateChange(rates, '2027-28'), null);
  const difference = owner({ taxYear: '2027-28' }).result.propertyTax - owner().result.propertyTax;
  assert.equal(difference, gbp(168));
});

/* HMRC worked examples */

test('HMRC case study: Sophia, finance costs limited by nothing', () => {
  const o = owner({ taxYear: 'case-study', otherIncome: 0, properties: [property(52000, 9000, 20000)], reliefMode: 'expenses' }, caseStudyRates);
  assert.equal(o.result.taxBeforeCredit, gbp(6400));
  assert.equal(o.result.finance.credit, gbp(4000));
  assert.equal(o.result.totalTax, gbp(2400));
});

test('HMRC case study: John, a higher rate taxpayer', () => {
  const o = owner({ taxYear: 'case-study', otherIncome: gbp(35000), properties: [property(18000, 2000, 8000)], reliefMode: 'expenses' }, caseStudyRates);
  assert.equal(o.result.taxBeforeCredit, gbp(9600));
  assert.equal(o.result.finance.credit, gbp(1600));
  assert.equal(o.result.totalTax, gbp(8000));
});

test('HMRC case study: Brian, carrying unrelieved costs into the next year', () => {
  const yearOne = owner({ taxYear: 'case-study', otherIncome: gbp(36000), properties: [property(20000, 7000, 15000)], reliefMode: 'expenses' }, caseStudyRates);
  assert.equal(yearOne.result.taxBeforeCredit, gbp(8800));
  assert.equal(yearOne.result.finance.relieved, gbp(13000));
  assert.equal(yearOne.result.totalTax, gbp(6200));
  assert.equal(yearOne.result.finance.carriedForward, gbp(2000));

  const yearTwo = owner({
    taxYear: 'case-study',
    otherIncome: gbp(36000),
    properties: [property(24000, 2000, 15000)],
    financeCostsBroughtForward: yearOne.result.finance.carriedForward,
    reliefMode: 'expenses',
  }, caseStudyRates);
  assert.equal(yearTwo.result.taxBeforeCredit, gbp(12400));
  assert.equal(yearTwo.result.finance.relieved, gbp(17000));
  assert.equal(yearTwo.result.totalTax, gbp(9000));
});

/* Regression, integrity and helpers */

test('regression snapshot for every tax year in rates.json', () => {
  const snapshots = {
    '2025-26': { england_wales_ni: [gbp(10072), gbp(3586)], scotland: [1184980, gbp(4936)] },
    '2026-27': { england_wales_ni: [gbp(10072), gbp(3586)], scotland: [1181805, gbp(4936)] },
    '2027-28': { england_wales_ni: [gbp(10240), gbp(3754)], scotland: [1169005, gbp(4808)] },
  };
  for (const year of engine.listTaxYears(rates)) {
    assert.ok(snapshots[year], `Add a regression snapshot for ${year} before shipping a new tax year`);
    for (const region of Object.keys(rates[year].regions)) {
      const o = owner({ taxYear: year, region });
      assert.deepEqual([o.result.totalTax, o.result.propertyTax], snapshots[year][region], `${year} ${region}`);
    }
  }
});

test('every money figure in a result is a whole number of pence', () => {
  const walk = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`));
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (typeof child === 'number' && !/rate$/i.test(key) && key !== 'share') {
          assert.ok(Number.isInteger(child), `${path}.${key} = ${child}`);
        } else {
          walk(child, `${path}.${key}`);
        }
      }
    }
  };
  walk(run({ region: 'scotland', ownerShare: 70, partner: { otherIncome: gbp(20000) } }), 'result');
  walk(run({ otherIncome: gbp(110000) }), 'result');
});

test('invalid input returns explained errors instead of a result', () => {
  const errorsFor = (overrides) => engine.calculate(build(overrides), rates).errors || [];
  assert.ok(errorsFor({ otherIncome: -100 }).some((e) => e.field === 'otherIncome' && e.code === 'negative'));
  assert.ok(errorsFor({ properties: [{ rent: 1000.5, expenses: 0, financeCosts: 0 }] }).some((e) => e.code === 'notWholePence'));
  assert.ok(errorsFor({ taxYear: '2031-32' }).some((e) => e.code === 'unknownTaxYear'));
  assert.ok(errorsFor({ region: 'jersey' }).some((e) => e.code === 'unknownRegion'));
  assert.ok(errorsFor({ ownerShare: 0 }).some((e) => e.code === 'shareOutOfRange'));
  assert.ok(errorsFor({ partner: { otherIncome: 0 }, ownerShare: 100 }).some((e) => e.code === 'jointShareMustBeBelow100'));
  assert.equal(engine.calculate(build({ otherIncome: -1 }), rates).ok, false);
});

test('the current tax year is picked from the date', () => {
  assert.equal(engine.currentTaxYear(rates, '2026-09-13'), '2026-27');
  assert.equal(engine.currentTaxYear(rates, '2026-04-05'), '2025-26');
  assert.equal(engine.currentTaxYear(rates, '2027-04-06'), '2027-28');
  assert.equal(engine.currentTaxYear(rates, '2031-01-01'), null);
});

test('Making Tax Digital thresholds use gross income and "over", not "at"', () => {
  assert.equal(engine.mtdStatus(gbp(50001), mtd).startDate, '2026-04-06');
  assert.equal(engine.mtdStatus(gbp(35000), mtd).startDate, '2027-04-06');
  assert.equal(engine.mtdStatus(gbp(30000), mtd).startDate, '2028-04-06');
  assert.equal(engine.mtdStatus(gbp(22000), mtd).startDate, '2028-04-06');
  assert.equal(engine.mtdStatus(gbp(18000), mtd), null);
});

test('rates.json holds every field the engine reads, in pence', () => {
  for (const year of engine.listTaxYears(rates)) {
    const y = rates[year];
    for (const key of ['personalAllowance', 'paTaperThreshold', 'propertyAllowance', 'rentARoom', 'rentARoomShared']) {
      assert.ok(Number.isInteger(y[key]), `${year}.${key}`);
    }
    for (const [name, region] of Object.entries(y.regions)) {
      const bands = [region.bands, region.propertyIncomeBands].filter(Boolean);
      for (const list of bands) {
        assert.equal(list[list.length - 1].upTo, null, `${year} ${name} top band must be open-ended`);
        list.slice(0, -1).forEach((band, i) => assert.ok(i === 0 || band.upTo > list[i - 1].upTo, `${year} ${name} bands ascend`));
      }
    }
  }
});
