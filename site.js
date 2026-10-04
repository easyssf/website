// Keeps --header-h, the height of the sticky header, current: the sections use it as their
// scroll margin, so that a link to a section lands below the header whether the header is one
// row or, on narrow screens, two. The browser scrolls to the fragment before this runs, with
// the fallback margin, so the scroll is repeated once the height is known.
(function () {
  var header = document.querySelector('header.site');
  if (!header) { return; }
  function update() { document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px'); }
  update();
  if (window.ResizeObserver) { new ResizeObserver(update).observe(header); } else { window.addEventListener('resize', update); }
  var target = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  if (target) {
    // instant, like the browser's own jump to a fragment; smooth scrolling is for clicks
    target.scrollIntoView({ behavior: 'instant' });
    window.addEventListener('load', function () { setTimeout(function () { target.scrollIntoView({ behavior: 'instant' }); }, 0); }, { once: true });
  }
})();

// The theme toggle of the header: system, light, dark, in turn. The choice is kept in
// localStorage and applied by the inline script in the head before the first paint; here it
// is switched, the button labelled and the theme-color of the browser chrome updated.
(function () {
  var KEY = 'easyssf.theme';
  var root = document.documentElement;
  var buttons = document.querySelectorAll('[data-theme-toggle]');
  if (buttons.length === 0) { return; }
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  var original = Array.prototype.map.call(metas, function (m) { return m.getAttribute('content'); });
  var labels = { '': 'Theme: follows the system', light: 'Theme: light', dark: 'Theme: dark' };

  function current() { return root.getAttribute('data-theme') || ''; }

  function apply(theme) {
    if (theme) { root.setAttribute('data-theme', theme); } else { root.removeAttribute('data-theme'); }
    try { if (theme) { localStorage.setItem(KEY, theme); } else { localStorage.removeItem(KEY); } } catch (e) { /* storage unavailable */ }
    // the colour of the browser chrome follows the forced theme, or the media queries again
    var forced = theme ? getComputedStyle(root).getPropertyValue('--bg').trim() : null;
    metas.forEach(function (m, i) { m.setAttribute('content', forced || original[i]); });
    var label = labels[theme] + ', click for ' + (theme === '' ? 'light' : theme === 'light' ? 'dark' : 'the system theme');
    buttons.forEach(function (b) { b.setAttribute('aria-label', label); b.setAttribute('title', label); });
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var t = current();
      apply(t === '' ? 'light' : t === 'light' ? 'dark' : '');
    });
  });
  apply(current());
})();
