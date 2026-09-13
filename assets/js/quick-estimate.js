/*
 * CalculateMyTax quick estimate: the short rental tax form in the home page hero.
 *
 * CalculateMyTaxQuickEstimate.init(form) wires one form; forms marked data-quick-estimate start on their own.
 * It reads the rates from the inline <script type="application/json" id="cmt-config-rates"> block, works out the
 * tax with the same engine as the full calculator and writes only calculated figures. Wording lives in the markup.
 * Submitting opens the full calculator with the same figures, because the field names match its shareable link,
 * so the form still works without JavaScript.
 */
(function (root) {
  'use strict';

  var engine = root.CalculateMyTaxEngine;
  var DEBOUNCE_MS = 150;
  var MONEY_FIELDS = ['oi', 'rent', 'exp', 'int'];

  function readRates() {
    var node = document.getElementById('cmt-config-rates');
    if (!node) {
      return null;
    }
    try {
      return JSON.parse(node.textContent);
    } catch (error) {
      return null;
    }
  }

  // Pounds as typed, with or without a pound sign and separators, into whole pence. Null means not an amount.
  function toPence(text) {
    var clean = String(text || '').replace(/[£,\s]/g, '');
    if (clean === '') {
      return 0;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
      return null;
    }
    var parts = clean.split('.');
    return parseInt(parts[0], 10) * 100 + (parts[1] ? parseInt((parts[1] + '0').slice(0, 2), 10) : 0);
  }

  function group(pence) {
    var pounds = String(Math.floor(Math.abs(pence) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var rest = Math.abs(pence) % 100;
    return pounds + (rest ? '.' + (rest < 10 ? '0' : '') + rest : '');
  }

  function money(pence) {
    return (pence < 0 ? '-£' : '£') + group(pence);
  }

  function monthly(pence) {
    return '£' + (Math.round(pence / 12) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function percent(rate) {
    return Math.round(rate * 1000) / 10 + '%';
  }

  function init(form) {
    if (!engine || !form || form.getAttribute('data-quick-ready') === 'true') {
      return;
    }
    var rates = readRates();
    if (!rates) {
      return;
    }
    form.setAttribute('data-quick-ready', 'true');

    var timer = null;
    var out = function (name) {
      return form.querySelector('[data-quick="' + name + '"]');
    };
    var field = function (name) {
      return form.elements.namedItem(name);
    };
    var status = out('status');

    function readAmounts() {
      var amounts = {};
      var firstInvalid = null;
      MONEY_FIELDS.forEach(function (name) {
        var input = field(name);
        var pence = toPence(input.value);
        input.setAttribute('aria-invalid', pence === null ? 'true' : 'false');
        if (pence === null && !firstInvalid) {
          firstInvalid = input;
        }
        amounts[name] = pence;
      });
      amounts.firstInvalid = firstInvalid;
      return amounts;
    }

    function clear(message) {
      ['tax', 'keep', 'month', 'rate'].forEach(function (name) {
        out(name).textContent = out(name).getAttribute('data-empty');
      });
      out('bar').value = 0;
      status.textContent = message;
    }

    function calculate() {
      var amounts = readAmounts();
      if (amounts.firstInvalid) {
        clear(status.getAttribute('data-invalid'));
        return;
      }
      var result = engine.calculate({
        taxYear: field('y').value,
        region: field('r').value,
        otherIncome: amounts.oi,
        properties: [{ rent: amounts.rent, expenses: amounts.exp, financeCosts: amounts.int }],
        partner: null,
        reliefMode: 'auto',
        lossesBroughtForward: 0,
        financeCostsBroughtForward: 0
      }, rates);
      if (!result.ok) {
        clear(status.getAttribute('data-invalid'));
        return;
      }
      var r = result.owner.result;
      out('tax').textContent = money(r.propertyTax);
      out('keep').textContent = money(r.netRentalIncome);
      out('month').textContent = monthly(r.propertyTax);
      out('rate').textContent = percent(r.effectiveRate);
      out('bar').value = Math.min(100, Math.round(r.effectiveRate * 1000) / 10);
      status.textContent = status.getAttribute('data-template')
        .replace('{tax}', money(r.propertyTax))
        .replace('{keep}', money(r.netRentalIncome));
    }

    form.addEventListener('input', function () {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(calculate, DEBOUNCE_MS);
    });

    MONEY_FIELDS.forEach(function (name) {
      field(name).addEventListener('blur', function (event) {
        var pence = toPence(event.target.value);
        if (pence !== null && event.target.value !== '') {
          event.target.value = group(pence);
        }
      });
    });

    form.addEventListener('submit', function (event) {
      var amounts = readAmounts();
      if (amounts.firstInvalid) {
        event.preventDefault();
        clear(status.getAttribute('data-invalid'));
        amounts.firstInvalid.focus();
      }
    });

    calculate();
    // The first result matches what the page already shows, so it is not announced.
    status.textContent = '';
  }

  root.CalculateMyTaxQuickEstimate = { init: init };

  Array.prototype.forEach.call(document.querySelectorAll('[data-quick-estimate]'), init);
}(typeof window !== 'undefined' ? window : this));
