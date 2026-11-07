/*
 * CalculateMyTax buy-to-let investment appraisal interface.
 *
 * One portable unit: the appraisal section markup (src/partials/investment-calculator.html), investment.css and
 * this file, loaded after tax-engine.js, yield-engine.js and investment-engine.js. Every lookup stays inside its
 * own container, so two appraisals could share a page. Wording lives in the markup, including the
 * <template data-text> elements; this file writes only calculated figures and the rows built from them.
 */
(function (root) {
  'use strict';

  var engine = root.CalculateMyTaxInvestmentEngine;
  var yieldEngine = root.CalculateMyTaxYieldEngine;
  var taxEngine = root.CalculateMyTaxEngine;
  var DEBOUNCE_MS = 250;

  var MONEY_FIELDS = ['price', 'monthlyRent', 'legalFees', 'refurbishment', 'mortgageFees',
    'repairs', 'insurance', 'serviceCharge', 'otherCosts', 'otherIncome'];
  var PERCENT_FIELDS = ['depositRate', 'interestRate', 'lettingFeeRate', 'stressRate', 'icr', 'maxLtv',
    'growth', 'rentGrowth', 'costGrowth', 'sellingFeeRate'];
  var SIGNED_FIELDS = ['growth', 'rentGrowth', 'costGrowth'];

  var wholePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  var poundsAndPence = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function readConfig(name) {
    var node = document.getElementById('cmt-config-' + name);
    if (!node) {
      return null;
    }
    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      return null;
    }
  }

  function build(el, config) {
    var form = el.querySelector('[data-investment-form]');
    var results = el.querySelector('[data-results]');
    var projection = el.querySelector('[data-projection]');
    var comparison = el.querySelector('[data-compare]');
    var fields = Array.prototype.slice.call(form.elements).filter(function (field) {
      return field.name;
    });
    var options = { purchaseRates: config.purchaseRates, rates: config.rates, yieldEngine: yieldEngine, taxEngine: taxEngine };
    var current = null;
    var saved = null;
    var timer = null;

    var q = function (selector) {
      return el.querySelector(selector);
    };
    var text = function (key) {
      var template = q('template[data-text="' + key + '"]');
      return template ? template.content.textContent.trim() : '';
    };
    var fill = function (template, values) {
      return template.replace(/\{(\w+)\}/g, function (whole, key) {
        return values[key] !== undefined ? values[key] : whole;
      });
    };
    var put = function (key, value) {
      Array.prototype.forEach.call(el.querySelectorAll('[data-result="' + key + '"]'), function (node) {
        node.textContent = value;
      });
    };
    var setStatus = function (message) {
      q('[data-status]').textContent = message;
    };

    function money(pence) {
      return pence === null || pence === undefined ? text('notAvailable') : wholePounds.format(Math.round(pence / 100));
    }
    function exact(pence) {
      return pence === null || pence === undefined ? text('notAvailable') : poundsAndPence.format(pence / 100);
    }
    function percent(rate) {
      return rate === null || rate === undefined ? text('notAvailable') : (rate * 100).toFixed(2) + '%';
    }

    /* Reading the form */

    function fieldError(field) {
      return document.getElementById(field.id + '-error');
    }

    function clearErrors() {
      fields.forEach(function (field) {
        field.removeAttribute('aria-invalid');
        var message = fieldError(field);
        if (message) {
          message.textContent = '';
        }
      });
    }

    function readForm() {
      var input = {};
      var errors = [];
      fields.forEach(function (field) {
        if (field.tagName === 'SELECT') {
          input[field.name] = field.name === 'additional' ? field.value === 'yes' : field.value;
          return;
        }
        var value = field.value.trim();
        var isMoney = MONEY_FIELDS.indexOf(field.name) !== -1;
        var signed = SIGNED_FIELDS.indexOf(field.name) !== -1;
        var pattern = isMoney
          ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/
          : (signed ? /^-?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/);
        if (!pattern.test(value)) {
          errors.push({ field: field.name, code: isMoney ? 'money' : 'number' });
          return;
        }
        var number = Number(value.replace(/,/g, ''));
        input[field.name] = isMoney
          ? Math.round(number * 100)
          : PERCENT_FIELDS.indexOf(field.name) !== -1 ? number / 100 : number;
      });
      return { input: input, errors: errors };
    }

    function showErrors(errors) {
      var firstInvalid = null;
      errors.forEach(function (error) {
        var field = form.elements.namedItem(error.field);
        if (!field) {
          return;
        }
        field.setAttribute('aria-invalid', 'true');
        var message = fieldError(field);
        if (message) {
          message.textContent = text('error-' + error.field + '-' + error.code) || text('error-' + error.code) || text('error-check');
        }
        var disclosure = field.closest('details');
        if (disclosure) {
          disclosure.open = true;
        }
        if (!firstInvalid) {
          firstInvalid = field;
        }
      });
      current = null;
      results.hidden = true;
      projection.hidden = true;
      comparison.hidden = true;
      setStatus(text('statusInvalid'));
      return firstInvalid;
    }

    /* Rendering */

    function addRow(body, values, scope) {
      var row = document.createElement('tr');
      values.forEach(function (value, i) {
        var cell = document.createElement(i === 0 && scope !== false ? 'th' : 'td');
        cell.textContent = value;
        if (i === 0 && scope !== false) {
          cell.scope = 'row';
        }
        row.appendChild(cell);
      });
      body.appendChild(row);
    }

    function renderPurchaseTax(result) {
      var body = q('[data-tax-body]');
      body.replaceChildren();
      result.purchaseTax.rows.filter(function (row) {
        return row.portion > 0;
      }).forEach(function (row) {
        // A band starts a pound above the one below it, so the ranges read as they do on the rest of the site.
        var from = money(row.lower === 0 ? 0 : row.lower + 100);
        var band = row.upper === null
          ? fill(text('bandOpen'), { from: from })
          : fill(text('bandRange'), { from: from, to: money(row.upper) });
        addRow(body, [band, money(row.portion), percent(row.rate), money(row.tax)]);
      });
      if (result.purchaseTax.supplement > 0) {
        addRow(body, [result.purchaseTax.supplementName, money(result.input.price),
          percent(result.purchaseTax.supplementRate), money(result.purchaseTax.supplement)]);
      }
    }

    function renderProjection(result) {
      var body = q('[data-projection-body]');
      body.replaceChildren();
      result.projection.forEach(function (year) {
        addRow(body, [String(year.year), money(year.value), money(year.balance), money(year.cash), money(year.totalProfit)]);
      });

      // One bar per year, scaled to the largest positive equity. A year in negative equity shows no bar;
      // the table beside it carries the figure.
      var bars = q('[data-bars]');
      bars.replaceChildren();
      var tallest = Math.max.apply(null, result.projection.map(function (year) {
        return Math.max(0, year.equity);
      })) || 1;
      result.projection.forEach(function (year) {
        var bar = document.createElement('div');
        bar.className = 'appraisal__bar';
        bar.style.height = Math.max(1, (Math.max(0, year.equity) / tallest) * 100) + '%';
        bar.title = fill(text('barTitle'), { year: String(year.year), equity: money(year.equity) });
        bars.appendChild(bar);
      });
    }

    function renderPrintInputs() {
      var body = q('[data-print-inputs-body]');
      body.replaceChildren();
      fields.forEach(function (field) {
        var label = field.labels && field.labels[0] ? field.labels[0].querySelector('[data-label]') : null;
        var value = field.tagName === 'SELECT' ? field.selectedOptions[0].textContent : field.value;
        addRow(body, [label ? label.textContent : field.name, value]);
      });
    }

    function renderComparison() {
      comparison.hidden = !saved || !current;
      if (comparison.hidden) {
        return;
      }
      var body = q('[data-compare-body]');
      body.replaceChildren();
      var rows = [
        ['compareCash', saved.first.cashInvested, current.first.cashInvested, money],
        ['compareMonthly', saved.first.tax.monthlyCashFlowAfterTax, current.first.tax.monthlyCashFlowAfterTax, exact],
        ['comparePurchaseTax', saved.purchaseTax.total, current.purchaseTax.total, money]
      ];
      rows.forEach(function (row) {
        addRow(body, [text(row[0]), row[3](row[1]), row[3](row[2]), row[3](row[2] - row[1])]);
      });
      addRow(body, [text('compareReturn'), percent(saved.first.tax.cashOnCashAfterTax),
        percent(current.first.tax.cashOnCashAfterTax), text('notApplicable')]);
    }

    function render(result) {
      current = result;
      results.hidden = false;
      projection.hidden = false;
      var first = result.first;
      var tax = first.tax;

      put('monthly', exact(tax.monthlyCashFlowAfterTax));
      put('annualAfter', money(tax.cashFlowAfterTax));
      put('cashNeeded', money(first.cashInvested));
      put('coc', percent(tax.cashOnCashAfterTax));
      put('grossYield', percent(first.grossYield));
      put('netYield', percent(first.netYield));

      put('deposit', money(first.mortgage.deposit));
      put('loan', money(first.mortgage.loan));
      put('purchaseTax', money(result.purchaseTax.total));
      put('purchaseTaxName', result.purchaseTax.label);
      put('buyingFees', money(result.input.legalFees + result.input.mortgageFees));
      put('refurbishment', money(result.input.refurbishment));

      put('rent', money(first.annualRent));
      put('voidLoss', money(first.voidLoss));
      put('lettingFees', money(first.lettingFees));
      put('runningCosts', money(result.runningCosts));
      put('interest', money(first.mortgage.annualInterest));
      put('capital', money(first.mortgage.annualCapital));
      put('beforeTax', money(first.cashFlowBeforeTax));
      put('tax', money(tax.propertyTax));
      put('credit', money(tax.credit));
      put('breakEven', result.breakEvenRent === null
        ? text('noBreakEven')
        : fill(text('perMonth'), { amount: exact(result.breakEvenRent) }));

      put('stressCover', percent(result.stress.cover));
      put('stressRequired', exact(result.stress.requiredMonthlyRent));
      put('maxLoan', money(result.stress.maxLoan));
      put('minCash', money(result.stress.minimumCash));
      put('stressStatus', first.mortgage.loan === 0
        ? text('stressCash')
        : text(result.stress.passes ? 'stressPasses' : 'stressFails'));

      put('taxBasis', fill(text('taxBasis'), {
        year: tax.taxYear.label,
        region: tax.region.label,
        income: money(result.input.otherIncome)
      }));
      put('outlook', text(tax.cashFlowAfterTax < 0 ? 'outlookNegative' : 'outlookPositive'));
      put('horizon', fill(text('horizon'), { years: String(result.input.holdingYears) }));

      var last = result.projection[result.projection.length - 1];
      put('projectionProfit', money(last.totalProfit));
      put('projectionProceeds', money(last.proceeds));

      renderPurchaseTax(result);
      renderProjection(result);
      renderPrintInputs();
      renderComparison();
      setStatus(fill(text('statusUpdated'), { amount: exact(tax.monthlyCashFlowAfterTax) }));
    }

    function calculate() {
      timer = null;
      clearErrors();
      var parsed = readForm();
      if (parsed.errors.length) {
        showErrors(parsed.errors);
        return;
      }
      var result = engine.calculate(parsed.input, options);
      if (!result.ok) {
        showErrors(result.errors);
        return;
      }
      render(result);
    }

    function schedule() {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(calculate, DEBOUNCE_MS);
    }

    /* Shareable link */

    function shareUrl() {
      var url = new URL(window.location.href);
      url.search = '';
      url.hash = '';
      fields.forEach(function (field) {
        url.searchParams.set(field.name, field.value);
      });
      return url.href;
    }

    function applyQuery(search) {
      var params = new URLSearchParams(search);
      var used = false;
      fields.forEach(function (field) {
        if (!params.has(field.name)) {
          return;
        }
        var value = params.get(field.name);
        if (value.length > 40) {
          return;
        }
        if (field.tagName === 'SELECT' && !field.querySelector('option[value="' + CSS.escape(value) + '"]')) {
          return;
        }
        field.value = value;
        used = true;
      });
      return used;
    }

    /* Events */

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      calculate();
    });

    form.addEventListener('input', function () {
      setStatus('');
      schedule();
    });

    form.addEventListener('change', calculate);

    q('[data-save]').addEventListener('click', function () {
      calculate();
      if (!current) {
        return;
      }
      saved = current;
      renderComparison();
      setStatus(text('statusSaved'));
    });

    q('[data-clear-compare]').addEventListener('click', function () {
      saved = null;
      renderComparison();
      setStatus(text('statusCompareCleared'));
    });

    q('[data-reset]').addEventListener('click', function () {
      form.reset();
      saved = null;
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      calculate();
      setStatus(text('statusReset'));
    });

    q('[data-print]').addEventListener('click', function () {
      calculate();
      if (current) {
        window.print();
      }
    });

    q('[data-share]').addEventListener('click', function () {
      calculate();
      if (!current) {
        return;
      }
      var url = shareUrl();
      var fallback = function () {
        window.history.replaceState(null, '', url);
        setStatus(text('copyFailed'));
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(function () {
          setStatus(text('copied'));
        }, fallback);
      } else {
        fallback();
      }
    });

    /* Start */

    applyQuery(window.location.search);
    calculate();

    return { element: el, calculate: calculate };
  }

  function init(container) {
    if (!container || container.hasAttribute('data-investment-ready')) {
      return null;
    }
    if (!engine || !yieldEngine || !taxEngine) {
      return null;
    }
    var rates = readConfig('rates');
    var purchaseRates = readConfig('purchaseRates');
    if (!rates || !purchaseRates) {
      return null;
    }
    container.setAttribute('data-investment-ready', 'true');
    return build(container, { rates: rates, purchaseRates: purchaseRates });
  }

  root.CalculateMyTaxInvestmentCalculator = { init: init };

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-investment]'), function (container) {
      if (!container.hasAttribute('data-investment-manual')) {
        init(container);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
}(typeof window !== 'undefined' ? window : this));
