// Buy-to-let investment engine tests. Run with: npm test  (Node's built-in runner; nothing here ships.)
// The purchase tax cases are the worked examples published by HMRC, Revenue Scotland and the Welsh Government,
// or were worked out by hand from the band tables in data/purchase-rates.json. Every other figure was worked
// out by hand from the inputs, not copied from the engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const investmentEngine = require('../assets/js/investment-engine.js');
const yieldEngine = require('../assets/js/yield-engine.js');
const taxEngine = require('../assets/js/tax-engine.js');
const rates = JSON.parse(readFileSync(new URL('../data/rates.json', import.meta.url), 'utf8'));
const purchaseRates = JSON.parse(readFileSync(new URL('../data/purchase-rates.json', import.meta.url), 'utf8'));

const gbp = (pounds) => Math.round(pounds * 100);
const options = { purchaseRates, rates, yieldEngine, taxEngine };
const tax = (pounds, nation, additional) => investmentEngine.purchaseTax(gbp(pounds), nation, additional, purchaseRates);

// A £250,000 flat let at £1,500 a month on a 75% interest-only mortgage, bought as an additional property.
function base(overrides = {}) {
  return {
    nation: 'england_ni',
    additional: true,
    price: gbp(250000),
    monthlyRent: gbp(1500),
    depositRate: 0.25,
    interestRate: 0.05,
    mortgageType: 'interestOnly',
    termYears: 25,
    legalFees: gbp(2500),
    refurbishment: gbp(5000),
    mortgageFees: gbp(1000),
    repairs: gbp(1000),
    insurance: gbp(300),
    serviceCharge: gbp(1200),
    otherCosts: gbp(500),
    lettingFeeRate: 0.1,
    voidWeeks: 2,
    taxYear: '2026-27',
    region: 'england_wales_ni',
    otherIncome: gbp(45000),
    stressRate: 0.055,
    icr: 1.45,
    maxLtv: 0.75,
    holdingYears: 10,
    growth: 0,
    rentGrowth: 0,
    costGrowth: 0,
    sellingFeeRate: 0.02,
    ...overrides,
  };
}

function run(overrides) {
  const result = investmentEngine.calculate(base(overrides), options);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result;
}

function codes(overrides) {
  const result = investmentEngine.calculate(base(overrides), options);
  assert.equal(result.ok, false);
  return result.errors.map((e) => `${e.field}:${e.code}`);
}

/* Purchase tax */

test('SDLT matches the worked example published by HMRC', () => {
  // GOV.UK: a £295,000 house is £0 on the first £125,000, 2% on the next £125,000 and 5% on the last £45,000.
  const result = tax(295000, 'england_ni', false);
  assert.equal(result.total, gbp(4750));
  assert.deepEqual(result.rows.filter((r) => r.portion > 0).map((r) => r.tax), [0, gbp(2500), gbp(2250)]);
  assert.equal(result.higher, false);
});

test('SDLT additional-property rates add the 5% surcharge to every band', () => {
  // £295,000: 5% of £125,000, 7% of £125,000 and 10% of £45,000.
  const result = tax(295000, 'england_ni', true);
  assert.equal(result.higher, true);
  assert.equal(result.total, gbp(6250) + gbp(8750) + gbp(4500));
  assert.equal(result.total, gbp(19500));
  assert.equal(result.supplement, 0);
});

test('LBTT adds the Additional Dwelling Supplement on the whole price', () => {
  // £250,000: LBTT is 0% to £145,000 then 2% of £105,000. ADS is 8% of the whole £250,000.
  const result = tax(250000, 'scotland', true);
  assert.equal(result.supplementRate, 0.08);
  assert.equal(result.supplement, gbp(20000));
  assert.equal(result.total, gbp(2100) + gbp(20000));
  assert.equal(result.name, 'LBTT and ADS');
});

test('LBTT without the supplement is the standard table', () => {
  assert.equal(tax(250000, 'scotland', false).total, gbp(2100));
  assert.equal(tax(250000, 'scotland', false).supplement, 0);
});

test('LTT higher rates match the worked example published by the Welsh Government', () => {
  // gov.wales shows a £260,000 second home as £15,950: 5% of £180,000, 8.5% of £70,000 and 10% of £10,000.
  const result = tax(260000, 'wales', true);
  assert.equal(result.total, gbp(15950));
  assert.deepEqual(result.rows.filter((r) => r.portion > 0).map((r) => r.tax), [gbp(9000), gbp(5950), gbp(1000)]);
});

test('LTT main rates leave the first £225,000 untaxed', () => {
  assert.equal(tax(225000, 'wales', false).total, 0);
  // £260,000 as a only home: 6% of the £35,000 above £225,000.
  assert.equal(tax(260000, 'wales', false).total, gbp(2100));
});

test('the additional-property charge does not apply below £40,000', () => {
  assert.equal(purchaseRates.additionalMinimum, gbp(40000));
  const under = tax(39999, 'england_ni', true);
  assert.equal(under.higher, false);
  assert.equal(under.total, 0);
  // Scotland charges no ADS below the minimum either.
  assert.equal(tax(39999, 'scotland', true).supplement, 0);
  // At exactly £40,000 the higher basis applies.
  assert.equal(tax(40000, 'england_ni', true).total, gbp(2000));
});

test('a price at a band edge does not spill into the next band', () => {
  assert.equal(tax(125000, 'england_ni', false).total, 0);
  assert.equal(tax(250000, 'england_ni', false).total, gbp(2500));
  assert.equal(tax(145000, 'scotland', false).total, 0);
});

test('purchase tax refuses an unknown location or an impossible price', () => {
  assert.throws(() => tax(250000, 'ireland', false), /Unknown property location/);
  assert.throws(() => investmentEngine.purchaseTax(250000.5, 'england_ni', false, purchaseRates), /whole pence/);
});

/* The appraisal */

test('cash needed to buy is the deposit plus every buying cost', () => {
  const r = run();
  assert.equal(r.purchaseTax.total, gbp(15000));
  assert.equal(r.buyingCosts, gbp(15000 + 2500 + 5000 + 1000));
  assert.equal(r.first.mortgage.deposit, gbp(62500));
  assert.equal(r.first.mortgage.loan, gbp(187500));
  assert.equal(r.first.cashInvested, gbp(86000));
});

test('the first year repeats the rental yield calculator exactly', () => {
  const r = run();
  const direct = yieldEngine.calculate({
    price: gbp(250000),
    monthlyRent: gbp(1500),
    runningCosts: gbp(3000),
    lettingFeeRate: 0.1,
    voidWeeks: 2,
    buyingCosts: gbp(23500),
    mortgage: { depositRate: 0.25, interestRate: 0.05, type: 'interestOnly', termYears: 25 },
    tax: { taxYear: '2026-27', region: 'england_wales_ni', otherIncome: gbp(45000) },
  }, { taxEngine, rates });
  assert.deepEqual(r.first, direct);
  // By hand: £18,000 rent, less £692.31 of empty weeks, £1,730.77 of fees and £3,000 of costs, less £9,375 interest.
  assert.equal(r.first.voidLoss, 69231);
  assert.equal(r.first.rentCollected, 1730769);
  assert.equal(r.first.lettingFees, 173077);
  assert.equal(r.first.mortgage.annualInterest, gbp(9375));
  assert.equal(r.first.cashFlowBeforeTax, 320192);
});

test('the rent cover check uses the stress rate, not the rate paid', () => {
  const r = run();
  // £187,500 at 5.5% is £10,312.50 of stressed interest; £18,000 of rent covers it 174.55%.
  assert.equal(r.stress.annualInterest, gbp(10312.5));
  assert.equal(r.stress.cover, 1.7455);
  // The rent needed is the stressed interest times 1.45, a month at a time, rounded up.
  assert.equal(r.stress.requiredMonthlyRent, 124610);
  // The 75% loan-to-value limit binds before the rent limit here.
  assert.equal(r.stress.maxLoan, gbp(187500));
  assert.equal(r.stress.minimumCash, gbp(86000));
  assert.equal(r.stress.passes, true);
});

test('thin rent fails the cover check and lowers the biggest loan', () => {
  const r = run({ monthlyRent: gbp(700) });
  assert.equal(r.stress.passes, false);
  // £8,400 of rent at 5.5% and 145% cover supports about £105,330.
  assert.equal(r.stress.maxLoan, Math.floor(gbp(8400) / (0.055 * 1.45)));
  assert.ok(r.stress.maxLoan < r.first.mortgage.loan);
  assert.ok(r.stress.minimumCash > r.first.cashInvested);
});

test('a cash purchase has no loan and no cover figure', () => {
  const r = run({ depositRate: 1 });
  assert.equal(r.first.mortgage.loan, 0);
  assert.equal(r.stress.cover, null);
  assert.equal(r.stress.requiredMonthlyRent, 0);
  assert.equal(r.stress.passes, true);
  assert.equal(r.projection[0].interest, 0);
});

test('break-even rent covers costs and the mortgage after empty weeks and fees', () => {
  const r = run();
  // (£3,000 of costs + £9,375 of interest) over 12 months, grossed up for 2 empty weeks and a 10% fee.
  assert.equal(r.breakEvenRent, 119167);
  const atBreakEven = run({ monthlyRent: r.breakEvenRent });
  assert.ok(Math.abs(atBreakEven.first.cashFlowBeforeTax) < gbp(5));
});

test('break-even rent is not available when nothing of the rent is kept', () => {
  assert.equal(run({ lettingFeeRate: 1 }).breakEvenRent, null);
  assert.equal(run({ voidWeeks: 52 }).breakEvenRent, null);
});

/* The illustration */

test('year one of the illustration equals the first-year cash flow before tax', () => {
  const r = run();
  assert.equal(r.projection.length, 10);
  assert.equal(r.projection[0].cash, r.first.cashFlowBeforeTax);
  assert.equal(r.projection[0].value, gbp(250000));
  assert.equal(r.projection[0].balance, gbp(187500));
  // Selling at the end of year one: 2% costs and the loan repaid out of the price.
  assert.equal(r.projection[0].sellingCosts, gbp(5000));
  assert.equal(r.projection[0].proceeds, gbp(250000 - 5000 - 187500));
  assert.equal(r.projection[0].totalProfit, r.projection[0].cash + gbp(57500) - gbp(86000));
});

test('an interest-only loan never falls, so equity only moves with the price', () => {
  const r = run({ growth: 0.03 });
  r.projection.forEach((p) => assert.equal(p.balance, gbp(187500)));
  assert.equal(r.projection[9].value, Math.round(gbp(250000) * Math.pow(1.03, 10)));
  assert.equal(r.projection[9].equity, r.projection[9].value - gbp(187500));
  assert.ok(r.projection[9].cumulativeCash > r.projection[0].cumulativeCash);
});

test('a repayment loan falls each year and builds equity', () => {
  const r = run({ mortgageType: 'repayment' });
  assert.ok(r.projection[0].capital > 0);
  assert.ok(r.projection[9].balance < r.projection[0].balance);
  assert.equal(r.projection[0].equity, gbp(250000) - r.projection[0].balance);
  // Capital repayments are cash out, so they reduce cash flow while they build equity.
  assert.ok(r.projection[0].cash < run().projection[0].cash);
  const lastYear = r.projection[9];
  assert.equal(lastYear.proceeds, lastYear.value - lastYear.sellingCosts - lastYear.balance);
});

test('rent and cost growth apply from year two', () => {
  const r = run({ rentGrowth: 0.02, costGrowth: 0.03 });
  assert.equal(r.projection[0].collected, run().projection[0].collected);
  assert.equal(r.projection[1].collected, Math.round(gbp(18000) * 1.02) - Math.round(Math.round(gbp(18000) * 1.02) * 2 / 52));
  assert.ok(r.projection[1].operatingCosts > r.projection[0].operatingCosts);
});

test('a falling market gives negative equity and a loss', () => {
  const r = run({ growth: -0.05, holdingYears: 5 });
  const last = r.projection[4];
  assert.ok(last.value < gbp(250000));
  assert.ok(last.totalProfit < 0);
  assert.equal(last.equity, last.value - gbp(187500));
});

test('cumulative cash adds up year by year', () => {
  const r = run({ rentGrowth: 0.02, holdingYears: 4 });
  let running = 0;
  r.projection.forEach((p) => {
    running += p.cash;
    assert.equal(p.cumulativeCash, running);
  });
});

/* Validation */

test('invalid input is refused with a field and a code', () => {
  assert.deepEqual(codes({ price: 0 }), ['price:money']);
  assert.deepEqual(codes({ price: gbp(250000) + 0.5 }), ['price:money']);
  assert.deepEqual(codes({ repairs: -1 }), ['repairs:money']);
  assert.deepEqual(codes({ depositRate: 1.2 }), ['depositRate:range']);
  assert.deepEqual(codes({ interestRate: 0.6 }), ['interestRate:range']);
  assert.deepEqual(codes({ voidWeeks: 53 }), ['voidWeeks:range']);
  assert.deepEqual(codes({ termYears: 22.5 }), ['termYears:wholeNumber']);
  assert.deepEqual(codes({ icr: 0.9 }), ['icr:range']);
  assert.deepEqual(codes({ stressRate: 0 }), ['stressRate:range']);
  assert.deepEqual(codes({ growth: 0.5 }), ['growth:range']);
  assert.deepEqual(codes({ sellingFeeRate: 0.2 }), ['sellingFeeRate:range']);
  assert.deepEqual(codes({ holdingYears: 31 }), ['holdingYears:range']);
  assert.deepEqual(codes({ nation: 'ireland' }), ['nation:unknownNation']);
  assert.deepEqual(codes({ mortgageType: 'offset' }), ['mortgageType:unknownMortgageType']);
  assert.deepEqual(codes({ additional: 'yes' }), ['additional:unknownBasis']);
});

test('an interest-only illustration cannot run past the end of the mortgage', () => {
  assert.deepEqual(codes({ termYears: 5, holdingYears: 10 }), ['holdingYears:beyondInterestOnlyTerm']);
  // A repayment loan is fine, because it is repaid by the end of the term.
  assert.equal(investmentEngine.calculate(base({ termYears: 5, holdingYears: 10, mortgageType: 'repayment' }), options).ok, true);
  // So is a cash purchase, which has no term to outlive.
  assert.equal(investmentEngine.calculate(base({ termYears: 5, holdingYears: 10, depositRate: 1 }), options).ok, true);
});

test('the engines and rates must be supplied', () => {
  assert.deepEqual(investmentEngine.calculate(base(), {}).errors.map((e) => e.code), ['missingEngines']);
  assert.deepEqual(investmentEngine.calculate(base(), { purchaseRates, rates, taxEngine }).errors.map((e) => e.code), ['missingEngines']);
});

test('an unusable tax year is passed back from the tax engine', () => {
  const result = investmentEngine.calculate(base({ taxYear: '1999-00' }), options);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.code === 'unknownTaxYear'));
});

test('every money figure is a whole number of pence', () => {
  const r = run({ price: gbp(317777.77), monthlyRent: gbp(1234.56), nation: 'wales', mortgageType: 'repayment',
    growth: 0.0325, rentGrowth: 0.0175, costGrowth: 0.0225, region: 'scotland', holdingYears: 3 });
  const money = [r.purchaseTax.total, r.purchaseTax.supplement, r.buyingCosts, r.runningCosts,
    r.stress.annualInterest, r.stress.requiredMonthlyRent, r.stress.maxLoan, r.stress.minimumCash, r.breakEvenRent];
  r.projection.forEach((p) => money.push(p.value, p.balance, p.interest, p.capital, p.collected,
    p.operatingCosts, p.cash, p.cumulativeCash, p.equity, p.sellingCosts, p.proceeds, p.totalProfit));
  r.purchaseTax.rows.forEach((row) => money.push(row.tax, row.portion));
  money.forEach((value) => assert.ok(Number.isInteger(value), `not whole pence: ${value}`));
});

/* Cross-checks against figures competitors publish on their own pages, checked 8 November 2026 */

test('matches the yield examples Landlord Studio publishes', () => {
  const noExtras = { lettingFeeRate: 0, voidWeeks: 0, buyingCosts: 0, mortgage: null, tax: null };
  // "A property worth £200,000 earns £1,100 per month, with £3,200 a year in running costs": 6.6% and 5%.
  const first = yieldEngine.calculate({ price: gbp(200000), monthlyRent: gbp(1100), runningCosts: gbp(3200), ...noExtras }, { taxEngine, rates });
  assert.equal(first.grossYield, 0.066);
  assert.equal(first.netYield, 0.05);
  // "On a £600,000 property let at £3,000 a month": 6% gross, and 5% net once £6,000 of costs come off.
  const second = yieldEngine.calculate({ price: gbp(600000), monthlyRent: gbp(3000), runningCosts: gbp(6000), ...noExtras }, { taxEngine, rates });
  assert.equal(second.grossYield, 0.06);
  assert.equal(second.netYield, 0.05);
});

test('matches the yield example PropertyData publishes', () => {
  // "A property for £250,000 at £1,250/month: the gross rental yield would be 6%".
  const r = yieldEngine.calculate({ price: gbp(250000), monthlyRent: gbp(1250), runningCosts: 0,
    lettingFeeRate: 0, voidWeeks: 0, buyingCosts: 0, mortgage: null, tax: null }, { taxEngine, rates });
  assert.equal(r.grossYield, 0.06);
});

test('the rent cover check matches the formula a broker publishes', () => {
  // Private Finance's stress-test tool states: maximum loan = annual rent / ICR / stress rate.
  const r = run({ monthlyRent: gbp(1500), stressRate: 0.055, icr: 1.45, maxLtv: 1, voidWeeks: 0, lettingFeeRate: 0 });
  assert.equal(r.stress.maxLoan, Math.floor(gbp(18000) / 1.45 / 0.055));
});

test('the rates file keeps the shape the engine reads', () => {
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(purchaseRates.lastVerified));
  assert.equal(Object.keys(purchaseRates.nations).length, 3);
  for (const [key, rule] of Object.entries(purchaseRates.nations)) {
    assert.equal(rule.limits.length, rule.rates.length, `${key}: a rate for every band`);
    assert.equal(rule.limits[rule.limits.length - 1], null, `${key}: the top band is open-ended`);
    assert.ok(rule.source.startsWith('https://'), `${key}: has a source`);
    rule.limits.slice(0, -1).forEach((limit, i) => {
      assert.ok(Number.isInteger(limit) && limit > 0, `${key}: band ${i} is whole pence`);
      assert.ok(i === 0 || limit > rule.limits[i - 1], `${key}: bands rise`);
    });
    if (rule.higherLimits) {
      assert.equal(rule.higherLimits.length, rule.higherRates.length, `${key}: a higher rate for every higher band`);
    }
  }
});
