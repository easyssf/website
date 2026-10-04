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
    target.scrollIntoView();
    window.addEventListener('load', function () { setTimeout(function () { target.scrollIntoView(); }, 0); }, { once: true });
  }
})();
