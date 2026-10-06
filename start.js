// The framework switch of the getting started section: one tab per framework, the panels are
// the elements the tabs point to with aria-controls. The choice is kept in localStorage and a
// panel can be linked to directly (index.html#start-quarkus), as can a heading inside one
// (index.html#quarkus-example-applications): the link selects the tab.
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.switch [role="tab"]'));
  if (tabs.length === 0) { return; }
  var key = 'easyssf.framework';

  function panelOf(tab) { return document.getElementById(tab.getAttribute('aria-controls')); }

  function select(tab, focus) {
    tabs.forEach(function (other) {
      var selected = other === tab;
      other.setAttribute('aria-selected', selected ? 'true' : 'false');
      other.tabIndex = selected ? 0 : -1;
      var panel = panelOf(other);
      if (panel) { panel.hidden = !selected; }
    });
    if (focus) { tab.focus(); }
    try { localStorage.setItem(key, panelOf(tab).id); } catch (e) { /* storage unavailable */ }
  }

  function byPanelId(id) {
    return tabs.filter(function (tab) { return tab.getAttribute('aria-controls') === id; })[0];
  }

  tabs.forEach(function (tab, index) {
    tab.addEventListener('click', function () { select(tab, false); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { next = tabs[(index + 1) % tabs.length]; }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { next = tabs[(index - 1 + tabs.length) % tabs.length]; }
      else if (event.key === 'Home') { next = tabs[0]; }
      else if (event.key === 'End') { next = tabs[tabs.length - 1]; }
      if (next) { event.preventDefault(); select(next, true); }
    });
  });

  // A link to a panel selects it and scrolls to the section, as the panel itself was hidden
  // when the browser tried to scroll to it.
  // On load the scroll is instant, like the browser's own jump to a fragment; a click on a link
  // to a panel scrolls smoothly.
  function fromHash(instant) {
    var target = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    var panel = target && target.closest('[role="tabpanel"]');
    var tab = panel && byPanelId(panel.id);
    if (!tab) { return false; }
    select(tab, false);
    // a link to the panel lands on the section, with the tabs; a link to a heading in it on the heading
    var section = target === panel ? tab.closest('section') || panel : target;
    var options = instant ? { behavior: 'instant' } : undefined;
    section.scrollIntoView(options);
    // The browser scrolls to the fragment again once the panel is visible, to the panel rather
    // than the section; it stops doing so when the page has loaded, so scroll once more then.
    if (document.readyState !== 'complete') {
      window.addEventListener('load', function () { setTimeout(function () { section.scrollIntoView(options); }, 0); }, { once: true });
    }
    return true;
  }

  if (!fromHash(true)) {
    var remembered = null;
    try { remembered = localStorage.getItem(key); } catch (e) { /* storage unavailable */ }
    var tab = remembered && byPanelId(remembered);
    if (tab) { select(tab, false); }
  }
  window.addEventListener('hashchange', function () { fromHash(false); });
})();
