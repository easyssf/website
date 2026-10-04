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

// Minimal syntax highlighting for the code examples: a few token rules per language, applied
// to <code class="language-..."> blocks (the language is guessed when the class is missing).
// No library, no external request; the colours are theme variables in site.css.
(function () {
  var rules = {
    java: [
      ['c', '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/'],
      ['s', '"(?:[^"\\\\\\n]|\\\\.)*"'],
      ['a', '@[A-Za-z_]\\w*'],
      ['k', '\\b(?:abstract|boolean|break|case|catch|class|continue|default|do|else|enum|extends|final|finally|for|if|implements|import|instanceof|interface|new|null|package|private|protected|public|record|return|static|super|switch|this|throw|throws|true|false|try|var|void|while|yield)\\b'],
      ['t', '\\b[A-Z][A-Za-z0-9_]*\\b'],
      ['n', '\\b\\d[\\d_]*L?\\b']
    ],
    xml: [
      ['c', '<!--[\\s\\S]*?-->'],
      ['s', '"[^"]*"'],
      ['t', '<\\/?[\\w.:-]+|\\/?>'],
      ['a', '[\\w.:-]+(?==)']
    ],
    yaml: [
      ['c', '#[^\\n]*'],
      ['p', '^[ \\t-]*[\\w.-]+(?=:)'],
      ['v', '\\$\\{[^}]*\\}'],
      ['s', '"[^"\\n]*"|\'[^\'\\n]*\''],
      ['n', '\\b\\d+\\b|\\b(?:true|false|null)\\b']
    ],
    properties: [
      ['c', '^[ \\t]*[#!][^\\n]*'],
      ['p', '^[^=\\s][^=\\n]*(?==)'],
      ['v', '\\$\\{[^}]*\\}'],
      ['n', '\\b(?:true|false)\\b']
    ],
    json: [
      ['p', '"(?:[^"\\\\]|\\\\.)*"(?=\\s*:)'],
      ['s', '"(?:[^"\\\\]|\\\\.)*"'],
      ['n', '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b'],
      ['k', '\\b(?:true|false|null)\\b']
    ]
  };
  var compiled = {};
  function regex(lang) {
    if (!compiled[lang]) {
      compiled[lang] = new RegExp(rules[lang].map(function (r) { return '(' + r[1] + ')'; }).join('|'), 'gm');
    }
    compiled[lang].lastIndex = 0;
    return compiled[lang];
  }
  function escape(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // The language of a block without a class, from its first lines.
  function detect(text) {
    var t = text.replace(/^\s+/, '');
    if (t.charAt(0) === '<') { return 'xml'; }
    if (t.charAt(0) === '{' || t.charAt(0) === '[') { return 'json'; }
    if (/^\s*@|;\s*$/m.test(t) && /\b(?:class|new|implements|import)\b/.test(t)) { return 'java'; }
    if (/^[\w.-]+=/m.test(t)) { return 'properties'; }
    if (/^[\w.-]+:\s*$|^\s+[\w.-]+:\s/m.test(t)) { return 'yaml'; }
    return null;
  }
  // Highlights text of a language as HTML.
  function highlight(text, lang) {
    if (!rules[lang]) { return escape(text); }
    var re = regex(lang), out = '', last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') { re.lastIndex++; continue; }
      var kind = null;
      for (var i = 1; i < m.length; i++) { if (m[i] !== undefined) { kind = rules[lang][i - 1][0]; break; } }
      out += escape(text.slice(last, m.index)) + '<span class="tok-' + kind + '">' + escape(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + escape(text.slice(last));
  }
  // Highlights every code block within the root, once.
  function highlightAll(root) {
    (root || document).querySelectorAll('pre > code').forEach(function (code) {
      if (code.dataset.highlighted) { return; }
      var match = /language-(\w+)/.exec(code.className);
      var lang = match ? match[1] : detect(code.textContent);
      if (!lang || !rules[lang]) { return; }
      code.innerHTML = highlight(code.textContent, lang);
      code.dataset.highlighted = lang;
    });
  }
  window.easyssfHighlight = highlight;
  window.easyssfHighlightAll = highlightAll;
  highlightAll(document);
})();
