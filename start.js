// The framework switch of the getting started section: a tablist per level, the platform and,
// for Java, the framework. The panels are the elements the tabs point to with aria-controls; a
// tablist inside a panel belongs to that panel. The choice is kept in localStorage and a panel
// can be linked to directly (index.html#start-quarkus), as can a heading inside one
// (index.html#quarkus-example-applications): the link selects the tab, and the tabs around it.
(function () {
  var lists = Array.prototype.slice.call(document.querySelectorAll('.switch[role="tablist"]'));
  if (lists.length === 0) { return; }
  var key = 'easyssf.framework';

  function tabsOf(list) { return Array.prototype.slice.call(list.querySelectorAll('[role="tab"]')); }
  function panelOf(tab) { return document.getElementById(tab.getAttribute('aria-controls')); }
  function selectedTab(list) { return list.querySelector('[role="tab"][aria-selected="true"]'); }

  var tabs = lists.reduce(function (all, list) { return all.concat(tabsOf(list)); }, []);
  function byPanelId(id) {
    return tabs.filter(function (tab) { return tab.getAttribute('aria-controls') === id; })[0];
  }

  // the tab of the panel a tablist sits in, if any
  function parentTab(list) {
    var panel = list.closest('[role="tabpanel"]');
    return panel ? byPanelId(panel.id) : null;
  }

  function selectInList(tab) {
    tabsOf(tab.closest('[role="tablist"]')).forEach(function (other) {
      var selected = other === tab;
      other.setAttribute('aria-selected', selected ? 'true' : 'false');
      other.tabIndex = selected ? 0 : -1;
      var panel = panelOf(other);
      if (panel) { panel.hidden = !selected; }
    });
  }

  // the innermost panel shown: the panel of the tab, then of the selected tab of any tablist in it
  function deepestPanel(tab) {
    var panel = panelOf(tab);
    for (;;) {
      var inner = panel && panel.querySelector('.switch[role="tablist"]');
      var innerTab = inner && selectedTab(inner);
      if (!innerTab) { return panel; }
      panel = panelOf(innerTab);
    }
  }

  // selects the tab, and the tabs of the tablists it is nested in
  function select(tab, focus) {
    for (var t = tab; t; t = parentTab(t.closest('[role="tablist"]'))) { selectInList(t); }
    if (focus) { tab.focus(); }
    try { localStorage.setItem(key, deepestPanel(tab).id); } catch (e) { /* storage unavailable */ }
  }

  lists.forEach(function (list) {
    var own = tabsOf(list);
    own.forEach(function (tab, index) {
      tab.addEventListener('click', function () { select(tab, false); });
      tab.addEventListener('keydown', function (event) {
        var next;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { next = own[(index + 1) % own.length]; }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { next = own[(index - 1 + own.length) % own.length]; }
        else if (event.key === 'Home') { next = own[0]; }
        else if (event.key === 'End') { next = own[own.length - 1]; }
        if (next) { event.preventDefault(); select(next, true); }
      });
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
