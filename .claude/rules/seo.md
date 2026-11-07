---
paths:
  - "front/src/seo/**"
  - "front/src/content/**"
  - "deploy/Caddyfile"
---

# SEO rules

- Every indexable page is an entry in `src/seo/pages.ts` with a unique title and description in English and French; prerender and sitemap read from there.
- Private app routes stay `noindex` in `deploy/Caddyfile` and share the app shell.
- Content pages target a clear keyword theme (free browser 3D multiplayer game, life sim, campus town...) with one `h1`, real text and internal links.
- No mention of school or coursework in any content (see `global.md`).
