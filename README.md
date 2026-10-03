# easyssf.org

The project website, static files without a build step or external resources:

| File | |
|---|---|
| `index.html` | the page, with an inline SVG diagram |
| `news.html` | all news items |
| `news.json` | the news items, see below |
| `news.js` | renders `news.json` into both pages |
| `site.css` | the stylesheet of both pages, light and dark theme |
| `easyssf-icon.svg` | the icon, used as favicon and in the header |
| `CNAME`, `.nojekyll` | the custom domain for GitHub Pages, and no Jekyll |

## Adding a news item

Add an object to the top of `news.json`:

```json
{
  "id": "2026-11-01-release-0-1-0",
  "date": "2026-11-01",
  "title": "easyssf 0.1.0 released",
  "body": "<p>What changed ...</p><ul><li>...</li></ul>"
}
```

- `id` is the anchor of the item on the news page (`news.html#2026-11-01-release-0-1-0`), so it has
  to be unique; a date prefix keeps them sorted and unique.
- `date` is `YYYY-MM-DD`; items are shown newest first regardless of their order in the file.
- `body` is HTML: paragraphs, lists, links and `<code>` are styled. Escape double quotes as `\"`.

The home page shows the three newest items, the news page all of them. The items are fetched by
`news.js`, so preview the site over HTTP (below) rather than by opening the file.

## Preview

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Deploy with GitHub Pages

1. Push this directory as a repository (for example `easyssf/easyssf.org`) and enable Pages for the
   `main` branch, root folder, under Settings > Pages.
2. At the DNS provider of `easyssf.org`, add the `A` records for GitHub Pages
   (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and a `CNAME` from
   `www` to `<org>.github.io`.
3. Enter `easyssf.org` as the custom domain under Settings > Pages (the `CNAME` file keeps it across
   deployments) and enable "Enforce HTTPS" once the certificate is issued.

Any other static host works the same way: serve the directory as it is.
