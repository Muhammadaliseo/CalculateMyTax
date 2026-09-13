/*
 * CalculateMyTax rental income tax calculator interface.
 *
 * One portable unit: the Calculator section markup, calculator.css and this file. Call
 * CalculateMyTaxCalculator.init(container) for each calculator on a page. Every lookup stays inside its own
 * container, so two calculators can share a page. Wording lives in the markup, including the
 * <template data-text> elements; this file writes only calculated figures, the expense rows built from
 * data/expenses.json, and the tax year and region options built from data/rates.json.
 */
(function (root) {
  'use strict';

  var engine = root.CalculateMyTaxEngine;
  var DEBOUNCE_MS = 200;
  var MAX_EXTRA_PROPERTIES = 19;
  var instances = 0;
  var queryClaimed = false;

  /* Formatting */

  var wholePounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  var poundsAndPence = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function formatMoney(pence, showPence) {
    if (showPence) {
      return poundsAndPence.format(pence / 100);
    }
    return wholePounds.format(Math.round(pence / 100) || 0);
  }

  function formatPercent(rate) {
    return (Math.round(rate * 1000) / 10) + '%';
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

  function queryPounds(pence) {
    return String(pence / 100);
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  function longDate(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  // Keeps thousands separators while the user types and puts the caret back after the same digit.
  function formatTyping(input, isPercent) {
    var raw = input.value;
    var caret = input.selectionStart === null ? raw.length : input.selectionStart;
    var digitsBefore = raw.slice(0, caret).replace(/[^0-9.]/g, '').length;
    var clean = raw.replace(/[^0-9.]/g, '');
    var dot = clean.indexOf('.');
    if (dot !== -1) {
      clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, '').slice(0, 2);
    }
    var parts = clean.split('.');
    var whole = parts[0].slice(0, isPercent ? 3 : 10);
    if (!isPercent) {
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

  function readInline(name) {
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

  function loadConfig(container) {
    var base = container.getAttribute('data-config-base') || '';
    return Promise.all(['rates', 'expenses', 'mtd'].map(function (name) {
      var inline = readInline(name);
      if (inline) {
        return inline;
      }
      return fetch(base + 'data/' + name + '.json').then(function (response) {
        if (!response.ok) {
          throw new Error('Could not load ' + name + '.json');
        }
        return response.json();
      });
    })).then(function (list) {
      return { rates: list[0], expenses: list[1], mtd: list[2] };
    });
  }

  /* One calculator */

  function build(el, config) {
    instances += 1;
    var uid = 'cmt-calc-' + instances;
    var rates = config.rates;
    var form = el.querySelector('[data-form]');
    var results = el.querySelector('[data-results]');
    var panel = el.querySelector('[data-panel]');
    var strip = el.querySelector('[data-strip]');
    var propertiesHost = el.querySelector('[data-properties]');
    var rowsHost = el.querySelector('[data-expense-rows]');
    var financeLine = el.querySelector('[data-line="financeCosts"]');
    var revealFinance = el.querySelector('[data-reveal-finance]');
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var timer = null;
    var frame = null;
    var shownTax = null;
    var lastAnnounced = '';
    var edited = false;
    var ownsQuery = false;
    var describedCount = 0;

    function q(selector) {
      return el.querySelector(selector);
    }

    function qa(selector, scope) {
      return Array.prototype.slice.call((scope || el).querySelectorAll(selector));
    }

    function field(name) {
      return form.querySelector('[name="' + name + '"]');
    }

    function text(key, values) {
      var template = q('template[data-text="' + key + '"]');
      var content = template ? template.content.textContent : '';
      return content.replace(/\{(\w+)\}/g, function (match, name) {
        return values && values[name] !== undefined ? values[name] : match;
      });
    }

    function setOut(name, value) {
      qa('[data-out="' + name + '"]').forEach(function (node) {
        node.textContent = value;
      });
    }

    function joinList(items) {
      if (items.length < 2) {
        return items.join('');
      }
      return items.slice(0, -1).join(text('separator')) + text('and') + items[items.length - 1];
    }

    function routeName(route) {
      return text('route-' + route);
    }

    function yearLabel(key) {
      return rates[key] ? rates[key].label : key.replace('-', '/');
    }

    // Links hints and error messages to their inputs. Ids are made per instance so two calculators never clash.
    function describe(scope) {
      qa('.calc-line, .calc-item', scope).forEach(function (line) {
        var input = line.querySelector('input');
        if (!input) {
          return;
        }
        var ids = [];
        qa('[data-hint], [data-error]', line).forEach(function (node) {
          if (!node.id) {
            describedCount += 1;
            node.id = uid + '-note-' + describedCount;
          }
          ids.push(node.id);
        });
        if (ids.length) {
          input.setAttribute('aria-describedby', ids.join(' '));
        }
      });
    }

    function fillOptions(select, options, selected) {
      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
      options.forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.value;
        node.textContent = option.label;
        node.selected = option.value === selected;
        select.appendChild(node);
      });
    }

    /* Settings from config */

    var yearKeys = engine.listTaxYears(rates);
    var defaultYear = engine.currentTaxYear(rates, isoToday()) || yearKeys[yearKeys.length - 1];
    var regionKeys = Object.keys(rates[defaultYear].regions);
    fillOptions(field('taxYear'), yearKeys.map(function (key) {
      return { value: key, label: rates[key].label + (rates[key].isForecast ? text('futureYear') : '') };
    }), defaultYear);
    fillOptions(field('region'), regionKeys.map(function (key) {
      return { value: key, label: rates[defaultYear].regions[key].label };
    }), regionKeys[0]);

    /* Expense helper rows from config */

    var expenseTemplate = q('template[data-expense-template]');
    config.expenses.categories.forEach(function (category) {
      var row = expenseTemplate.content.firstElementChild.cloneNode(true);
      row.querySelector('[data-expense-name]').textContent = category.label;
      row.querySelector('[data-expense-tip]').textContent = category.tooltip;
      row.querySelector('[data-expense]').setAttribute('data-expense', category.id);
      rowsHost.appendChild(row);
    });

    function itemInputs() {
      return qa('[data-expense]', rowsHost);
    }

    function itemisedTotal() {
      return itemInputs().reduce(function (total, input) {
        return total + parseMoney(input.value);
      }, 0);
    }

    function itemisedInUse() {
      return itemInputs().some(function (input) {
        return parseMoney(input.value) > 0;
      });
    }

    function syncItemised() {
      var inUse = itemisedInUse();
      var total = itemisedTotal();
      var expenses = field('expenses');
      setOut('expenseTotal', formatMoney(total, total % 100 !== 0));
      expenses.readOnly = inUse;
      q('[data-itemised-note]').hidden = !inUse;
      if (inUse) {
        expenses.value = groupDigits(total);
      }
    }

    /* Show and hide */

    function setFinanceVisible(visible) {
      financeLine.hidden = !visible;
      revealFinance.hidden = visible;
    }

    function syncToggles() {
      var joint = field('joint').checked;
      qa('[data-joint-only]').forEach(function (node) {
        node.hidden = !joint;
      });
      q('[data-shared-only]').hidden = !field('roomInOwnHome').checked;
    }

    /* Other properties */

    var propertyTemplate = q('template[data-property-template]');

    function propertyRows() {
      return qa('[data-property]', propertiesHost);
    }

    function numberProperties() {
      propertyRows().forEach(function (row, index) {
        row.querySelector('[data-property-number]').textContent = String(index + 2);
      });
      q('[data-add-property]').hidden = propertyRows().length >= MAX_EXTRA_PROPERTIES;
    }

    function addProperty(values) {
      var row = propertyTemplate.content.firstElementChild.cloneNode(true);
      if (values) {
        ['rent', 'expenses', 'financeCosts'].forEach(function (key) {
          row.querySelector('[data-property-field="' + key + '"]').value = values[key] ? groupDigits(values[key]) : '';
        });
      }
      propertiesHost.appendChild(row);
      describe(row);
      numberProperties();
      return row;
    }

    /* Reading the form */

    function readInput() {
      var properties = [{
        rent: parseMoney(field('rent').value),
        expenses: itemisedInUse() ? itemisedTotal() : parseMoney(field('expenses').value),
        financeCosts: financeLine.hidden ? 0 : parseMoney(field('financeCosts').value)
      }];
      propertyRows().forEach(function (row) {
        properties.push({
          rent: parseMoney(row.querySelector('[data-property-field="rent"]').value),
          expenses: parseMoney(row.querySelector('[data-property-field="expenses"]').value),
          financeCosts: parseMoney(row.querySelector('[data-property-field="financeCosts"]').value)
        });
      });
      var joint = field('joint').checked;
      var shareText = field('ownerShare').value.replace(/[^0-9.]/g, '');
      return {
        taxYear: field('taxYear').value,
        region: field('region').value,
        otherIncome: parseMoney(field('otherIncome').value),
        properties: properties,
        ownerShare: joint ? (shareText === '' ? NaN : parseFloat(shareText)) : 100,
        partner: joint ? { otherIncome: parseMoney(field('partnerOtherIncome').value) } : null,
        lettingType: field('roomInOwnHome').checked ? 'roomInOwnHome' : 'standard',
        rentARoomShared: field('rentARoomShared').checked,
        reliefMode: field('reliefMode').value,
        lossesBroughtForward: parseMoney(field('lossesBroughtForward').value),
        financeCostsBroughtForward: parseMoney(field('financeCostsBroughtForward').value)
      };
    }

    /* Validation messages */

    function lineFor(path) {
      var named = {
        otherIncome: 'otherIncome',
        ownerShare: 'ownerShare',
        'partner.otherIncome': 'partnerOtherIncome',
        lossesBroughtForward: 'lossesBroughtForward',
        financeCostsBroughtForward: 'financeCostsBroughtForward'
      };
      if (named[path]) {
        return q('[data-line="' + named[path] + '"]');
      }
      var match = /^properties\.(\d+)\.(\w+)$/.exec(path);
      if (!match) {
        return null;
      }
      var index = parseInt(match[1], 10);
      if (index === 0) {
        return q('[data-line="' + match[2] + '"]') || q('[data-line="' + (match[2] === 'rent' ? 'rent' : 'expenses') + '"]');
      }
      var row = propertyRows()[index - 1];
      return row ? row.querySelector('[data-property-field="' + match[2] + '"]').closest('.calc-line') : null;
    }

    function clearErrors() {
      qa('.calc-line[data-invalid="true"]').forEach(function (line) {
        line.removeAttribute('data-invalid');
        var message = line.querySelector('[data-error]');
        message.hidden = true;
        message.textContent = '';
        line.querySelector('input').removeAttribute('aria-invalid');
      });
    }

    function showErrors(errors) {
      errors.forEach(function (error) {
        var line = lineFor(error.field);
        if (!line) {
          return;
        }
        var message = line.querySelector('[data-error]');
        line.setAttribute('data-invalid', 'true');
        message.textContent = text('error-' + error.code) || text('error-notANumber');
        message.hidden = false;
        line.querySelector('input').setAttribute('aria-invalid', 'true');
      });
    }

    function announce(message) {
      if (message !== lastAnnounced) {
        q('[data-live]').textContent = message;
        lastAnnounced = message;
      }
    }

    /* Rendering */

    function animateTax(target) {
      var figure = q('.calc-results__figure');
      setOut('stripTax', formatMoney(target));
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      if (shownTax === null || shownTax === target || reduceMotion.matches) {
        shownTax = target;
        figure.textContent = formatMoney(target);
        return;
      }
      var from = shownTax;
      var started = null;
      var duration = parseFloat(window.getComputedStyle(el).getPropertyValue('--duration-count')) || 600;
      shownTax = target;
      var step = function (time) {
        if (started === null) {
          started = time;
        }
        var progress = Math.min(1, (time - started) / duration);
        var eased = 1 - Math.pow(1 - progress, 3);
        figure.textContent = formatMoney(Math.round(from + (target - from) * eased));
        frame = progress < 1 ? window.requestAnimationFrame(step) : null;
      };
      frame = window.requestAnimationFrame(step);
    }

    function renderBar(owner) {
      var r = owner.result;
      var bar = q('[data-bar]');
      var key = q('[data-bar-key]');
      var gross = owner.grossRent;
      var items = gross > 0 ? r.rentBreakdown.filter(function (item) { return item.amount > 0; }) : [];
      var labels = [];
      var segments = qa('.calc-bar__segment', bar);
      while (key.firstChild) {
        key.removeChild(key.firstChild);
      }
      items.forEach(function (item, index) {
        var label;
        if (item.kind === 'deduction') {
          label = text('key-' + item.route, { amount: formatMoney(item.amount) });
        } else if (item.kind === 'band') {
          label = text('key-band', { amount: formatMoney(item.amount), rate: formatPercent(item.rate) });
        } else {
          label = text('key-' + item.kind, { amount: formatMoney(item.amount) });
        }
        labels.push(label);
        var level = item.kind === 'band' ? String(item.rate < 0.3 ? 1 : item.rate < 0.44 ? 2 : 3) : null;
        var segment = segments[index];
        if (!segment) {
          segment = document.createElement('span');
          segment.className = 'calc-bar__segment';
          bar.appendChild(segment);
        }
        segment.setAttribute('data-kind', item.kind);
        if (level) {
          segment.setAttribute('data-level', level);
        } else {
          segment.removeAttribute('data-level');
        }
        segment.style.width = (item.amount / gross * 100).toFixed(3) + '%';

        var entry = document.createElement('li');
        entry.className = 'calc-bar-key__item';
        var swatch = document.createElement('span');
        swatch.className = 'calc-bar-key__swatch';
        swatch.setAttribute('data-kind', item.kind);
        swatch.setAttribute('aria-hidden', 'true');
        if (level) {
          swatch.setAttribute('data-level', level);
        }
        entry.appendChild(swatch);
        entry.appendChild(document.createTextNode(label));
        key.appendChild(entry);
      });
      segments.slice(items.length).forEach(function (segment) {
        bar.removeChild(segment);
      });
      bar.setAttribute('aria-label', text('barLabel', { rent: formatMoney(gross), parts: joinList(labels) }));
    }

    function renderSums(owner) {
      var r = owner.result;
      setOut('sumRent', formatMoney(owner.grossRent));
      setOut('sumDeductionName', routeName(owner.selectedRoute));
      setOut('sumDeduction', formatMoney(r.deduction));
      setOut('sumProfit', formatMoney(r.profit));
      setOut('sumTaxBefore', formatMoney(r.propertyTax + r.finance.credit));
      setOut('sumCredit', formatMoney(r.finance.credit));
      setOut('sumTax', formatMoney(r.propertyTax));
    }

    function renderSection24(owner) {
      var r = owner.result;
      var f = r.finance;
      setOut('s24Paid', formatMoney(owner.financeCosts));
      setOut('s24BroughtForward', formatMoney(f.broughtForward));
      setOut('s24Relieved', formatMoney(f.relieved));
      setOut('s24Rate', formatPercent(f.reliefRate));
      setOut('s24Credit', formatMoney(f.credit));
      setOut('s24CarriedForward', formatMoney(f.carriedForward));
      var limit;
      if (owner.selectedRoute !== 'expenses' && owner.financeCosts > 0) {
        limit = 'route';
      } else if (f.financeLimb === 0) {
        limit = 'none';
      } else {
        limit = f.limitingFactor;
      }
      qa('[data-limit]').forEach(function (node) {
        node.hidden = node.getAttribute('data-limit') !== limit;
      });
      var compare = q('[data-s24-compare]');
      compare.hidden = r.pre2017PropertyTax === null;
      if (r.pre2017PropertyTax !== null) {
        setOut('s24Pre2017', formatMoney(r.pre2017PropertyTax));
        setOut('s24Cost', formatMoney(r.section24Cost));
      }
    }

    function renderRoutes(owner) {
      engine.ROUTES.forEach(function (route) {
        var row = q('[data-route="' + route + '"]');
        var info = owner.routes[route];
        var status = '';
        if (!info.available) {
          status = text('reason-' + info.reason);
        } else if (route === owner.recommendedRoute) {
          status = text('recommended');
        } else if (route === owner.selectedRoute) {
          status = text('selected');
        }
        row.querySelector('[data-route-tax]').textContent = info.available ? formatMoney(info.result.propertyTax) : text('notAvailable');
        row.querySelector('[data-route-status]').textContent = status;
        row.setAttribute('data-recommended', String(info.available && route === owner.recommendedRoute));
      });
    }

    function showAlert(name, slots) {
      var node = q('[data-alert="' + name + '"]');
      if (!node) {
        return;
      }
      Object.keys(slots).forEach(function (slot) {
        qa('[data-slot="' + slot + '"]', node).forEach(function (target) {
          target.textContent = slots[slot];
        });
      });
      node.hidden = false;
    }

    function renderAlerts(result, input) {
      qa('[data-alert]').forEach(function (node) {
        node.hidden = true;
      });
      var owner = result.owner;
      var r = owner.result;
      var year = rates[input.taxYear];

      owner.warnings.forEach(function (warning) {
        switch (warning.code) {
          case 'allowanceForfeitsCredit':
            showAlert('allowanceForfeitsCredit', { amount: formatMoney(warning.amount) });
            break;
          case 'selectedRouteUnavailable':
            showAlert('routeUnavailable', { reason: text('reason-' + warning.reason), route: routeName(owner.selectedRoute) });
            break;
          case 'personalAllowanceTaper':
            showAlert('taper', { threshold: formatMoney(year.paTaperThreshold), rate: formatPercent(warning.rate) });
            break;
          case 'financeCostsCarriedForward':
            if (owner.selectedRoute === 'expenses') {
              showAlert('financeCarried', { amount: formatMoney(warning.amount) });
            }
            break;
          case 'lossCarriedForward':
            showAlert('lossCarried', { amount: formatMoney(warning.amount) });
            break;
          case 'creditCappedByTax':
            showAlert('creditCapped', {});
            break;
          default:
            break;
        }
      });

      var nextYear = engine.nextPropertyRateChange(rates, input.taxYear);
      if (nextYear && rates[nextYear].regions[input.region]) {
        var future = engine.calculate(Object.assign({}, input, { taxYear: nextYear }), rates);
        if (future.ok) {
          var difference = future.owner.result.propertyTax - r.propertyTax;
          if (difference !== 0) {
            showAlert(difference > 0 ? 'rateChangeMore' : 'rateChangeLess', {
              date: longDate(rates[nextYear].startDate),
              amount: formatMoney(Math.abs(difference)),
              year: rates[nextYear].label
            });
          }
        }
      }

      var phase = engine.mtdStatus(owner.grossRent, config.mtd);
      if (phase) {
        showAlert(phase.startDate <= isoToday() ? 'mtdNow' : 'mtdFuture', {
          threshold: formatMoney(phase.threshold),
          date: longDate(phase.startDate),
          testYear: yearLabel(phase.testYear)
        });
      }

      if (result.taxYear.isForecast) {
        showAlert('forecast', { year: result.taxYear.label, note: result.taxYear.forecastNote || '' });
      }
    }

    function renderNarration(result, input) {
      var owner = result.owner;
      var r = owner.result;
      var parts = [];
      if (r.profit < 0) {
        parts.push(text('narrLoss', { costs: formatMoney(r.deduction), rent: formatMoney(owner.grossRent), loss: formatMoney(r.lossCarriedForward) }));
      } else {
        parts.push(text('narrProfit', { rent: formatMoney(owner.grossRent), deduction: formatMoney(r.deduction), routeName: routeName(owner.selectedRoute), profit: formatMoney(r.profit) }));
        if (r.lossUsed > 0) {
          parts.push(text('narrLossUsed', { amount: formatMoney(r.lossUsed) }));
        }
        if (r.taxableProfit > 0) {
          var bands = [];
          if (r.paAgainstProperty > 0) {
            bands.push(text('bandAllowance', { amount: formatMoney(r.paAgainstProperty) }));
          }
          r.propertySlices.forEach(function (slice) {
            bands.push(text('bandSlice', { amount: formatMoney(slice.amount), rate: formatPercent(slice.rate) }));
          });
          parts.push(text('narrBands', { other: formatMoney(input.otherIncome), bands: joinList(bands) }));
        }
      }
      if (owner.financeCosts > 0 || r.finance.broughtForward > 0) {
        if (owner.selectedRoute === 'expenses') {
          parts.push(text('narrCredit', { interest: formatMoney(r.finance.financeLimb), credit: formatMoney(r.finance.credit), rate: formatPercent(r.finance.reliefRate) }));
        } else {
          parts.push(text('narrNoCredit', { routeName: routeName(owner.selectedRoute) }));
        }
      }
      if (r.propertyTax >= 0) {
        parts.push(text('narrTotal', { tax: formatMoney(r.propertyTax), monthly: formatMoney(Math.round(r.propertyTax / 12), true), keep: formatMoney(r.netRentalIncome) }));
      } else {
        parts.push(text('narrNegative', { amount: formatMoney(-r.propertyTax), keep: formatMoney(r.netRentalIncome) }));
      }
      parts.push(text('narrBasis', { year: result.taxYear.label, region: result.region.label }));
      q('[data-narration]').textContent = parts.join(' ');
    }

    function renderPrint(result, input) {
      var totals = input.properties.reduce(function (sum, p) {
        sum.rent += p.rent;
        sum.expenses += p.expenses;
        sum.financeCosts += p.financeCosts;
        return sum;
      }, { rent: 0, expenses: 0, financeCosts: 0 });
      setOut('printDate', longDate(isoToday()));
      setOut('printBasis', result.taxYear.label + text('separator') + result.region.label);
      setOut('printOtherIncome', formatMoney(input.otherIncome));
      setOut('printProperty', text('propertyTotals', { rent: formatMoney(totals.rent), expenses: formatMoney(totals.expenses), interest: formatMoney(totals.financeCosts) }));
      setOut('printShare', input.partner ? text('share', { share: String(input.ownerShare) }) : text('shareSole'));
      setOut('printRoute', routeName(result.owner.selectedRoute));
      setOut('printBroughtForward', text('broughtForward', { losses: formatMoney(input.lossesBroughtForward), interest: formatMoney(input.financeCostsBroughtForward) }));
    }

    function calculate() {
      timer = null;
      syncItemised();
      clearErrors();
      var input = readInput();
      var result = engine.calculate(input, rates);
      var invalidNote = q('[data-invalid-note]');

      if (!result.ok) {
        showErrors(result.errors);
        results.setAttribute('data-stale', 'true');
        invalidNote.hidden = false;
        announce(invalidNote.textContent);
        return;
      }

      results.removeAttribute('data-stale');
      invalidNote.hidden = true;
      var owner = result.owner;
      var r = owner.result;

      setOut('yearLabel', result.taxYear.label);
      animateTax(r.propertyTax);
      setOut('monthlyTax', formatMoney(Math.round(r.propertyTax / 12), true));
      setOut('netRentalIncome', formatMoney(r.netRentalIncome));
      setOut('grossRent', formatMoney(owner.grossRent));
      setOut('effectiveRate', formatPercent(r.effectiveRate));
      setOut('marginalBand', r.marginalBandName ? r.marginalBandName + text('separator') + formatPercent(r.marginalRate) : text('withinAllowance'));

      var partner = q('[data-partner]');
      partner.hidden = !result.partner;
      if (result.partner) {
        setOut('partnerTax', formatMoney(result.partner.result.propertyTax));
        setOut('partnerKeep', formatMoney(result.partner.result.netRentalIncome));
      }

      renderBar(owner);
      renderSums(owner);
      renderSection24(owner);
      renderRoutes(owner);
      renderAlerts(result, input);
      renderNarration(result, input);
      renderPrint(result, input);
      announce(text('liveSummary', { tax: formatMoney(r.propertyTax), keep: formatMoney(r.netRentalIncome) }));
    }

    function schedule() {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(calculate, DEBOUNCE_MS);
    }

    /* Shareable link */

    function shareUrl(input) {
      var params = new URLSearchParams();
      var first = input.properties[0];
      params.set('y', input.taxYear);
      params.set('r', input.region);
      params.set('oi', queryPounds(input.otherIncome));
      params.set('rent', queryPounds(first.rent));
      if (itemisedInUse()) {
        params.set('items', itemInputs().filter(function (i) { return parseMoney(i.value) > 0; }).map(function (i) {
          return i.getAttribute('data-expense') + ':' + queryPounds(parseMoney(i.value));
        }).join(','));
      } else {
        params.set('exp', queryPounds(first.expenses));
      }
      if (!financeLine.hidden) {
        params.set('int', queryPounds(first.financeCosts));
      }
      if (input.properties.length > 1) {
        params.set('props', input.properties.slice(1).map(function (p) {
          return [p.rent, p.expenses, p.financeCosts].map(queryPounds).join('_');
        }).join(','));
      }
      if (input.partner) {
        params.set('joint', '1');
        params.set('share', String(input.ownerShare));
        params.set('poi', queryPounds(input.partner.otherIncome));
      }
      if (input.lettingType === 'roomInOwnHome') {
        params.set('room', '1');
      }
      if (input.rentARoomShared) {
        params.set('shared', '1');
      }
      if (input.reliefMode !== 'auto') {
        params.set('mode', input.reliefMode);
      }
      if (input.lossesBroughtForward) {
        params.set('lbf', queryPounds(input.lossesBroughtForward));
      }
      if (input.financeCostsBroughtForward) {
        params.set('fbf', queryPounds(input.financeCostsBroughtForward));
      }
      return window.location.href.split('#')[0].split('?')[0] + '?' + params.toString();
    }

    function applyQuery(search) {
      var params = new URLSearchParams(search);
      if (!params.has('rent') && !params.has('oi')) {
        return false;
      }
      var setMoney = function (name, key) {
        field(name).value = params.has(key) ? groupDigits(parseMoney(params.get(key))) : '';
      };
      if (rates[params.get('y')]) {
        field('taxYear').value = params.get('y');
      }
      if (regionKeys.indexOf(params.get('r')) !== -1) {
        field('region').value = params.get('r');
      }
      setMoney('otherIncome', 'oi');
      setMoney('rent', 'rent');
      setMoney('expenses', 'exp');
      if (params.has('items')) {
        params.get('items').split(',').forEach(function (pair) {
          var bits = pair.split(':');
          var input = rowsHost.querySelector('[data-expense="' + bits[0] + '"]');
          if (input) {
            input.value = groupDigits(parseMoney(bits[1]));
          }
        });
        q('[data-expense-helper]').open = true;
      }
      setFinanceVisible(params.has('int'));
      setMoney('financeCosts', 'int');
      if (params.has('props')) {
        params.get('props').split(',').slice(0, MAX_EXTRA_PROPERTIES).forEach(function (chunk) {
          var values = chunk.split('_').map(parseMoney);
          addProperty({ rent: values[0], expenses: values[1], financeCosts: values[2] });
        });
      }
      field('joint').checked = params.get('joint') === '1';
      field('ownerShare').value = params.get('share') || '50';
      setMoney('partnerOtherIncome', 'poi');
      field('roomInOwnHome').checked = params.get('room') === '1';
      field('rentARoomShared').checked = params.get('shared') === '1';
      if (['auto', 'expenses', 'propertyAllowance', 'rentARoom'].indexOf(params.get('mode')) !== -1) {
        field('reliefMode').value = params.get('mode');
      }
      setMoney('lossesBroughtForward', 'lbf');
      setMoney('financeCostsBroughtForward', 'fbf');
      if (params.has('props') || params.has('joint') || params.has('mode') || params.has('room') || params.has('lbf') || params.has('fbf')) {
        q('.calc-advanced').open = true;
      }
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
      qa('input[type="checkbox"]', form).forEach(function (input) {
        input.checked = false;
      });
      field('ownerShare').value = '50';
      field('reliefMode').value = 'auto';
      field('taxYear').value = defaultYear;
      field('region').value = regionKeys[0];
      propertyRows().forEach(function (row) {
        propertiesHost.removeChild(row);
      });
      numberProperties();
      setFinanceVisible(false);
      syncToggles();
      q('[data-example-note]').hidden = true;
      edited = true;
      if (ownsQuery && window.location.search) {
        window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      }
      calculate();
      setStatus(text('resetDone'));
      field('otherIncome').focus();
    }

    /* Events */

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      calculate();
    });

    form.addEventListener('input', function (event) {
      var target = event.target;
      if (target.matches('input[inputmode="decimal"]')) {
        formatTyping(target, target.name === 'ownerShare');
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

    revealFinance.addEventListener('click', function () {
      setFinanceVisible(true);
      field('financeCosts').focus();
      schedule();
    });

    q('[data-add-property]').addEventListener('click', function () {
      var row = addProperty(null);
      row.querySelector('input').focus();
      schedule();
    });

    propertiesHost.addEventListener('click', function (event) {
      var button = event.target.closest('[data-remove-property]');
      if (!button) {
        return;
      }
      propertiesHost.removeChild(button.closest('[data-property]'));
      numberProperties();
      q('[data-add-property]').focus();
      schedule();
    });

    q('[data-clear-items]').addEventListener('click', function () {
      itemInputs().forEach(function (input) {
        input.value = '';
      });
      schedule();
    });

    q('[data-action="copy"]').addEventListener('click', function () {
      var url = shareUrl(readInput());
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

    describe(el);
    if (!queryClaimed) {
      ownsQuery = applyQuery(window.location.search);
      queryClaimed = ownsQuery;
    }
    if (ownsQuery) {
      edited = true;
      q('[data-example-note]').hidden = true;
    } else {
      setFinanceVisible(parseMoney(field('financeCosts').value) > 0);
    }
    numberProperties();
    syncToggles();
    calculate();

    return { element: el, calculate: calculate, reset: reset };
  }

  function init(container) {
    if (!container || container.hasAttribute('data-calculator-ready')) {
      return Promise.resolve(null);
    }
    if (!engine) {
      return Promise.reject(new Error('Load tax-engine.js before calculator.js'));
    }
    container.setAttribute('data-calculator-ready', 'loading');
    return loadConfig(container).then(function (config) {
      container.setAttribute('data-calculator-ready', 'true');
      return build(container, config);
    });
  }

  root.CalculateMyTaxCalculator = { init: init };

  function initAll() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-calculator]'), function (container) {
      if (!container.hasAttribute('data-calculator-manual')) {
        init(container);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
}(window));
