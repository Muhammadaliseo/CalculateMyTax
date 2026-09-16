/*
 * Site behaviour shared by every page: header shadow on scroll, mobile menu, dropdown menus and footer
 * accordions. It changes states and attributes only; it never writes page content.
 */
(function () {
  'use strict';

  var mobile = window.matchMedia('(max-width: 47.99em)');

  /* Opened straight from the docs folder (file://), a link to a folder shows a file listing instead of the page,
     so point folder links and forms at their index.html. On a web server such as GitHub Pages nothing changes. */
  if (window.location.protocol === 'file:') {
    var toIndex = function (value) {
      if (!value || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) {
        return null;
      }
      var cut = value.search(/[?#]/);
      var address = cut === -1 ? value : value.slice(0, cut);
      var rest = cut === -1 ? '' : value.slice(cut);
      if (address === '' || /\/$/.test(address)) {
        return address + 'index.html' + rest;
      }
      if (address === '.' || address === '..') {
        return address + '/index.html' + rest;
      }
      return null;
    };
    Array.prototype.forEach.call(document.querySelectorAll('a[href], form[action]'), function (node) {
      var attribute = node.tagName === 'FORM' ? 'action' : 'href';
      var fixed = toIndex(node.getAttribute(attribute));
      if (fixed) {
        node.setAttribute(attribute, fixed);
      }
    });
  }

  /* Header gains a shadow once the page scrolls. Only the shadow changes, never the header's size, so the
     page does not move and the header cannot flicker. */
  var header = document.querySelector('.site-header');
  if (header) {
    var ticking = false;
    var update = function () {
      header.setAttribute('data-scrolled', window.scrollY > 0 ? 'true' : 'false');
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) {
        window.requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
    update();
  }

  /* Mobile menu */
  var menuButton = document.querySelector('.site-header__menu-button');
  var nav = document.getElementById('site-nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', function () {
      var open = menuButton.getAttribute('aria-expanded') !== 'true';
      menuButton.setAttribute('aria-expanded', String(open));
      nav.setAttribute('data-open', String(open));
    });
  }

  /* Dropdown menus */
  var toggles = Array.prototype.slice.call(document.querySelectorAll('.site-nav__toggle'));
  var closeAll = function (except) {
    toggles.forEach(function (toggle) {
      if (toggle !== except) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  };
  toggles.forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      closeAll(toggle);
      toggle.setAttribute('aria-expanded', String(open));
    });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }
    var open = toggles.filter(function (t) { return t.getAttribute('aria-expanded') === 'true'; })[0];
    if (open) {
      open.setAttribute('aria-expanded', 'false');
      open.focus();
    }
  });
  document.addEventListener('click', function (event) {
    if (!event.target.closest('.site-nav__item')) {
      closeAll(null);
    }
  });

  /* Footer columns: open on larger screens, accordions on small ones */
  var groups = Array.prototype.slice.call(document.querySelectorAll('.site-footer__group'));
  var syncFooter = function () {
    groups.forEach(function (group) {
      group.open = !mobile.matches;
    });
  };
  groups.forEach(function (group) {
    group.querySelector('.site-footer__heading').addEventListener('click', function (event) {
      if (!mobile.matches) {
        event.preventDefault();
      }
    });
  });
  syncFooter();
  if (mobile.addEventListener) {
    mobile.addEventListener('change', syncFooter);
  }
}());
