# easyssf.org

The project website, static files without a build step or external resources:

| File | |
|---|---|
| `index.html` | the page, with an inline SVG diagram |
| `news.html` | all news items |
| `news.json` | the news items, see below |
| `news.js` | renders `news.json` into both pages |
| `start.js` | the Spring Boot / Quarkus switch of the getting started section, deep-linkable as `index.html#start-quarkus` |
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

The site is served from the `main` branch of [easyssf/website](https://github.com/easyssf/website)
(public, as GitHub Pages is not available for private repositories of an organization on the free
plan). Once:

```sh
gh repo edit easyssf/website --visibility public --accept-visibility-change-consequences
git push -u origin main
gh api -X POST repos/easyssf/website/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/'
```

Then, at the DNS provider of `easyssf.org`, add the `A` records for GitHub Pages
(`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and a `CNAME` from
`www` to `easyssf.github.io`. The `CNAME` file in this repository registers `easyssf.org` as the
custom domain on every deployment. When the certificate has been issued (Settings > Pages shows it,
usually within an hour of the DNS change), enforce HTTPS:

```sh
gh api -X PUT repos/easyssf/website/pages -F https_enforced=true
gh api repos/easyssf/website/pages --jq '{status, html_url, cname, https_enforced}'
```

Every later `git push` to `main` deploys within a minute.
