// Rental yield engine tests. Run with: npm test  (Node's built-in runner; nothing here ships to the browser.)
// Expected figures were worked out by hand, or for repayment mortgages with a separate amortisation script,
// and cross-checked against the published £644.30 monthly payment on £100,000 at 6% over 25 years.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yieldEngine = require('../assets/js/yield-engine.js');
const taxEngine = require('../assets/js/tax-engine.js');
const rates = JSON.parse(readFileSync(new URL('../data/rates.json', import.meta.url), 'utf8'));

const gbp = (pounds) => Math.round(pounds * 100);

// £250,000 flat let at £1,250 a month, two empty weeks, £2,000 of fixed costs and a 10% letting fee.
function base(overrides = {}) {
  return {
    price: gbp(250000),
    monthlyRent: gbp(1250),
    voidWeeks: 2,
    runningCosts: gbp(2000),
    lettingFeeRate: 0.1,
    ...overrides,
  };
}

function run(input, options) {
  const result = yieldEngine.calculate(input, options);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result;
}

function codes(input, options) {
  const result = yieldEngine.calculate(input, options);
  assert.equal(result.ok, false);
  return result.errors.map((e) => `${e.field}:${e.code}`);
}

test('gross yield is annual rent divided by the price', () => {
  const r = run(base({ voidWeeks: 0, runningCosts: 0, lettingFeeRate: 0 }));
  assert.equal(r.annualRent, gbp(15000));
  assert.equal(r.grossYield, 0.06);
  assert.equal(r.netYield, 0.06);
});

test('empty weeks, letting fees and running costs come off before net yield', () => {
  const r = run(base());
  // £15,000 x 2/52 = £576.923 -> £576.92 lost to empty weeks
  assert.equal(r.voidLoss, 57692);
  assert.equal(r.rentCollected, 1442308);
  // 10% of the rent actually collected: £1,442.308 -> £1,442.31
  assert.equal(r.lettingFees, 144231);
  assert.equal(r.runningTotal, 344231);
  assert.equal(r.netIncome, 1098077);
  assert.equal(r.grossYield, 0.06);
  // £10,980.77 / £250,000 = 4.3923%
  assert.equal(r.netYield, 0.043923);
});

test('without a mortgage the cash invested is the price plus buying costs', () => {
  const r = run(base({ buyingCosts: gbp(10000) }));
  assert.equal(r.mortgage, null);
  assert.equal(r.cashInvested, gbp(260000));
  assert.equal(r.cashFlowBeforeTax, 1098077);
  // £10,980.77 / £260,000 = 4.2234%
  assert.equal(r.cashOnCash, 0.042234);
  assert.equal(r.monthlyCashFlowBeforeTax, 91506);
});

test('interest-only mortgage: interest, cash flow, return on cash and interest cover', () => {
  const r = run(base({ buyingCosts: gbp(10000), mortgage: { depositRate: 0.25, interestRate: 0.05, type: 'interestOnly' } }));
  assert.equal(r.mortgage.loan, gbp(187500));
  assert.equal(r.mortgage.deposit, gbp(62500));
  assert.equal(r.mortgage.annualInterest, gbp(9375));
  assert.equal(r.mortgage.annualCapital, 0);
  assert.equal(r.mortgage.monthlyPayment, gbp(781.25));
  assert.equal(r.cashInvested, gbp(72500));
  // £10,980.77 - £9,375 = £1,605.77
  assert.equal(r.cashFlowBeforeTax, 160577);
  assert.equal(r.monthlyCashFlowBeforeTax, 13381);
  // £1,605.77 / £72,500 = 2.2149%
  assert.equal(r.cashOnCash, 0.022149);
  // Rent of £15,000 is 160% of £9,375 interest
  assert.equal(r.mortgage.interestCover, 1.6);
});

test('repayment mortgage matches the published £644.30 payment on £100,000 at 6% over 25 years', () => {
  const r = run(base({ price: gbp(200000), mortgage: { depositRate: 0.5, interestRate: 0.06, type: 'repayment', termYears: 25 } }));
  assert.equal(r.mortgage.loan, gbp(100000));
  assert.equal(r.mortgage.monthlyPayment, 64430);
  assert.equal(r.mortgage.annualInterest, 595158);
  assert.equal(r.mortgage.annualCapital, 178002);
  assert.equal(r.mortgage.annualPayments, 773160);
  assert.equal(r.mortgage.annualPayments, 64430 * 12);
});

test('repayment mortgage capital payments reduce cash flow but are not a cost for yield', () => {
  const r = run(base({ mortgage: { depositRate: 0.25, interestRate: 0.05, type: 'repayment', termYears: 25 } }));
  assert.equal(r.mortgage.monthlyPayment, 109611);
  assert.equal(r.mortgage.annualInterest, 928720);
  assert.equal(r.mortgage.annualCapital, 386612);
  assert.equal(r.netYield, 0.043923);
  assert.equal(r.cashFlowBeforeTax, 1098077 - 1315332);
  assert.equal(r.monthlyCashFlowBeforeTax, -18105);
});

test('a zero-rate repayment mortgage repays the loan evenly', () => {
  const r = run(base({ price: gbp(120000), mortgage: { depositRate: 0, interestRate: 0, type: 'repayment', termYears: 10 } }));
  assert.equal(r.mortgage.loan, gbp(120000));
  assert.equal(r.mortgage.monthlyPayment, gbp(1000));
  assert.equal(r.mortgage.annualInterest, 0);
  assert.equal(r.mortgage.annualCapital, gbp(12000));
  assert.equal(r.mortgage.interestCover, null);
});

test('a 100% deposit means no loan, no interest and no interest cover', () => {
  const r = run(base({ mortgage: { depositRate: 1, interestRate: 0.05, type: 'interestOnly' } }));
  assert.equal(r.mortgage.loan, 0);
  assert.equal(r.mortgage.annualInterest, 0);
  assert.equal(r.mortgage.interestCover, null);
  assert.equal(r.cashInvested, gbp(250000));
});

test('no rent gives a zero gross yield and a negative net yield when there are costs', () => {
  const r = run(base({ monthlyRent: 0, lettingFeeRate: 0 }));
  assert.equal(r.grossYield, 0);
  assert.equal(r.netYield, -0.008);
});

test('with no cash invested the return on cash is not given', () => {
  const r = run(base({ mortgage: { depositRate: 0, interestRate: 0.05, type: 'interestOnly' } }));
  assert.equal(r.cashInvested, 0);
  assert.equal(r.cashOnCash, null);
});

test('income tax comes from the tax engine with running costs as expenses and interest as finance costs', () => {
  const input = base({ buyingCosts: gbp(10000), mortgage: { depositRate: 0.25, interestRate: 0.05, type: 'interestOnly' }, tax: { taxYear: '2026-27', region: 'england_wales_ni', otherIncome: gbp(45000) } });
  const r = run(input, { taxEngine, rates });
  const direct = taxEngine.calculate({
    taxYear: '2026-27',
    region: 'england_wales_ni',
    otherIncome: gbp(45000),
    properties: [{ rent: 1442308, expenses: 344231, financeCosts: gbp(9375) }],
    partner: null,
    reliefMode: 'auto',
    lossesBroughtForward: 0,
    financeCostsBroughtForward: 0,
  }, rates);
  assert.equal(r.tax.propertyTax, direct.owner.result.propertyTax);
  // By hand: £5,270 at 20% = £1,054, £5,710.77 at 40% = £2,284.31, less a £1,875 credit = £1,463.31
  assert.ok(Math.abs(r.tax.propertyTax - 146331) <= 2, `tax ${r.tax.propertyTax}`);
  assert.equal(r.tax.credit, gbp(1875));
  assert.equal(r.tax.route, 'expenses');
  assert.equal(r.tax.cashFlowAfterTax, r.cashFlowBeforeTax - r.tax.propertyTax);
  assert.equal(r.tax.cashOnCashAfterTax, Math.round(((r.cashFlowBeforeTax - r.tax.propertyTax) / gbp(72500)) * 1000000) / 1000000);
});

test('a Scottish taxpayer is taxed on the same profit at Scottish rates', () => {
  const england = run(base({ tax: { taxYear: '2026-27', region: 'england_wales_ni', otherIncome: gbp(45000) } }), { taxEngine, rates });
  const scotland = run(base({ tax: { taxYear: '2026-27', region: 'scotland', otherIncome: gbp(45000) } }), { taxEngine, rates });
  assert.ok(scotland.tax.propertyTax > england.tax.propertyTax);
  assert.equal(scotland.netYield, england.netYield);
});

test('tax needs the tax engine and passes its errors through', () => {
  assert.deepEqual(codes(base({ tax: { taxYear: '2026-27', region: 'england_wales_ni', otherIncome: 0 } })), ['tax:taxEngineMissing']);
  assert.deepEqual(codes(base({ tax: { taxYear: '1999-00', region: 'england_wales_ni', otherIncome: 0 } }), { taxEngine, rates }), ['tax.taxYear:unknownTaxYear']);
});

test('invalid input is refused with a field and a code', () => {
  assert.deepEqual(codes(base({ price: 0 })), ['price:priceMustBeAboveZero']);
  assert.deepEqual(codes(base({ price: -5 })), ['price:negative']);
  assert.deepEqual(codes(base({ monthlyRent: 100.5 })), ['monthlyRent:notWholePence']);
  assert.deepEqual(codes(base({ runningCosts: Number.NaN })), ['runningCosts:notANumber']);
  assert.deepEqual(codes(base({ voidWeeks: 53 })), ['voidWeeks:outOfRange']);
  assert.deepEqual(codes(base({ lettingFeeRate: 1.5 })), ['lettingFeeRate:outOfRange']);
  assert.deepEqual(codes(base({ mortgage: { depositRate: 1.2, interestRate: 0.05 } })), ['depositRate:outOfRange']);
  assert.deepEqual(codes(base({ mortgage: { depositRate: 0.25, interestRate: 0.05, type: 'offset' } })), ['mortgageType:unknownMortgageType']);
  assert.deepEqual(codes(base({ mortgage: { depositRate: 0.25, interestRate: 0.05, type: 'repayment', termYears: 0 } })), ['termYears:outOfRange']);
  assert.deepEqual(codes(base({ mortgage: { depositRate: 0.25, interestRate: 0.05, type: 'repayment', termYears: 22.5 } })), ['termYears:notWholeYears']);
  assert.deepEqual(codes(base({ price: gbp(100000001) })), ['price:tooLarge']);
});

test('every money figure is a whole number of pence', () => {
  const r = run(base({ buyingCosts: gbp(7777.77), mortgage: { depositRate: 0.15, interestRate: 0.0549, type: 'repayment', termYears: 23 }, tax: { taxYear: '2026-27', region: 'scotland', otherIncome: gbp(38123.45) } }), { taxEngine, rates });
  const money = [r.annualRent, r.voidLoss, r.rentCollected, r.lettingFees, r.runningTotal, r.netIncome, r.cashInvested, r.cashFlowBeforeTax, r.monthlyCashFlowBeforeTax,
    r.mortgage.deposit, r.mortgage.loan, r.mortgage.monthlyPayment, r.mortgage.annualInterest, r.mortgage.annualCapital, r.tax.propertyTax, r.tax.cashFlowAfterTax, r.tax.monthlyCashFlowAfterTax];
  money.forEach((value) => assert.ok(Number.isInteger(value), `not whole pence: ${value}`));
  assert.equal(r.mortgage.deposit + r.mortgage.loan, r.price);
});
