/*
 * CalculateMyTax stamp duty calculator interface.
 *
 * One portable unit: the Stamp duty calculator section markup, calculator.css and this file, loaded after
 * purchase-tax-engine.js. Call CalculateMyTaxStampDutyCalculator.init(container) for each calculator; sections
 * marked data-stamp-duty start on their own. Wording lives in the markup, including the <template data-text>
 * elements and the names of the nations in the menu; this file writes only calculated figures.
 */
(function (root) {
  'use strict';

  var engine = root.CalculateMyTaxPurchaseTaxEngine;
  var DEBOUNCE_MS = 200;
  var BASES = ['additional', 'standard', 'firstTimeBuyer'];
  var MAX_PENCE = 10000000000;

  var wholePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  var poundsAndPence = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function money(pence) {
    return pence % 100 === 0 ? wholePounds.format(pence / 100) : poundsAndPence.format(pence / 100);
  }

  function percent(rate) {
    return (Math.round(rate * 10000) / 100).toFixed(2) + '%';
  }

  function ratePercent(rate) {
    // Band rates are round numbers like 2% or 8.5%, so trailing zeros only add noise.
    return (Math.round(rate * 10000) / 100) + '%';
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

  function groupDigits(pence) {
    var pounds = String(Math.floor(pence / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var rest = pence % 100;
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
  function formatTyping(input) {
    var raw = input.value;
    var caret = input.selectionStart === null ? raw.length : input.selectionStart;
    var digitsBefore = raw.slice(0, caret).replace(/[^0-9.]/g, '').length;
    var clean = raw.replace(/[^0-9.]/g, '');
    var dot = clean.indexOf('.');
    if (dot !== -1) {
      clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    }
    var parts = clean.split('.');
    var whole = parts[0].slice(0, 10).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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

  function readConfig() {
    var node = document.getElementById('cmt-config-purchaseRates');
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
    var form = el.querySelector('[data-form]');
    var results = el.querySelector('[data-results]');
    var panel = el.querySelector('[data-panel]');
    var strip = el.querySelector('[data-strip]');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var timer = null;
    var edited = false;
    var ownsQuery = false;

    var q = function (selector) {
      return el.querySelector(selector);
    };
    var qa = function (selector) {
      return Array.prototype.slice.call(el.querySelectorAll(selector));
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
    var nationName = function () {
      return field('nation').selectedOptions[0].textContent;
    };

    function readForm() {
      return {
        nation: field('nation').value,
        basis: field('basis').value,
        price: parseMoney(field('price').value)
      };
    }

    function priceError(raw, price) {
      if (!/^[0-9,]*\.?[0-9]*$/.test(raw.trim()) || /,,/.test(raw)) {
        return 'notANumber';
      }
      if (price > MAX_PENCE) {
        return 'tooLarge';
      }
      return null;
    }

    function showError(code) {
      var line = q('[data-line="price"]');
      var message = line.querySelector('[data-error]');
      line.setAttribute('data-invalid', 'true');
      field('price').setAttribute('aria-invalid', 'true');
      message.textContent = text('error-' + code);
      message.hidden = false;
      results.setAttribute('data-stale', 'true');
      q('[data-invalid-note]').hidden = false;
    }

    function clearError() {
      var line = q('[data-line="price"]');
      line.removeAttribute('data-invalid');
      field('price').removeAttribute('aria-invalid');
      line.querySelector('[data-error]').hidden = true;
      results.removeAttribute('data-stale');
      q('[data-invalid-note]').hidden = true;
    }

    /* Rendering */

    function bandLabel(row) {
      var from = money(row.lower === 0 ? 0 : row.lower + 100);
      if (row.rate === 0) {
        return row.upper === null
          ? fill(text('bandNilOpen'), { from: from })
          : fill(text('bandNil'), { from: from, to: money(row.upper) });
      }
      return row.upper === null
        ? fill(text('bandOpen'), { from: from, rate: ratePercent(row.rate) })
        : fill(text('bandRange'), { from: from, to: money(row.upper), rate: ratePercent(row.rate) });
    }

    function row(host, name, value, total) {
      var line = document.createElement('div');
      line.className = total ? 'calc-sums__total' : 'calc-sums__row';
      var term = document.createElement('dt');
      term.className = 'calc-sums__name';
      term.textContent = name;
      var amount = document.createElement('dd');
      amount.className = 'calc-sums__value';
      amount.textContent = value;
      line.appendChild(term);
      line.appendChild(amount);
      host.appendChild(line);
    }

    function renderBands(result) {
      var host = q('[data-bands]');
      host.replaceChildren();
      result.rows.filter(function (band) {
        return band.portion > 0;
      }).forEach(function (band) {
        row(host, bandLabel(band), money(band.tax));
      });
      if (result.supplement > 0) {
        row(host, fill(text('supplementRow'), { name: result.supplementName, rate: ratePercent(result.supplementRate) }), money(result.supplement));
      }
      row(host, text('totalRow'), money(result.total), true);
    }

    function renderComparison(input, result) {
      var host = q('[data-compare]');
      host.replaceChildren();
      BASES.forEach(function (basis) {
        var other = engine.purchaseTax(input.price, input.nation, basis, config);
        var line = document.createElement('div');
        line.className = 'calc-routes__row';
        if (basis === input.basis) {
          line.setAttribute('data-recommended', 'true');
        }
        var name = document.createElement('p');
        name.className = 'calc-routes__name';
        name.textContent = text('basis-' + basis);
        var amount = document.createElement('p');
        amount.className = 'calc-routes__tax';
        amount.textContent = money(other.total);
        var status = document.createElement('p');
        status.className = 'calc-routes__status';
        if (basis === input.basis) {
          status.textContent = text('inUse');
        } else if (basis === 'firstTimeBuyer' && !other.firstTimeBuyer.offeredHere) {
          status.textContent = fill(text('notAvailableHere'), { nation: nationName() });
        } else if (basis === 'firstTimeBuyer' && other.firstTimeBuyer.lostOnPrice) {
          status.textContent = fill(text('reliefGoneHere'), { limit: money(other.firstTimeBuyer.lostAbove) });
        } else {
          var difference = other.total - result.total;
          status.textContent = difference === 0
            ? text('same')
            : fill(text(difference < 0 ? 'cheaper' : 'dearer'), { amount: money(Math.abs(difference)) });
        }
        line.appendChild(name);
        line.appendChild(amount);
        line.appendChild(status);
        host.appendChild(line);
      });
      setOut('compareNote', text('compareNote'));
    }

    function renderAlerts(input, result) {
      var relief = result.firstTimeBuyer;
      q('[data-alert="noReliefHere"]').hidden = !(relief.asked && !relief.offeredHere);
      var lost = q('[data-alert="reliefLost"]');
      lost.hidden = !relief.lostOnPrice;
      if (!lost.hidden) {
        lost.querySelector('[data-slot="limit"]').textContent = money(relief.lostAbove);
      }
      var below = q('[data-alert="belowMinimum"]');
      below.hidden = !(input.basis === 'additional' && input.price > 0 && input.price < config.additionalMinimum);
      if (!below.hidden) {
        below.querySelector('[data-slot="minimum"]').textContent = money(config.additionalMinimum);
      }
      q('[data-alert="noTax"]').hidden = !(input.price > 0 && result.total === 0);
    }

    function narrate(input, result) {
      var sentences = [];
      var values = {
        price: money(input.price),
        nation: nationName(),
        basis: text('summary-' + input.basis),
        name: result.label,
        total: money(result.total)
      };
      sentences.push(fill(text(result.total === 0 ? 'narrNil' : 'narrTotal'), values));
      if (result.total > 0) {
        sentences.push(fill(text('narrRate'), {
          rate: percent(result.effectiveRate),
          withTax: money(input.price + result.total)
        }));
        var parts = result.rows.filter(function (band) {
          return band.tax > 0;
        }).map(function (band) {
          return fill(text(band.upper === null ? 'narrPartOpen' : 'narrPart'), {
            amount: money(band.tax),
            from: money(band.lower === 0 ? 0 : band.lower + 100),
            to: money(band.upper)
          });
        });
        if (result.supplement > 0) {
          parts.push(fill(text('narrSupplement'), { amount: money(result.supplement), name: result.supplementName }));
        }
        if (parts.length > 1) {
          // The separator and the joining word are trimmed out of their templates, so the spaces go back here.
          var last = parts.pop();
          var list = parts.join(text('separator') + ' ') + ' ' + text('and') + ' ' + last;
          sentences.push(fill(text('narrBands'), { parts: list }));
        }
      }
      if (result.firstTimeBuyer.saving > 0) {
        sentences.push(fill(text('narrSaving'), { amount: money(result.firstTimeBuyer.saving) }));
      }
      if (input.basis === 'additional') {
        var asOnly = engine.purchaseTax(input.price, input.nation, 'standard', config);
        if (asOnly.total !== result.total) {
          sentences.push(fill(text('narrCompare'), { amount: money(asOnly.total) }));
        }
      }
      q('[data-narration]').textContent = sentences.join(' ');
    }

    function renderEmpty() {
      ['total', 'stripTotal'].forEach(function (name) {
        setOut(name, money(0));
      });
      setOut('summary', text('emptyPrompt'));
      setOut('effectiveRate', percent(0));
      q('[data-bands]').replaceChildren();
      q('[data-compare]').replaceChildren();
      q('[data-narration]').textContent = '';
      qa('[data-alert]').forEach(function (alert) {
        alert.hidden = true;
      });
    }

    function render(input, result) {
      setOut('taxLabel', fill(text('label-additional'), { name: result.label }));
      setOut('total', money(result.total));
      setOut('stripTotal', money(result.total));
      setOut('stripLabel', result.name);
      setOut('effectiveRate', percent(result.effectiveRate));
      setOut('price', money(input.price));
      setOut('withTax', money(input.price + result.total));
      setOut('summary', fill(text('summary'), {
        price: money(input.price),
        nation: nationName(),
        basis: text('summary-' + input.basis)
      }));

      renderBands(result);
      renderComparison(input, result);
      renderAlerts(input, result);
      narrate(input, result);

      setOut('printDate', longDate(isoToday()));
      setOut('printNation', nationName());
      setOut('printPrice', money(input.price));
      setOut('printBasis', text('basis-' + input.basis));
      setOut('printTaxName', result.label);
      setOut('printTotal', money(result.total));

      q('[data-live]').textContent = fill(text('liveSummary'), {
        name: result.label,
        total: money(result.total),
        rate: percent(result.effectiveRate)
      });
    }

    function calculate() {
      timer = null;
      var raw = field('price').value;
      var input = readForm();
      var code = priceError(raw, input.price);
      if (code) {
        showError(code);
        return;
      }
      clearError();
      if (raw.trim() === '') {
        renderEmpty();
        return;
      }
      render(input, engine.purchaseTax(input.price, input.nation, input.basis, config));
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
      params.set('n', field('nation').value);
      params.set('b', field('basis').value);
      params.set('p', String(parseMoney(field('price').value) / 100));
      return window.location.href.split('#')[0].split('?')[0] + '?' + params.toString();
    }

    function applyQuery(search) {
      var params = new URLSearchParams(search);
      if (!params.has('p')) {
        return false;
      }
      if (config.nations[params.get('n')]) {
        field('nation').value = params.get('n');
      }
      if (BASES.indexOf(params.get('b')) !== -1) {
        field('basis').value = params.get('b');
      }
      field('price').value = groupDigits(parseMoney(params.get('p')));
      return true;
    }

    /* Actions */

    function setStatus(message) {
      q('[data-action-status]').textContent = message;
    }

    function reset() {
      field('price').value = '';
      field('nation').selectedIndex = 0;
      field('basis').selectedIndex = 0;
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
      if (event.target.matches('input[inputmode="decimal"]')) {
        formatTyping(event.target);
      }
      if (!edited) {
        edited = true;
        q('[data-example-note]').hidden = true;
      }
      setStatus('');
      schedule();
    });

    form.addEventListener('change', calculate);

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

    // On paper the form is hidden, so anything folded away in the result is opened first and put back after.
    window.addEventListener('beforeprint', function () {
      calculate();
      qa('[data-results] details').forEach(function (section) {
        section.setAttribute('data-was-open', String(section.open));
        section.open = true;
      });
    });

    window.addEventListener('afterprint', function () {
      qa('[data-results] details').forEach(function (section) {
        section.open = section.getAttribute('data-was-open') === 'true';
        section.removeAttribute('data-was-open');
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

    ownsQuery = applyQuery(window.location.search);
    if (ownsQuery) {
      edited = true;
      q('[data-example-note]').hidden = true;
    }
    calculate();

    return { element: el, calculate: calculate, reset: reset };
  }

  function init(container) {
    if (!container || container.hasAttribute('data-stamp-duty-ready')) {
      return null;
    }
    var config = engine ? readConfig() : null;
    if (!config) {
      return null;
    }
    container.setAttribute('data-stamp-duty-ready', 'true');
    return build(container, config);
  }

  root.CalculateMyTaxStampDutyCalculator = { init: init };

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-stamp-duty]'), function (container) {
      if (!container.hasAttribute('data-stamp-duty-manual')) {
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
