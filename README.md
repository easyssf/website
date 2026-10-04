# easyssf.org

The project website, static files without a build step or external resources:

| File | |
|---|---|
| `index.html` | the page, with an inline SVG diagram |
| `news.html` | all news items |
| `news.json` | the news items, see below |
| `news.js` | renders `news.json` into both pages |
| `tools.html`, `tools.js` | the tools page, one tool at a time behind a switcher like jwt.io's, each linkable as `tools.html#inspector` etc.: the listing of all event types with their claims and easyssf aliases, links to other tools such as caep.dev, a Security Event Token generator for the CAEP, RISC, SCIM and SSF event types with RFC 9493 subjects, signed in the browser with Web Crypto (the key is kept in `localStorage`), and a SET inspector; "Copy as link" encodes the form state into a URL fragment, so a SET can be linked to; custom JSON claims can be merged into the SET and the event payload; named token presets (issuer, audience, signature, legacy subject, custom SET claims) are kept in `localStorage` only |
| `site.js` | shared by every page: a minimal syntax highlighter for the code blocks (XML, YAML, properties, Java, JSON; `<code class="language-...">`, guessed when missing), the theme toggle of the header (system, light, dark, kept in `localStorage` and applied by an inline script in the head before the first paint) and the height of the sticky header as a CSS variable, the scroll margin of the sections |
| `start.js` | the Spring Boot / Quarkus / plain Java switch of the getting started section, deep-linkable as `index.html#start-quarkus` or `index.html#start-plain` |
| `site.css` | the stylesheet of all pages; light and dark theme by `prefers-color-scheme`, or forced with `data-theme` on the root element |
| `easyssf-icon.svg` | the icon, used as favicon and in the header |
| `CNAME`, `.nojekyll` | the custom domain for GitHub Pages, and no Jekyll |
| `og-image.png` | the preview image for links shared on social media and chat, 1200×630; rendered from the icon with `rsvg-convert`, see below |
| `robots.txt`, `sitemap.xml` | for search engines; add new pages to the sitemap and bump `lastmod` |

## The tools page

The event catalog at the top of `tools.js` has one entry per profile (CAEP, RISC, SCIM, SSF), per
version of its specification (currently 1.0, and RFC 9967 for SCIM Events), per event type, with the
claims the specification defines and the alias of `SsfEventTypes`. A field's `default` is the example
value the event opens with, so every event type yields a complete example without typing. A new version of a profile is one
more entry in its `versions`, offered by the version selector of the generator; the first entry is
the default. The event type listing merges the versions of a profile and marks the events that are
not in every version with the version they come from, so SSF 1.1 adding an event is one entry with
the 1.1 events, the existing ones included. Field types are `text`,
`number`, `timestamp`, `select` (with `other: true` for a free value), `i18n` (a string that becomes
`{"en": ...}`), `list` (comma separated) and `json`. Signing needs a secure context, so preview over
`localhost` (below), not from a LAN address.

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

## Search engines

`index.html` carries a `google-site-verification` meta tag for Google Search Console, Open Graph
and Twitter card tags, and JSON-LD structured data (`WebSite`, `SoftwareSourceCode`). After a
deployment that adds a page, update `sitemap.xml` and resubmit it in Search Console.

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
