/*
 * CalculateMyTax rental income tax engine.
 *
 * Pure calculation with no DOM access, so the same file runs in the browser, in the Node tests and, after
 * migration, as an enqueued WordPress script. Every money value going in or coming out is an integer number
 * of pence. Rates, thresholds and allowances come from one tax year of data/rates.json; none live here.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CalculateMyTaxEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROUTES = ['expenses', 'propertyAllowance', 'rentARoom'];
  var RELIEF_MODES = ['auto', 'expenses', 'propertyAllowance', 'rentARoom'];
  var LETTING_TYPES = ['standard', 'roomInOwnHome'];
  var MAX_PENCE = 100000000000;

  function basisPoints(rate) {
    return Math.round(rate * 10000);
  }

  function applyRate(amount, rate) {
    return Math.round(amount * basisPoints(rate) / 10000);
  }

  function applyShare(amount, percent) {
    return Math.round(amount * percent / 100);
  }

  function roundRate(value) {
    return Math.round(value * 10000) / 10000;
  }

  function totalOf(list, key) {
    var total = 0;
    for (var i = 0; i < list.length; i += 1) {
      total += list[i][key];
    }
    return total;
  }

  /* Personal allowance and bands */

  function personalAllowanceFor(adjustedNetIncome, year) {
    var excess = Math.floor(adjustedNetIncome / 100) * 100 - year.paTaperThreshold;
    if (excess <= 0) {
      return year.personalAllowance;
    }
    var reduction = Math.floor(excess / (100 * year.paTaperRate)) * 100;
    return Math.max(0, year.personalAllowance - reduction);
  }

  function taxSlices(from, to, bands) {
    var slices = [];
    var lower = 0;
    for (var i = 0; i < bands.length && lower < to; i += 1) {
      var upper = bands[i].upTo === null ? Infinity : bands[i].upTo;
      var start = Math.max(from, lower);
      var end = Math.min(to, upper);
      if (end > start) {
        slices.push({
          name: bands[i].name,
          rate: bands[i].rate,
          amount: end - start,
          tax: applyRate(end - start, bands[i].rate)
        });
      }
      lower = upper;
    }
    return slices;
  }

  function incomeTax(otherIncome, propertyIncome, year, region) {
    var adjustedNetIncome = otherIncome + propertyIncome;
    var allowance = personalAllowanceFor(adjustedNetIncome, year);
    // The allowance goes against other income first, then property income. From 2027/28 this is the
    // statutory order (paOrdering "employment_first"). Earlier years tax both slices at the same rates,
    // so the order cannot change the answer.
    var paAgainstOther = Math.min(allowance, otherIncome);
    var paAgainstProperty = Math.min(allowance - paAgainstOther, propertyIncome);
    var otherTaxable = otherIncome - paAgainstOther;
    var propertyTaxable = propertyIncome - paAgainstProperty;
    var propertyBands = region.propertyIncomeBands || region.bands;
    var otherSlices = taxSlices(0, otherTaxable, region.bands);
    var propertySlices = taxSlices(otherTaxable, otherTaxable + propertyTaxable, propertyBands);
    return {
      adjustedNetIncome: adjustedNetIncome,
      personalAllowance: allowance,
      paAgainstOther: paAgainstOther,
      paAgainstProperty: paAgainstProperty,
      unusedPersonalAllowance: allowance - paAgainstOther - paAgainstProperty,
      otherTaxable: otherTaxable,
      propertyTaxable: propertyTaxable,
      otherSlices: otherSlices,
      propertySlices: propertySlices,
      otherTax: totalOf(otherSlices, 'tax'),
      propertyTax: totalOf(propertySlices, 'tax')
    };
  }

  function marginalBand(tax, region) {
    if (tax.propertySlices.length) {
      var top = tax.propertySlices[tax.propertySlices.length - 1];
      return { name: top.name, rate: top.rate };
    }
    if (tax.unusedPersonalAllowance > 0) {
      return { name: null, rate: 0 };
    }
    var next = taxSlices(tax.otherTaxable, tax.otherTaxable + 100, region.propertyIncomeBands || region.bands)[0];
    return { name: next.name, rate: next.rate };
  }

  /* One relief route for one person */

  function computeRoute(route, person, year, region) {
    var gross = person.grossRent;
    var deduction;
    var financeCurrent = 0;
    var financeBroughtForward = 0;

    if (route === 'expenses') {
      deduction = person.expenses;
      financeCurrent = person.financeCosts;
      financeBroughtForward = person.financeCostsBroughtForward;
    } else if (route === 'propertyAllowance') {
      // Claiming the allowance means no expenses and no finance cost credit this year (ITTOIA s783BL).
      deduction = Math.min(gross, year.propertyAllowance);
    } else {
      // Rent a Room method B: receipts over the limit are taxed with no expenses and no finance costs.
      deduction = Math.min(gross, person.rentARoomShared ? year.rentARoomShared : year.rentARoom);
    }

    var profit = gross - deduction;
    var lossUsed = profit > 0 ? Math.min(person.lossesBroughtForward, profit) : 0;
    var taxableProfit = Math.max(0, profit - lossUsed);
    var lossCarriedForward = person.lossesBroughtForward - lossUsed + Math.max(0, -profit);

    var tax = incomeTax(person.otherIncome, taxableProfit, year, region);
    var taxBeforeCredit = tax.otherTax + tax.propertyTax;
    var taxOnOtherIncomeOnly = incomeTax(person.otherIncome, 0, year, region).otherTax;

    // Section 24: the credit is the relief rate times the lowest of finance costs (with amounts brought
    // forward), property profits after losses, and income above the personal allowance. It can never
    // exceed the tax due. Savings and dividends are not collected, so they cannot affect the income limb.
    var financeLimb = financeCurrent + financeBroughtForward;
    var incomeLimb = Math.max(0, tax.adjustedNetIncome - tax.personalAllowance);
    var relieved = Math.min(financeLimb, taxableProfit, incomeLimb);
    var uncappedCredit = applyRate(relieved, year.financeReliefRate);
    var credit = Math.min(uncappedCredit, taxBeforeCredit);
    var limitingFactor = 'financeCosts';
    if (relieved !== financeLimb) {
      limitingFactor = relieved === taxableProfit ? 'profits' : 'income';
    }
    var finance = {
      currentYear: financeCurrent,
      broughtForward: financeBroughtForward,
      financeLimb: financeLimb,
      profitLimb: taxableProfit,
      incomeLimb: incomeLimb,
      relieved: relieved,
      limitingFactor: limitingFactor,
      reliefRate: year.financeReliefRate,
      credit: credit,
      creditCappedByTax: uncappedCredit > credit,
      carriedForward: financeLimb - relieved + (route === 'expenses' ? 0 : person.financeCostsBroughtForward)
    };

    var totalTax = taxBeforeCredit - credit;
    var propertyTax = totalTax - taxOnOtherIncomeOnly;
    var band = marginalBand(tax, region);
    var inTaperZone = tax.adjustedNetIncome > year.paTaperThreshold && tax.personalAllowance > 0;

    var pre2017PropertyTax = null;
    if (route === 'expenses' && person.financeCosts > 0) {
      var oldProfit = gross - person.expenses - person.financeCosts;
      var oldLossUsed = oldProfit > 0 ? Math.min(person.lossesBroughtForward, oldProfit) : 0;
      var oldTax = incomeTax(person.otherIncome, Math.max(0, oldProfit - oldLossUsed), year, region);
      pre2017PropertyTax = oldTax.otherTax + oldTax.propertyTax - taxOnOtherIncomeOnly;
    }

    var rentBreakdown = [{ kind: 'deduction', route: route, amount: Math.min(gross, Math.max(0, deduction)) }];
    if (lossUsed > 0) {
      rentBreakdown.push({ kind: 'lossRelief', amount: lossUsed });
    }
    if (tax.paAgainstProperty > 0) {
      rentBreakdown.push({ kind: 'personalAllowance', amount: tax.paAgainstProperty });
    }
    for (var i = 0; i < tax.propertySlices.length; i += 1) {
      rentBreakdown.push({
        kind: 'band',
        name: tax.propertySlices[i].name,
        rate: tax.propertySlices[i].rate,
        amount: tax.propertySlices[i].amount
      });
    }

    return {
      route: route,
      deduction: deduction,
      profit: profit,
      lossUsed: lossUsed,
      lossCarriedForward: lossCarriedForward,
      taxableProfit: taxableProfit,
      adjustedNetIncome: tax.adjustedNetIncome,
      personalAllowance: tax.personalAllowance,
      paAgainstOther: tax.paAgainstOther,
      paAgainstProperty: tax.paAgainstProperty,
      otherSlices: tax.otherSlices,
      propertySlices: tax.propertySlices,
      taxBeforeCredit: taxBeforeCredit,
      finance: finance,
      totalTax: totalTax,
      taxOnOtherIncomeOnly: taxOnOtherIncomeOnly,
      propertyTax: propertyTax,
      netRentalIncome: gross - person.expenses - person.financeCosts - propertyTax,
      effectiveRate: gross > 0 ? roundRate(propertyTax / gross) : 0,
      marginalBandName: band.name,
      marginalRate: band.rate,
      inTaperZone: inTaperZone,
      effectiveMarginalRate: roundRate(inTaperZone ? band.rate * (1 + 1 / year.paTaperRate) : band.rate),
      pre2017PropertyTax: pre2017PropertyTax,
      section24Cost: pre2017PropertyTax === null ? null : propertyTax - pre2017PropertyTax,
      rentBreakdown: rentBreakdown
    };
  }

  function unavailableReason(route, person, year, region) {
    if (route === 'propertyAllowance') {
      if (person.lettingType === 'roomInOwnHome') {
        return 'notForRentARoomIncome';
      }
      if (person.financeCostsBroughtForward > 0) {
        // PIM4460: the allowance cannot be chosen where brought-forward finance costs would reduce the tax.
        var check = computeRoute('expenses', person, year, region);
        if (check.finance.credit > 0 && check.finance.relieved > check.finance.currentYear) {
          return 'broughtForwardFinanceCosts';
        }
      }
    }
    if (route === 'rentARoom' && person.lettingType !== 'roomInOwnHome') {
      return 'onlyForRoomInOwnHome';
    }
    return null;
  }

  function calculatePerson(person, year, region, reliefMode) {
    var routes = {};
    var recommended = null;
    for (var i = 0; i < ROUTES.length; i += 1) {
      var route = ROUTES[i];
      var reason = unavailableReason(route, person, year, region);
      routes[route] = reason
        ? { available: false, reason: reason, result: null }
        : { available: true, reason: null, result: computeRoute(route, person, year, region) };
      if (routes[route].available && (recommended === null || routes[route].result.totalTax < routes[recommended].result.totalTax)) {
        recommended = route;
      }
    }

    var warnings = [];
    var selected = recommended;
    if (reliefMode !== 'auto') {
      if (routes[reliefMode].available) {
        selected = reliefMode;
      } else {
        warnings.push({ code: 'selectedRouteUnavailable', route: reliefMode, reason: routes[reliefMode].reason });
      }
    }

    var result = routes[selected].result;
    if (selected === 'propertyAllowance' && person.financeCosts > 0) {
      warnings.push({ code: 'allowanceForfeitsCredit', amount: routes.expenses.result.finance.credit });
    }
    if (result.finance.creditCappedByTax) {
      warnings.push({ code: 'creditCappedByTax' });
    }
    if (result.finance.carriedForward > 0) {
      warnings.push({ code: 'financeCostsCarriedForward', amount: result.finance.carriedForward });
    }
    if (result.lossCarriedForward > 0) {
      warnings.push({ code: 'lossCarriedForward', amount: result.lossCarriedForward });
    }
    if (result.inTaperZone) {
      warnings.push({ code: 'personalAllowanceTaper', rate: result.effectiveMarginalRate });
    }

    return {
      share: person.share,
      grossRent: person.grossRent,
      expenses: person.expenses,
      financeCosts: person.financeCosts,
      recommendedRoute: recommended,
      selectedRoute: selected,
      routes: routes,
      result: result,
      warnings: warnings
    };
  }

  /* Input handling */

  function normalise(input) {
    var source = input || {};
    var properties = Array.isArray(source.properties) ? source.properties : [];
    return {
      taxYear: source.taxYear,
      region: source.region,
      otherIncome: source.otherIncome === undefined ? 0 : source.otherIncome,
      properties: properties.map(function (p) {
        return {
          rent: p && p.rent !== undefined ? p.rent : 0,
          expenses: p && p.expenses !== undefined ? p.expenses : 0,
          financeCosts: p && p.financeCosts !== undefined ? p.financeCosts : 0
        };
      }),
      ownerShare: source.ownerShare === undefined ? 100 : source.ownerShare,
      partner: source.partner || null,
      lettingType: source.lettingType || 'standard',
      rentARoomShared: Boolean(source.rentARoomShared),
      reliefMode: source.reliefMode || 'auto',
      lossesBroughtForward: source.lossesBroughtForward === undefined ? 0 : source.lossesBroughtForward,
      financeCostsBroughtForward: source.financeCostsBroughtForward === undefined ? 0 : source.financeCostsBroughtForward
    };
  }

  function validate(input, rates) {
    var errors = [];
    function money(field, value) {
      if (typeof value !== 'number' || !isFinite(value)) {
        errors.push({ field: field, code: 'notANumber' });
      } else if (value < 0) {
        errors.push({ field: field, code: 'negative' });
      } else if (Math.floor(value) !== value) {
        errors.push({ field: field, code: 'notWholePence' });
      } else if (value > MAX_PENCE) {
        errors.push({ field: field, code: 'tooLarge' });
      }
    }

    if (!rates || !rates[input.taxYear]) {
      errors.push({ field: 'taxYear', code: 'unknownTaxYear' });
    } else if (!rates[input.taxYear].regions[input.region]) {
      errors.push({ field: 'region', code: 'unknownRegion' });
    }
    money('otherIncome', input.otherIncome);
    if (input.properties.length === 0) {
      errors.push({ field: 'properties', code: 'noProperties' });
    }
    input.properties.forEach(function (p, i) {
      money('properties.' + i + '.rent', p.rent);
      money('properties.' + i + '.expenses', p.expenses);
      money('properties.' + i + '.financeCosts', p.financeCosts);
    });
    if (typeof input.ownerShare !== 'number' || !(input.ownerShare > 0) || input.ownerShare > 100) {
      errors.push({ field: 'ownerShare', code: 'shareOutOfRange' });
    }
    if (input.partner) {
      money('partner.otherIncome', input.partner.otherIncome);
      if (input.ownerShare >= 100) {
        errors.push({ field: 'ownerShare', code: 'jointShareMustBeBelow100' });
      }
    }
    if (RELIEF_MODES.indexOf(input.reliefMode) === -1) {
      errors.push({ field: 'reliefMode', code: 'unknownReliefMode' });
    }
    if (LETTING_TYPES.indexOf(input.lettingType) === -1) {
      errors.push({ field: 'lettingType', code: 'unknownLettingType' });
    }
    money('lossesBroughtForward', input.lossesBroughtForward);
    money('financeCostsBroughtForward', input.financeCostsBroughtForward);
    return errors;
  }

  function buildPerson(input, share, otherIncome, isOwner) {
    var person = {
      share: share,
      otherIncome: otherIncome,
      grossRent: 0,
      expenses: 0,
      financeCosts: 0,
      lettingType: input.lettingType,
      rentARoomShared: input.rentARoomShared || (Boolean(input.partner) && share < 100),
      lossesBroughtForward: isOwner ? input.lossesBroughtForward : 0,
      financeCostsBroughtForward: isOwner ? input.financeCostsBroughtForward : 0
    };
    input.properties.forEach(function (p) {
      person.grossRent += applyShare(p.rent, share);
      person.expenses += applyShare(p.expenses, share);
      person.financeCosts += applyShare(p.financeCosts, share);
    });
    return person;
  }

  /* Public API */

  function calculate(rawInput, rates) {
    var input = normalise(rawInput);
    var errors = validate(input, rates);
    if (errors.length) {
      return { ok: false, errors: errors };
    }
    var year = rates[input.taxYear];
    var region = year.regions[input.region];
    var ownerShare = input.partner ? input.ownerShare : 100;
    var owner = calculatePerson(buildPerson(input, ownerShare, input.otherIncome, true), year, region, input.reliefMode);
    var partner = input.partner
      ? calculatePerson(buildPerson(input, 100 - ownerShare, input.partner.otherIncome, false), year, region, input.reliefMode)
      : null;
    return {
      ok: true,
      taxYear: { key: input.taxYear, label: year.label, isForecast: year.isForecast, forecastNote: year.forecastNote, lastVerified: year.lastVerified },
      region: { key: input.region, label: region.label, assumed: region.assumed, notes: region.notes },
      owner: owner,
      partner: partner
    };
  }

  function listTaxYears(rates) {
    return Object.keys(rates).sort(function (a, b) {
      return rates[a].startDate < rates[b].startDate ? -1 : 1;
    });
  }

  function currentTaxYear(rates, isoDate) {
    var keys = listTaxYears(rates);
    for (var i = 0; i < keys.length; i += 1) {
      if (rates[keys[i]].startDate <= isoDate && isoDate <= rates[keys[i]].endDate) {
        return keys[i];
      }
    }
    return null;
  }

  function nextPropertyRateChange(rates, fromKey) {
    var from = rates[fromKey];
    if (!from) {
      return null;
    }
    var keys = listTaxYears(rates);
    for (var i = 0; i < keys.length; i += 1) {
      var year = rates[keys[i]];
      if (year.startDate <= from.startDate) {
        continue;
      }
      if (year.financeReliefRate !== from.financeReliefRate) {
        return keys[i];
      }
      for (var region in year.regions) {
        if (Object.prototype.hasOwnProperty.call(year.regions, region) && year.regions[region].propertyIncomeBands) {
          return keys[i];
        }
      }
    }
    return null;
  }

  function mtdStatus(qualifyingIncome, mtd) {
    var phases = mtd.phases.slice().sort(function (a, b) { return b.threshold - a.threshold; });
    for (var i = 0; i < phases.length; i += 1) {
      if (qualifyingIncome > phases[i].threshold) {
        return { threshold: phases[i].threshold, testYear: phases[i].testYear, startDate: phases[i].startDate };
      }
    }
    return null;
  }

  return {
    ROUTES: ROUTES.slice(),
    calculate: calculate,
    listTaxYears: listTaxYears,
    currentTaxYear: currentTaxYear,
    nextPropertyRateChange: nextPropertyRateChange,
    mtdStatus: mtdStatus
  };
}));
