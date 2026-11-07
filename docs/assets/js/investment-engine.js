/*
 * CalculateMyTax buy-to-let investment engine.
 *
 * Pure calculation for the buy-to-let investment appraisal: purchase tax (SDLT, LBTT with the Additional
 * Dwelling Supplement, or LTT), the cash needed to buy, a lender-style rent cover check, the break-even rent,
 * and a year-by-year illustration of cash flow, equity and sale proceeds. Money is in whole pence and rates are
 * decimals (0.05 means 5%).
 *
 * The first year's letting figures, mortgage and income tax are not recalculated here: this engine calls the
 * rental yield engine, which in turn calls the tax engine, so one property gives the same answer in every tool.
 * Purchase tax comes from the shared purchase tax engine, the same one the stamp duty calculator uses.
 * It holds no page code, so the browser and the tests run the same file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./purchase-tax-engine.js'));
  } else {
    root.CalculateMyTaxInvestmentEngine = factory(root.CalculateMyTaxPurchaseTaxEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (purchaseTaxEngine) {
  'use strict';

  var MAX_PENCE = 10000000000;
  var MORTGAGE_TYPES = ['interestOnly', 'repayment'];
  var MONEY_FIELDS = ['price', 'monthlyRent', 'legalFees', 'refurbishment', 'mortgageFees',
    'repairs', 'insurance', 'serviceCharge', 'otherCosts', 'otherIncome'];

  var purchaseTax = purchaseTaxEngine.purchaseTax;

  function validate(input, config) {
    var errors = [];
    var money = function (field, min) {
      var value = input[field];
      if (typeof value !== 'number' || !isFinite(value) || !Number.isSafeInteger(value) || value < min || value > MAX_PENCE) {
        errors.push({ field: field, code: 'money' });
      }
    };
    var range = function (field, min, max, whole) {
      var value = input[field];
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push({ field: field, code: 'range' });
      } else if (whole && !Number.isSafeInteger(value)) {
        errors.push({ field: field, code: 'wholeNumber' });
      } else if (value < min || value > max) {
        errors.push({ field: field, code: 'range' });
      } else {
        return true;
      }
      return false;
    };

    MONEY_FIELDS.forEach(function (field) {
      money(field, field === 'price' ? 1 : 0);
    });
    range('depositRate', 0, 1);
    range('interestRate', 0, 0.5);
    range('lettingFeeRate', 0, 1);
    range('voidWeeks', 0, 52);
    range('termYears', 1, 50, true);
    range('stressRate', 0.0001, 0.5);
    range('icr', 1, 3);
    range('maxLtv', 0, 1);
    var holdingYearsValid = range('holdingYears', 1, 30, true);
    range('growth', -0.2, 0.2);
    range('rentGrowth', -0.2, 0.2);
    range('costGrowth', -0.2, 0.2);
    range('sellingFeeRate', 0, 0.1);

    if (!config.nations[input.nation]) {
      errors.push({ field: 'nation', code: 'unknownNation' });
    }
    if (MORTGAGE_TYPES.indexOf(input.mortgageType) === -1) {
      errors.push({ field: 'mortgageType', code: 'unknownMortgageType' });
    }
    if (typeof input.additional !== 'boolean') {
      errors.push({ field: 'additional', code: 'unknownBasis' });
    }
    // An interest-only loan still has to be repaid at the end of its term, and refinancing is not modelled,
    // so the illustration must not run past the term. Only worth saying once the holding period itself is sound.
    if (holdingYearsValid && input.depositRate < 1 && input.mortgageType === 'interestOnly'
      && input.holdingYears > input.termYears) {
      errors.push({ field: 'holdingYears', code: 'beyondInterestOnlyTerm' });
    }
    return errors;
  }

  /*
   * One year of the illustration. Interest-only loans never reduce the balance, so a year's interest is the
   * whole loan at the interest rate. Repayment loans take a fixed monthly payment, split each month between
   * interest on the balance that is left and capital, so the balance falls through the year.
   */
  function mortgageYear(balance, input, monthlyPayment) {
    if (input.mortgageType === 'interestOnly') {
      return { interest: Math.round(balance * input.interestRate), capital: 0, balance: balance };
    }
    var interest = 0;
    var capital = 0;
    var left = balance;
    for (var month = 0; month < 12 && left > 0; month += 1) {
      var monthInterest = Math.round(left * input.interestRate / 12);
      var monthCapital = Math.max(0, Math.min(left, monthlyPayment - monthInterest));
      interest += monthInterest;
      capital += monthCapital;
      left -= monthCapital;
    }
    return { interest: interest, capital: capital, balance: left };
  }

  function calculate(rawInput, options) {
    var settings = options || {};
    var config = settings.purchaseRates;
    if (!config || !settings.yieldEngine || !settings.taxEngine || !settings.rates) {
      return { ok: false, errors: [{ field: 'options', code: 'missingEngines' }] };
    }
    var input = rawInput || {};
    var errors = validate(input, config);
    if (errors.length) {
      return { ok: false, errors: errors };
    }

    var tax = purchaseTax(input.price, input.nation, input.additional, config);
    var buyingCosts = tax.total + input.legalFees + input.refurbishment + input.mortgageFees;
    var runningCosts = input.repairs + input.insurance + input.serviceCharge + input.otherCosts;

    // The first year, including income tax, comes from the rental yield engine.
    var first = settings.yieldEngine.calculate({
      price: input.price,
      monthlyRent: input.monthlyRent,
      runningCosts: runningCosts,
      lettingFeeRate: input.lettingFeeRate,
      voidWeeks: input.voidWeeks,
      buyingCosts: buyingCosts,
      mortgage: {
        depositRate: input.depositRate,
        interestRate: input.interestRate,
        type: input.mortgageType,
        termYears: input.termYears
      },
      tax: { taxYear: input.taxYear, region: input.region, otherIncome: input.otherIncome }
    }, { taxEngine: settings.taxEngine, rates: settings.rates });
    if (!first.ok) {
      return first;
    }

    /*
     * Lender-style rent cover check. Buy-to-let lenders test the rent against interest at a stress rate,
     * usually higher than the rate actually paid, and require the rent to cover it by the interest cover
     * ratio. These are the user's own assumptions, not a lender's decision.
     */
    var loan = first.mortgage.loan;
    var stressInterest = Math.round(loan * input.stressRate);
    var loanLimitByRent = Math.floor(first.annualRent / (input.stressRate * input.icr));
    var loanLimitByValue = Math.round(input.price * input.maxLtv);
    var maxLoan = Math.min(loanLimitByValue, loanLimitByRent);
    var stress = {
      rate: input.stressRate,
      icr: input.icr,
      annualInterest: stressInterest,
      cover: stressInterest > 0 ? Math.round((first.annualRent / stressInterest) * 10000) / 10000 : null,
      requiredMonthlyRent: Math.ceil(stressInterest * input.icr / 12),
      maxLoan: maxLoan,
      minimumCash: input.price - maxLoan + buyingCosts,
      passes: loan === 0 || (first.annualRent >= stressInterest * input.icr && loan <= loanLimitByValue)
    };

    /*
     * Break-even scheduled rent before income tax: the rent that would leave cash flow at zero, with the same
     * empty weeks and letting fee. Only the share of rent actually collected and kept pays the bills, so when
     * empty weeks or the fee take everything there is no finite answer.
     */
    var retained = (1 - input.voidWeeks / 52) * (1 - input.lettingFeeRate);
    var breakEvenRent = retained > 0
      ? Math.ceil((runningCosts + first.mortgage.annualPayments) / (12 * retained))
      : null;

    var projection = [];
    var balance = loan;
    var cumulativeCash = 0;
    for (var year = 1; year <= input.holdingYears; year += 1) {
      var mortgage = mortgageYear(balance, input, first.mortgage.monthlyPayment);
      balance = mortgage.balance;
      var scheduledRent = Math.round(first.annualRent * Math.pow(1 + input.rentGrowth, year - 1));
      var collected = scheduledRent - Math.round(scheduledRent * input.voidWeeks / 52);
      var operatingCosts = Math.round(runningCosts * Math.pow(1 + input.costGrowth, year - 1))
        + Math.round(collected * input.lettingFeeRate);
      var cash = collected - operatingCosts - mortgage.interest - mortgage.capital;
      cumulativeCash += cash;
      var value = Math.round(input.price * Math.pow(1 + input.growth, year));
      var sellingCosts = Math.round(value * input.sellingFeeRate);
      var proceeds = value - sellingCosts - balance;
      projection.push({
        year: year,
        value: value,
        balance: balance,
        interest: mortgage.interest,
        capital: mortgage.capital,
        collected: collected,
        operatingCosts: operatingCosts,
        cash: cash,
        cumulativeCash: cumulativeCash,
        equity: value - balance,
        sellingCosts: sellingCosts,
        proceeds: proceeds,
        totalProfit: cumulativeCash + proceeds - first.cashInvested
      });
    }

    return {
      ok: true,
      errors: [],
      input: input,
      purchaseTax: tax,
      buyingCosts: buyingCosts,
      runningCosts: runningCosts,
      first: first,
      stress: stress,
      breakEvenRent: breakEvenRent,
      projection: projection
    };
  }

  return {
    MORTGAGE_TYPES: MORTGAGE_TYPES.slice(),
    purchaseTax: purchaseTax,
    validate: validate,
    calculate: calculate
  };
}));
