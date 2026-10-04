// Renders the items of news.json into every element with a data-news attribute.
// data-limit="3" shows the newest items only, data-heading="h2" sets the heading level of the items. Items may contain simple HTML in "body".
(function () {
  function render(container, items) {
    var limit = parseInt(container.dataset.limit || '0', 10);
    var shown = limit > 0 ? items.slice(0, limit) : items;
    container.innerHTML = '';
    shown.forEach(function (item) {
      var article = document.createElement('article');
      article.className = 'news';
      article.id = item.id;
      var date = new Date(item.date + 'T00:00:00Z').toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
      });
      var href = container.dataset.limit ? 'news.html#' + item.id : '#' + item.id;
      var heading = container.dataset.heading || 'h3';
      article.innerHTML =
        '<time datetime="' + item.date + '">' + date + '</time>' +
        '<' + heading + '><a href="' + href + '"></a></' + heading + '>' +
        '<div class="body">' + (item.body || '') + '</div>';
      article.querySelector(heading + ' a').textContent = item.title;
      container.appendChild(article);
    });
    // The browser scrolled to the hash before the items existed, when the section was still
    // short, so scroll again: to an item, or to the section that holds the list.
    var target = location.hash && document.getElementById(location.hash.slice(1));
    if (target && (container.contains(target) || target.contains(container))) {
      target.scrollIntoView({ behavior: 'instant' });
    }
  }

  document.querySelectorAll('[data-news]').forEach(function (container) {
    fetch(container.dataset.news, { cache: 'no-cache' })
      .then(function (response) { if (!response.ok) { throw new Error(response.status); } return response.json(); })
      .then(function (items) {
        items.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
        render(container, items);
      })
      .catch(function () { /* the fallback content of the container stays */ });
  });
})();
