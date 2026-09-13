/*
 * CalculateMyTax contact form.
 *
 * Progressive enhancement for the form marked data-contact-form. Without JavaScript the form posts to the form
 * service and returns to the thank-you page. With JavaScript it checks each field, sends the message in the
 * background and shows the result on the page. All wording lives in the markup's data attributes.
 */
(function () {
  'use strict';

  var form = document.querySelector('[data-contact-form]');
  if (!form || !window.fetch || !window.FormData) {
    return;
  }

  var endpoint = form.getAttribute('data-endpoint');
  var status = form.querySelector('[data-status]');
  var button = form.querySelector('[data-submit]');
  var fields = Array.prototype.slice.call(form.querySelectorAll('input[required], select[required], textarea[required]'));
  var sending = false;

  form.noValidate = true;

  function message(key) {
    return form.getAttribute('data-message-' + key) || '';
  }

  function setStatus(state, text) {
    status.setAttribute('data-state', state);
    status.textContent = text;
  }

  function check(input) {
    var error = document.getElementById(input.id + '-error');
    var text = '';
    if (input.validity.valueMissing || (input.value.trim() === '' && input.required)) {
      text = input.getAttribute('data-missing');
    } else if (input.validity.typeMismatch) {
      text = input.getAttribute('data-mismatch');
    }
    if (error) {
      error.textContent = text || '';
      error.hidden = !text;
    }
    if (text) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
    return !text;
  }

  fields.forEach(function (input) {
    input.addEventListener('blur', function () {
      if (input.value !== '' || input.hasAttribute('aria-invalid')) {
        check(input);
      }
    });
    input.addEventListener('input', function () {
      if (input.hasAttribute('aria-invalid')) {
        check(input);
      }
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) {
      return;
    }
    var firstInvalid = null;
    fields.forEach(function (input) {
      if (!check(input) && !firstInvalid) {
        firstInvalid = input;
      }
    });
    if (firstInvalid) {
      setStatus('error', message('check'));
      firstInvalid.focus();
      return;
    }
    // Automated sign-ups fill in every field, including the hidden one people never see.
    if (form.elements.namedItem('_honey').value) {
      form.reset();
      setStatus('sent', message('sent'));
      return;
    }

    sending = true;
    button.disabled = true;
    setStatus('sending', message('sending'));
    fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) })
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        }).then(function (data) {
          return response.ok && String(data.success) === 'true';
        });
      })
      .then(function (sent) {
        if (sent) {
          form.reset();
          setStatus('sent', message('sent'));
        } else {
          setStatus('error', message('failed'));
        }
      }, function () {
        setStatus('error', message('failed'));
      })
      .then(function () {
        sending = false;
        button.disabled = false;
      });
  });
}());
