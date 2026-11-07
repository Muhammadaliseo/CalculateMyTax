/*
 * CalculateMyTax purchase tax engine.
 *
 * Pure calculation of the tax due when buying a home in the UK: Stamp Duty Land Tax in England and Northern
 * Ireland, Land and Buildings Transaction Tax with the Additional Dwelling Supplement in Scotland, and Land
 * Transaction Tax in Wales. Money is in whole pence and rates are decimals (0.05 means 5%).
 *
 * Every band and rate comes from data/purchase-rates.json, so a Budget is a change to that file alone. Both the
 * stamp duty calculator and the buy-to-let appraisal use this one engine, so they can never disagree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CalculateMyTaxPurchaseTaxEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_PENCE = 10000000000;
  var BASES = ['standard', 'additional', 'firstTimeBuyer'];

  // Purchase tax is charged in slices: each band's rate applies only to the part of the price inside it.
  function bandRows(price, limits, rates) {
    var lower = 0;
    return limits.map(function (upper, i) {
      var top = upper === null ? price : Math.min(price, upper);
      var portion = Math.max(0, top - lower);
      var row = { lower: lower, upper: upper, portion: portion, rate: rates[i], tax: Math.round(portion * rates[i]) };
      lower = upper;
      return row;
    });
  }

  function sum(rows, supplement) {
    return rows.reduce(function (total, row) {
      return total + row.tax;
    }, supplement);
  }

  // 'additional' and 'standard' may also be given as the booleans the buy-to-let engine has always passed.
  function readBasis(basis) {
    if (basis === true) {
      return 'additional';
    }
    if (basis === false || basis === undefined || basis === null) {
      return 'standard';
    }
    return basis;
  }

  /*
   * Work out the tax. The basis is how the buyer stands:
   *   'additional'      they will own more than one home, so the higher rates or the supplement apply
   *   'standard'        this will be their only home, and they have owned one before
   *   'firstTimeBuyer'  they qualify for first-time buyer relief, where the nation offers it
   *
   * Two rules make the answer differ from the headline tables. The extra charge on an additional property only
   * starts at the configured minimum price. First-time buyer relief is not offered everywhere, and in England
   * and Northern Ireland it disappears completely above a set price rather than tapering.
   */
  function purchaseTax(price, nation, basis, config) {
    var rule = config.nations[nation];
    if (!rule) {
      throw new Error('Unknown property location: ' + nation);
    }
    if (!Number.isSafeInteger(price) || price < 0 || price > MAX_PENCE) {
      throw new Error('Purchase price must be whole pence between 0 and ' + MAX_PENCE);
    }
    var asked = readBasis(basis);
    if (BASES.indexOf(asked) === -1) {
      throw new Error('Unknown buyer basis: ' + asked);
    }

    var relief = rule.firstTimeBuyer || null;
    var reliefOffered = asked === 'firstTimeBuyer' && Boolean(relief);
    var reliefLost = reliefOffered && typeof relief.maxPrice === 'number' && price > relief.maxPrice;
    var applied = reliefOffered && !reliefLost ? 'firstTimeBuyer' : asked === 'firstTimeBuyer' ? 'standard' : asked;

    var higher = applied === 'additional' && price >= config.additionalMinimum;
    var limits = applied === 'firstTimeBuyer' ? relief.limits
      : higher && rule.higherLimits ? rule.higherLimits : rule.limits;
    var rates = applied === 'firstTimeBuyer' ? relief.rates
      : higher && rule.higherRates ? rule.higherRates : rule.rates;

    var rows = bandRows(price, limits, rates);
    var supplementRate = higher && rule.supplement ? rule.supplement : 0;
    var supplement = Math.round(price * supplementRate);
    var total = sum(rows, supplement);

    // What the relief is worth: the same purchase on the ordinary rates, less what is actually due.
    var saving = applied === 'firstTimeBuyer'
      ? sum(bandRows(price, rule.limits, rule.rates), 0) - total
      : 0;

    return {
      name: rule.name,
      label: rule.label || rule.name,
      nation: nation,
      price: price,
      basis: asked,
      appliedBasis: applied,
      rows: rows,
      higher: higher,
      supplement: supplement,
      supplementRate: supplementRate,
      supplementName: rule.supplementName || null,
      firstTimeBuyer: {
        asked: asked === 'firstTimeBuyer',
        offeredHere: Boolean(relief),
        lostOnPrice: reliefLost,
        lostAbove: relief && typeof relief.maxPrice === 'number' ? relief.maxPrice : null,
        saving: saving
      },
      effectiveRate: price > 0 ? Math.round((total / price) * 1000000) / 1000000 : 0,
      total: total
    };
  }

  return {
    BASES: BASES.slice(),
    bandRows: bandRows,
    purchaseTax: purchaseTax
  };
}));
