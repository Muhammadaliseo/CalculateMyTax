/*
 * CalculateMyTax rental yield calculator interface.
 *
 * One portable unit: the Rental yield calculator section markup (src/partials/yield-calculator.html),
 * calculator.css and this file, loaded after yield-engine.js and tax-engine.js. Call
 * CalculateMyTaxYieldCalculator.init(container) for each calculator; sections marked data-yield-calculator start on
 * their own. Wording lives in the markup's <template data-text> elements; this file writes only calculated figures.
 */
(function (root) {
  'use strict';

  var engine = root.CalculateMyTaxYieldEngine;
  var taxEngine = root.CalculateMyTaxEngine;
  var DEBOUNCE_MS = 200;
  var queryClaimed = false;

  var FIELD_LINES = {
    price: 'price',
    monthlyRent: 'monthlyRent',
    runningCosts: 'runningCosts',
    buyingCosts: 'buyingCosts',
    lettingFeeRate: 'lettingFee',
    voidWeeks: 'voidWeeks',
    depositRate: 'deposit',
    interestRate: 'interestRate',
    termYears: 'termYears',
    otherIncome: 'otherIncome'
  };
  var COST_ITEMS = ['costRepairs', 'costInsurance', 'costService', 'costOther'];

  /* Formatting */

  var wholePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });

  function formatMoney(pence) {
    return wholePounds.format(Math.round(pence / 100) || 0);
  }

  function formatYield(rate) {
    return rate === null || rate === undefined ? '–' : (Math.round(rate * 10000) / 100).toFixed(2) + '%';
  }

  function formatCover(rate) {
    return rate === null || rate === undefined ? '–' : Math.round(rate * 100) + '%';
  }

  function formatRate(decimal) {
    return Math.round(decimal * 10000) / 100 + '%';
  }

  function parseMoney(text) {
    var clean = String(text || '').replace(/[^0-9.]/g, '');
    if (clean === '' || clean === '.') {
      return 0;
    }
    var parts = clean.split('.');
    var pounds = parts[0] ? parseInt(parts[0], 10) : 0;
    var pence = parts.length > 1 ? parseInt((parts[1] + '00').slice(0, 2), 10) : 0;
    return pounds * 100 + pence;
  }

  function parseDecimal(text) {
    var clean = String(text || '').replace(/[^0-9.]/g, '');
    if (clean === '' || clean === '.') {
      return 0;
    }
    var value = parseFloat(clean);
    return isFinite(value) ? value : 0;
  }

  function groupDigits(pence) {
    var pounds = String(Math.floor(Math.abs(pence) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var rest = Math.abs(pence) % 100;
    return rest ? pounds + '.' + (rest < 10 ? '0' : '') + rest : pounds;
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function longDate(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  // Keeps thousands separators while the user types and puts the caret back after the same digit.
  // Plain fields (percentages, weeks and years) keep up to three whole digits and no separators.
  function formatTyping(input, plain) {
    var raw = input.value;
    var caret = input.selectionStart === null ? raw.length : input.selectionStart;
    var digitsBefore = raw.slice(0, caret).replace(/[^0-9.]/g, '').length;
    var clean = raw.replace(/[^0-9.]/g, '');
    var dot = clean.indexOf('.');
    if (dot !== -1) {
      clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    }
    var parts = clean.split('.');
    var whole = parts[0].slice(0, plain ? 3 : 10);
    if (!plain) {
      whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    var next = parts.length > 1 ? whole + '.' + parts[1] : whole;
    if (next === raw) {
      return;
    }
    input.value = next;
    var position = 0;
    var seen = 0;
    while (position < next.length && seen < digitsBefore) {
      if (/[0-9.]/.test(next.charAt(position))) {
        seen += 1;
      }
      position += 1;
    }
    try {
      input.setSelectionRange(position, position);
    } catch (error) {
      // Some input types cannot report a selection; the value is still correct.
    }
  }

  /* Config */

  function loadRates(container) {
    var node = document.getElementById('cmt-config-rates');
    if (node) {
      try {
        return Promise.resolve(JSON.parse(node.textContent));
      } catch (error) {
        // Fall back to fetching the file.
      }
    }
    var base = container.getAttribute('data-config-base') || '';
    return fetch(base + 'data/rates.json').then(function (response) {
      if (!response.ok) {
        throw new Error('Could not load rates.json');
      }
      return response.json();
    });
  }

  /* One calculator */

  function build(el, rates) {
    var form = el.querySelector('[data-form]');
    var results = el.querySelector('[data-results]');
    var panel = el.querySelector('[data-panel]');
    var strip = el.querySelector('[data-strip]');
    var helper = el.querySelector('[data-cost-helper]');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var timer = null;
    var edited = false;
    var ownsQuery = false;

    var q = function (selector) {
      return el.querySelector(selector);
    };
    var qa = function (selector, scope) {
      return Array.prototype.slice.call((scope || el).querySelectorAll(selector));
    };
    var field = function (name) {
      return form.elements.namedItem(name);
    };
    var setOut = function (name, value) {
      qa('[data-out="' + name + '"]').forEach(function (node) {
        node.textContent = value;
      });
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
    var defaultYear = field('taxYear').value;

    function itemInputs() {
      return COST_ITEMS.map(field).concat([field('lettingFee')]);
    }

    function itemisedInUse() {
      return itemInputs().some(function (input) {
        return input.value.trim() !== '';
      });
    }

    function weeksText(weeks) {
      return fill(text(weeks === 1 ? 'weekOne' : 'weekMany'), { n: String(weeks) });
    }

    function readInput() {
      var itemised = itemisedInUse();
      var fixedCosts = itemised
        ? COST_ITEMS.reduce(function (sum, name) {
          return sum + parseMoney(field(name).value);
        }, 0)
        : parseMoney(field('runningCosts').value);
      return {
        price: parseMoney(field('price').value),
        monthlyRent: parseMoney(field('monthlyRent').value),
        runningCosts: fixedCosts,
        lettingFeeRate: itemised ? parseDecimal(field('lettingFee').value) / 100 : 0,
        voidWeeks: parseDecimal(field('voidWeeks').value),
        buyingCosts: parseMoney(field('buyingCosts').value),
        mortgage: field('hasMortgage').checked ? {
          depositRate: parseDecimal(field('deposit').value) / 100,
          interestRate: parseDecimal(field('interestRate').value) / 100,
          type: field('mortgageType').value,
          termYears: parseDecimal(field('termYears').value)
        } : null,
        tax: field('includeTax').checked ? {
          taxYear: field('taxYear').value,
          region: field('region').value,
          otherIncome: parseMoney(field('otherIncome').value)
        } : null
      };
    }

    function syncToggles() {
      var mortgage = field('hasMortgage').checked;
      qa('[data-mortgage-only]').forEach(function (node) {
        node.hidden = !mortgage;
      });
      qa('[data-repayment-only]').forEach(function (node) {
        node.hidden = !mortgage || field('mortgageType').value !== 'repayment';
      });
      var tax = field('includeTax').checked;
      qa('[data-tax-only]').forEach(function (node) {
        node.hidden = !tax;
      });
      var itemised = itemisedInUse();
      field('runningCosts').readOnly = itemised;
      q('[data-itemised-note]').hidden = !itemised;
      q('[data-cost-hint]').hidden = itemised;
    }

    function clearErrors() {
      qa('[data-line]').forEach(function (line) {
        line.removeAttribute('data-invalid');
        var message = line.querySelector('[data-error]');
        if (message) {
          message.hidden = true;
          message.textContent = '';
        }
        var input = line.querySelector('input');
        if (input) {
          input.removeAttribute('aria-invalid');
        }
      });
    }

    function showErrors(errors) {
      errors.forEach(function (error) {
        var name = FIELD_LINES[error.field];
        var line = name ? q('[data-line="' + name + '"]') : null;
        if (!line) {
          return;
        }
        line.setAttribute('data-invalid', 'true');
        var input = line.querySelector('input');
        if (input) {
          input.setAttribute('aria-invalid', 'true');
        }
        var message = line.querySelector('[data-error]');
        if (message) {
          message.textContent = text('error-' + error.field + '-' + error.code) || text('error-' + error.code);
          message.hidden = false;
        }
        if (line.closest('[data-cost-helper]')) {
          helper.open = true;
        }
      });
    }

    function setSum(name, pence, hideWhenZero) {
      setOut(name, formatMoney(pence));
      qa('[data-out="' + name + '"]').forEach(function (node) {
        var row = node.closest('.calc-sums__row');
        if (row) {
          row.setAttribute('data-empty', String(Boolean(hideWhenZero) && pence === 0));
        }
      });
    }

    function renderBar(r) {
      var bar = q('[data-bar]');
      var key = q('[data-bar-key]');
      var finalFlow = r.tax ? r.tax.cashFlowAfterTax : r.cashFlowBeforeTax;
      var parts = [
        ['void', r.voidLoss],
        ['costs', r.runningTotal],
        ['interest', r.mortgage ? r.mortgage.annualInterest : 0],
        ['capital', r.mortgage ? r.mortgage.annualCapital : 0],
        ['tax', r.tax ? Math.max(0, r.tax.propertyTax) : 0],
        ['left', Math.max(0, finalFlow)]
      ].filter(function (part) {
        return part[1] > 0;
      });
      var total = parts.reduce(function (sum, part) {
        return sum + part[1];
      }, 0);
      bar.textContent = '';
      key.textContent = '';
      var labels = [];
      parts.forEach(function (part) {
        var segment = document.createElement('span');
        segment.className = 'calc-bar__segment';
        segment.setAttribute('data-kind', part[0]);
        segment.style.width = (total ? (part[1] / total) * 100 : 0) + '%';
        bar.appendChild(segment);
        labels.push(fill(text('key-' + part[0]), { amount: formatMoney(part[1]) }));
      });
      if (finalFlow < 0) {
        labels.push(fill(text('key-short'), { amount: formatMoney(-finalFlow) }));
      }
      labels.forEach(function (label, i) {
        var item = document.createElement('li');
        item.className = 'calc-bar-key__item';
        var swatch = document.createElement('span');
        swatch.className = 'calc-bar-key__swatch';
        swatch.setAttribute('aria-hidden', 'true');
        swatch.setAttribute('data-kind', parts[i] ? parts[i][0] : 'short');
        item.appendChild(swatch);
        item.appendChild(document.createTextNode(label));
        key.appendChild(item);
      });
      // The separator is trimmed out of its template, so the space after the comma goes back here.
      bar.setAttribute('aria-label', fill(text('barLabel'), { rent: formatMoney(r.annualRent), parts: labels.join(text('separator') + ' ') }));
    }

    function renderEmpty() {
      ['netYield', 'grossYield', 'stripYield', 'returnValue', 'interestCover'].forEach(function (name) {
        setOut(name, '–');
      });
      setOut('cashSentence', text('emptyPrompt'));
      qa('[data-alert]').forEach(function (alert) {
        alert.hidden = true;
      });
      q('[data-bar]').textContent = '';
      q('[data-bar-key]').textContent = '';
      q('[data-narration]').textContent = '';
      results.removeAttribute('data-stale');
    }

    function render(r) {
      var tax = r.tax;
      var monthly = tax ? tax.monthlyCashFlowAfterTax : r.monthlyCashFlowBeforeTax;
      var finalFlow = tax ? tax.cashFlowAfterTax : r.cashFlowBeforeTax;
      results.removeAttribute('data-stale');
      q('[data-invalid-note]').hidden = true;

      setOut('netYield', formatYield(r.netYield));
      setOut('grossYield', formatYield(r.grossYield));
      setOut('stripYield', formatYield(r.netYield));
      var what = text('what-' + (tax ? 'tax' : 'notax') + '-' + (r.mortgage ? 'mortgage' : 'nomortgage'));
      setOut('cashSentence', fill(text(monthly < 0 ? 'cashNegative' : 'cashPositive'), { amount: formatMoney(Math.abs(monthly)), what: what }));
      setOut('returnLabel', text(tax ? 'returnAfterTax' : 'returnBeforeTax'));
      setOut('returnValue', formatYield(tax ? tax.cashOnCashAfterTax : r.cashOnCash));
      q('[data-cover]').hidden = !(r.mortgage && r.mortgage.interestCover !== null);
      setOut('interestCover', formatCover(r.mortgage ? r.mortgage.interestCover : null));

      q('[data-alert="negative"]').hidden = !(finalFlow < 0);
      q('[data-alert="noCover"]').hidden = !(r.mortgage && r.mortgage.interestCover !== null && r.mortgage.interestCover < 1);
      var forecast = q('[data-alert="forecast"]');
      forecast.hidden = !(tax && tax.taxYear.isForecast);
      if (!forecast.hidden) {
        forecast.querySelector('[data-slot="year"]').textContent = tax.taxYear.label;
        forecast.querySelector('[data-slot="note"]').textContent = tax.taxYear.forecastNote || '';
      }

      renderBar(r);
      setSum('sumAnnualRent', r.annualRent);
      setSum('sumVoid', r.voidLoss, true);
      setSum('sumCosts', r.runningTotal);
      setSum('sumNet', r.netIncome);
      setSum('sumInterest', r.mortgage ? r.mortgage.annualInterest : 0, true);
      setSum('sumCapital', r.mortgage ? r.mortgage.annualCapital : 0, true);
      setSum('sumCashBefore', r.cashFlowBeforeTax);
      setSum('sumTax', tax ? tax.propertyTax : 0);
      setSum('sumCashFinal', finalFlow);
      setOut('costTotal', formatMoney(r.runningTotal));

      setOut('figGross', formatYield(r.grossYield));
      setOut('figNet', formatYield(r.netYield));
      setOut('figCashInvested', formatMoney(r.cashInvested));
      setOut('figReturnBefore', formatYield(r.cashOnCash));
      setOut('figReturnAfter', formatYield(tax ? tax.cashOnCashAfterTax : null));
      setOut('figLoan', formatMoney(r.mortgage ? r.mortgage.loan : 0));
      setOut('figPayment', formatMoney(r.mortgage ? r.mortgage.monthlyPayment : 0));
      setOut('figCover', formatCover(r.mortgage ? r.mortgage.interestCover : null));

      if (tax) {
        setOut('taxAmount', formatMoney(tax.propertyTax));
        setOut('taxCredit', formatMoney(tax.credit));
        setOut('taxRoute', text('route-' + tax.route));
        setOut('taxBand', tax.marginalBandName ? tax.marginalBandName + ', ' + formatRate(tax.marginalRate) : text('withinAllowance'));
        var link = q('[data-tax-link]');
        var params = new URLSearchParams();
        params.set('y', tax.taxYear.key);
        params.set('r', tax.region.key);
        params.set('oi', String(tax.otherIncome / 100));
        params.set('rent', String(r.rentCollected / 100));
        params.set('exp', String(r.runningTotal / 100));
        if (r.mortgage && r.mortgage.annualInterest > 0) {
          params.set('int', String(r.mortgage.annualInterest / 100));
        }
        link.setAttribute('href', link.getAttribute('href').split('?')[0] + '?' + params.toString());
      }

      var sentences = [fill(text('narrGross'), { price: formatMoney(r.price), rent: formatMoney(r.monthlyRent), annual: formatMoney(r.annualRent), gross: formatYield(r.grossYield) })];
      // Shortfalls are described in words, so the summary never reads "-£834".
      var short = function (pence) {
        return pence < 0 ? 'Short' : '';
      };
      sentences.push(fill(text((r.voidWeeks > 0 ? 'narrNet' : 'narrNetNoVoids') + short(r.netIncome)), { weeks: weeksText(r.voidWeeks), costs: formatMoney(r.runningTotal), net: formatMoney(Math.abs(r.netIncome)), netYield: formatYield(r.netYield) }));
      if (r.mortgage) {
        sentences.push(fill(text((r.mortgage.annualCapital > 0 ? 'narrRepayment' : 'narrInterestOnly') + short(r.cashFlowBeforeTax)), { payments: formatMoney(r.mortgage.annualPayments), interest: formatMoney(r.mortgage.annualInterest), capital: formatMoney(r.mortgage.annualCapital), flow: formatMoney(Math.abs(r.cashFlowBeforeTax)) }));
      } else {
        sentences.push(text('narrNoMortgage'));
      }
      if (tax) {
        sentences.push(fill(text('narrTax' + short(tax.cashFlowAfterTax)), { tax: formatMoney(tax.propertyTax), flow: formatMoney(Math.abs(tax.cashFlowAfterTax)), monthly: formatMoney(Math.abs(tax.monthlyCashFlowAfterTax)) }));
      }
      var cashReturn = tax ? tax.cashOnCashAfterTax : r.cashOnCash;
      if (cashReturn !== null) {
        sentences.push(fill(text(cashReturn < 0 ? 'narrReturnLoss' : 'narrReturn'), { rate: formatYield(Math.abs(cashReturn)), cash: formatMoney(r.cashInvested) }));
      }
      if (tax) {
        sentences.push(fill(text('narrBasis'), { year: tax.taxYear.label, region: tax.region.label }));
      }
      q('[data-narration]').textContent = sentences.join(' ');

      setOut('printDate', longDate(isoToday()));
      setOut('printProperty', fill(text('printProperty'), { price: formatMoney(r.price), rent: formatMoney(r.monthlyRent) }));
      setOut('printCosts', fill(text('printCosts'), { costs: formatMoney(r.runningTotal), weeks: weeksText(r.voidWeeks) }));
      setOut('printMortgage', r.mortgage
        ? fill(text(r.mortgage.type === 'repayment' ? 'printMortgageRep' : 'printMortgageIO'), { deposit: formatRate(r.mortgage.depositRate), rate: formatRate(r.mortgage.interestRate), term: String(r.mortgage.termYears) })
        : text('printNoMortgage'));
      setOut('printBuying', formatMoney(r.buyingCosts));
      setOut('printTax', tax ? fill(text('printTax'), { year: tax.taxYear.label, region: tax.region.label, income: formatMoney(tax.otherIncome) }) : text('printNoTax'));

      q('[data-live]').textContent = fill(text('liveSummary'), { net: formatYield(r.netYield), gross: formatYield(r.grossYield), monthly: formatMoney(monthly) });
    }

    function calculate() {
      timer = null;
      syncToggles();
      clearErrors();
      if (field('price').value.trim() === '' && field('monthlyRent').value.trim() === '') {
        renderEmpty();
        return;
      }
      var result = engine.calculate(readInput(), { taxEngine: taxEngine, rates: rates });
      if (!result.ok) {
        showErrors(result.errors);
        results.setAttribute('data-stale', 'true');
        q('[data-invalid-note]').hidden = false;
        return;
      }
      if (itemisedInUse()) {
        field('runningCosts').value = groupDigits(result.runningTotal);
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
      var params = new URLSearchParams();
      var put = function (key, name) {
        var value = field(name).value.trim().replace(/,/g, '');
        if (value !== '') {
          params.set(key, value);
        }
      };
      put('p', 'price');
      put('rent', 'monthlyRent');
      put('void', 'voidWeeks');
      if (itemisedInUse()) {
        put('fee', 'lettingFee');
        put('rep', 'costRepairs');
        put('ins', 'costInsurance');
        put('svc', 'costService');
        put('oth', 'costOther');
      } else {
        put('cost', 'runningCosts');
      }
      put('buy', 'buyingCosts');
      if (field('hasMortgage').checked) {
        params.set('mort', '1');
        put('dep', 'deposit');
        put('rate', 'interestRate');
        params.set('type', field('mortgageType').value === 'repayment' ? 'rep' : 'io');
        if (field('mortgageType').value === 'repayment') {
          put('term', 'termYears');
        }
      }
      if (field('includeTax').checked) {
        params.set('tax', '1');
        params.set('y', field('taxYear').value);
        params.set('r', field('region').value);
        put('oi', 'otherIncome');
      }
      return window.location.href.split('#')[0].split('?')[0] + '?' + params.toString();
    }

    function applyQuery(search) {
      var params = new URLSearchParams(search);
      if (!params.has('p') && !params.has('rent')) {
        return false;
      }
      var setMoney = function (name, key) {
        field(name).value = params.has(key) ? groupDigits(parseMoney(params.get(key))) : '';
      };
      var setPlain = function (name, key, fallback) {
        field(name).value = params.has(key) ? String(parseDecimal(params.get(key))) : fallback;
      };
      setMoney('price', 'p');
      setMoney('monthlyRent', 'rent');
      setPlain('voidWeeks', 'void', '');
      setMoney('runningCosts', 'cost');
      setPlain('lettingFee', 'fee', '');
      setMoney('costRepairs', 'rep');
      setMoney('costInsurance', 'ins');
      setMoney('costService', 'svc');
      setMoney('costOther', 'oth');
      ['rep', 'ins', 'svc', 'oth'].forEach(function (key) {
        if (!params.has(key)) {
          field(COST_ITEMS[['rep', 'ins', 'svc', 'oth'].indexOf(key)]).value = '';
        }
      });
      if (itemisedInUse()) {
        helper.open = true;
      }
      setMoney('buyingCosts', 'buy');
      if (params.has('buy')) {
        q('.calc-advanced').open = true;
      }
      field('hasMortgage').checked = params.get('mort') === '1';
      setPlain('deposit', 'dep', '25');
      setPlain('interestRate', 'rate', '5');
      field('mortgageType').value = params.get('type') === 'rep' ? 'repayment' : 'interestOnly';
      setPlain('termYears', 'term', '25');
      field('includeTax').checked = params.get('tax') === '1';
      if (rates[params.get('y')]) {
        field('taxYear').value = params.get('y');
      }
      if (params.get('r') && field('region').querySelector('option[value="' + params.get('r') + '"]')) {
        field('region').value = params.get('r');
      }
      setMoney('otherIncome', 'oi');
      return true;
    }

    /* Actions */

    function setStatus(message) {
      q('[data-action-status]').textContent = message;
    }

    function reset() {
      qa('input[type="text"]', form).forEach(function (input) {
        input.value = '';
        input.readOnly = false;
      });
      field('hasMortgage').checked = false;
      field('includeTax').checked = false;
      field('mortgageType').value = 'interestOnly';
      field('termYears').value = '25';
      field('taxYear').value = defaultYear;
      field('region').selectedIndex = 0;
      helper.open = false;
      q('[data-example-note]').hidden = true;
      edited = true;
      if (ownsQuery && window.location.search) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      calculate();
      setStatus(text('resetDone'));
      field('price').focus();
    }

    /* Events */

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      calculate();
    });

    form.addEventListener('input', function (event) {
      var target = event.target;
      if (target.matches('input[inputmode="decimal"]')) {
        formatTyping(target, target.hasAttribute('data-plain'));
      }
      if (!edited) {
        edited = true;
        q('[data-example-note]').hidden = true;
      }
      setStatus('');
      schedule();
    });

    form.addEventListener('change', function () {
      syncToggles();
      schedule();
    });

    q('[data-clear-items]').addEventListener('click', function () {
      itemInputs().forEach(function (input) {
        input.value = '';
      });
      field('runningCosts').readOnly = false;
      schedule();
    });

    q('[data-action="copy"]').addEventListener('click', function () {
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

    q('[data-action="print"]').addEventListener('click', function () {
      window.print();
    });

    q('[data-action="reset"]').addEventListener('click', reset);

    window.addEventListener('beforeprint', function () {
      calculate();
      qa('details', results).forEach(function (details) {
        details.setAttribute('data-was-open', String(details.open));
        details.open = true;
      });
    });

    window.addEventListener('afterprint', function () {
      qa('details', results).forEach(function (details) {
        details.open = details.getAttribute('data-was-open') === 'true';
        details.removeAttribute('data-was-open');
      });
    });

    if (strip && 'IntersectionObserver' in window) {
      var mobile = window.matchMedia('(max-width: 47.99em)');
      var formInView = false;
      var panelInView = true;
      var syncStrip = function () {
        strip.hidden = !(mobile.matches && formInView && !panelInView);
      };
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.target === form) {
            formInView = entry.isIntersecting;
          } else {
            panelInView = entry.isIntersecting;
          }
        });
        syncStrip();
      });
      observer.observe(form);
      observer.observe(panel);
      q('[data-show-results]').addEventListener('click', function () {
        panel.setAttribute('tabindex', '-1');
        panel.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        panel.focus({ preventScroll: true });
      });
    }

    /* Start */

    if (!queryClaimed) {
      ownsQuery = applyQuery(window.location.search);
      queryClaimed = ownsQuery;
    }
    if (ownsQuery) {
      edited = true;
      q('[data-example-note]').hidden = true;
    }
    syncToggles();
    calculate();

    return { element: el, calculate: calculate, reset: reset };
  }

  function init(container) {
    if (!container || container.hasAttribute('data-yield-ready')) {
      return Promise.resolve(null);
    }
    if (!engine) {
      return Promise.reject(new Error('Load yield-engine.js before yield-calculator.js'));
    }
    container.setAttribute('data-yield-ready', 'loading');
    return loadRates(container).then(function (rates) {
      container.setAttribute('data-yield-ready', 'true');
      return build(container, rates);
    });
  }

  root.CalculateMyTaxYieldCalculator = { init: init };

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-yield-calculator]'), function (container) {
      if (!container.hasAttribute('data-yield-calculator-manual')) {
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
