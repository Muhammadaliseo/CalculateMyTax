/*
 * CalculateMyTax rental yield engine.
 *
 * Pure calculation for the rental yield calculator: gross and net yield, empty weeks and letting fees, the first
 * year of a mortgage (interest-only or repayment), cash flow, return on the cash invested, interest cover and,
 * when the tax engine and rates are passed in, income tax on the rental profit. Money is in whole pence and rates
 * are decimals (0.055 means 5.5%). It holds no page code, so the browser and the tests run the same file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CalculateMyTaxYieldEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_PENCE = 10000000000;
  var MORTGAGE_TYPES = ['interestOnly', 'repayment'];

  // Ratios are kept to six decimal places, enough for a yield shown to two decimal places.
  function ratio(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 1000000) / 1000000 : null;
  }

  function normalise(raw) {
    var input = raw || {};
    var mortgage = input.mortgage;
    var tax = input.tax;
    return {
      price: input.price,
      monthlyRent: input.monthlyRent,
      runningCosts: input.runningCosts === undefined ? 0 : input.runningCosts,
      lettingFeeRate: input.lettingFeeRate === undefined ? 0 : input.lettingFeeRate,
      voidWeeks: input.voidWeeks === undefined ? 0 : input.voidWeeks,
      buyingCosts: input.buyingCosts === undefined ? 0 : input.buyingCosts,
      mortgage: mortgage ? {
        depositRate: mortgage.depositRate,
        interestRate: mortgage.interestRate,
        type: mortgage.type || 'interestOnly',
        termYears: mortgage.termYears === undefined ? 25 : mortgage.termYears
      } : null,
      tax: tax ? {
        taxYear: tax.taxYear,
        region: tax.region,
        otherIncome: tax.otherIncome === undefined ? 0 : tax.otherIncome
      } : null
    };
  }

  function validate(input) {
    var errors = [];
    var money = function (field, value) {
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push({ field: field, code: 'notANumber' });
      } else if (value < 0) {
        errors.push({ field: field, code: 'negative' });
      } else if (Math.floor(value) !== value) {
        errors.push({ field: field, code: 'notWholePence' });
      } else if (value > MAX_PENCE) {
        errors.push({ field: field, code: 'tooLarge' });
      } else {
        return true;
      }
      return false;
    };
    var range = function (field, value, min, max) {
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push({ field: field, code: 'notANumber' });
      } else if (value < min || value > max) {
        errors.push({ field: field, code: 'outOfRange' });
      } else {
        return true;
      }
      return false;
    };

    if (money('price', input.price) && input.price === 0) {
      errors.push({ field: 'price', code: 'priceMustBeAboveZero' });
    }
    money('monthlyRent', input.monthlyRent);
    money('runningCosts', input.runningCosts);
    money('buyingCosts', input.buyingCosts);
    range('lettingFeeRate', input.lettingFeeRate, 0, 1);
    range('voidWeeks', input.voidWeeks, 0, 52);
    if (input.mortgage) {
      range('depositRate', input.mortgage.depositRate, 0, 1);
      range('interestRate', input.mortgage.interestRate, 0, 0.5);
      if (MORTGAGE_TYPES.indexOf(input.mortgage.type) === -1) {
        errors.push({ field: 'mortgageType', code: 'unknownMortgageType' });
      } else if (input.mortgage.type === 'repayment' && range('termYears', input.mortgage.termYears, 1, 50) &&
        Math.floor(input.mortgage.termYears) !== input.mortgage.termYears) {
        errors.push({ field: 'termYears', code: 'notWholeYears' });
      }
    }
    if (input.tax) {
      money('otherIncome', input.tax.otherIncome);
    }
    return errors;
  }

  // The first twelve months of the mortgage. Interest-only loans pay interest alone; repayment loans pay a fixed
  // monthly amount, split month by month between interest on the falling balance and capital.
  function firstYear(loan, rate, type, termYears) {
    if (loan === 0) {
      return { monthlyPayment: 0, annualInterest: 0, annualCapital: 0 };
    }
    if (type === 'interestOnly') {
      var interest = Math.round(loan * rate);
      return { monthlyPayment: Math.round(interest / 12), annualInterest: interest, annualCapital: 0 };
    }
    var months = termYears * 12;
    var monthlyRate = rate / 12;
    var payment = Math.round(monthlyRate === 0 ? loan / months : (loan * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)));
    var balance = loan;
    var interestTotal = 0;
    var capitalTotal = 0;
    for (var month = 0; month < Math.min(12, months) && balance > 0; month += 1) {
      var monthInterest = Math.round(balance * monthlyRate);
      var monthCapital = Math.min(balance, payment - monthInterest);
      interestTotal += monthInterest;
      capitalTotal += monthCapital;
      balance -= monthCapital;
    }
    return { monthlyPayment: payment, annualInterest: interestTotal, annualCapital: capitalTotal };
  }

  function calculate(rawInput, options) {
    var input = normalise(rawInput);
    var errors = validate(input);
    if (errors.length) {
      return { ok: false, errors: errors };
    }
    var settings = options || {};

    var annualRent = input.monthlyRent * 12;
    var voidLoss = Math.round((annualRent * input.voidWeeks) / 52);
    var rentCollected = annualRent - voidLoss;
    var lettingFees = Math.round(rentCollected * input.lettingFeeRate);
    var runningTotal = input.runningCosts + lettingFees;
    var netIncome = rentCollected - runningTotal;

    var mortgage = null;
    if (input.mortgage) {
      var loan = Math.round(input.price * (1 - input.mortgage.depositRate));
      var year = firstYear(loan, input.mortgage.interestRate, input.mortgage.type, input.mortgage.termYears);
      mortgage = {
        type: input.mortgage.type,
        depositRate: input.mortgage.depositRate,
        interestRate: input.mortgage.interestRate,
        termYears: input.mortgage.type === 'repayment' ? input.mortgage.termYears : null,
        deposit: input.price - loan,
        loan: loan,
        monthlyPayment: year.monthlyPayment,
        annualInterest: year.annualInterest,
        annualCapital: year.annualCapital,
        annualPayments: year.annualInterest + year.annualCapital,
        interestCover: year.annualInterest > 0 ? Math.round((annualRent / year.annualInterest) * 10000) / 10000 : null
      };
    }

    var cashInvested = (mortgage ? mortgage.deposit : input.price) + input.buyingCosts;
    var cashFlow = netIncome - (mortgage ? mortgage.annualPayments : 0);

    var result = {
      ok: true,
      errors: [],
      price: input.price,
      monthlyRent: input.monthlyRent,
      annualRent: annualRent,
      voidWeeks: input.voidWeeks,
      voidLoss: voidLoss,
      rentCollected: rentCollected,
      runningCosts: input.runningCosts,
      lettingFeeRate: input.lettingFeeRate,
      lettingFees: lettingFees,
      runningTotal: runningTotal,
      netIncome: netIncome,
      grossYield: ratio(annualRent, input.price),
      netYield: ratio(netIncome, input.price),
      buyingCosts: input.buyingCosts,
      cashInvested: cashInvested,
      mortgage: mortgage,
      cashFlowBeforeTax: cashFlow,
      monthlyCashFlowBeforeTax: Math.round(cashFlow / 12),
      cashOnCash: ratio(cashFlow, cashInvested),
      tax: null
    };

    if (input.tax) {
      if (!settings.taxEngine || !settings.rates) {
        return { ok: false, errors: [{ field: 'tax', code: 'taxEngineMissing' }] };
      }
      // Running costs are treated as allowable expenses and only mortgage interest counts as a finance cost;
      // capital repayments are never deductible. The tax engine picks the cheapest relief route.
      var taxed = settings.taxEngine.calculate({
        taxYear: input.tax.taxYear,
        region: input.tax.region,
        otherIncome: input.tax.otherIncome,
        properties: [{ rent: rentCollected, expenses: runningTotal, financeCosts: mortgage ? mortgage.annualInterest : 0 }],
        partner: null,
        reliefMode: 'auto',
        lossesBroughtForward: 0,
        financeCostsBroughtForward: 0
      }, settings.rates);
      if (!taxed.ok) {
        return {
          ok: false,
          errors: taxed.errors.map(function (error) {
            return { field: 'tax.' + error.field, code: error.code };
          })
        };
      }
      var owner = taxed.owner;
      var propertyTax = owner.result.propertyTax;
      var afterTax = cashFlow - propertyTax;
      result.tax = {
        taxYear: taxed.taxYear,
        region: taxed.region,
        otherIncome: input.tax.otherIncome,
        route: owner.selectedRoute,
        propertyTax: propertyTax,
        credit: owner.result.finance.credit,
        marginalRate: owner.result.marginalRate,
        marginalBandName: owner.result.marginalBandName,
        cashFlowAfterTax: afterTax,
        monthlyCashFlowAfterTax: Math.round(afterTax / 12),
        cashOnCashAfterTax: ratio(afterTax, cashInvested)
      };
    }

    return result;
  }

  return {
    MORTGAGE_TYPES: MORTGAGE_TYPES.slice(),
    calculate: calculate
  };
}));
