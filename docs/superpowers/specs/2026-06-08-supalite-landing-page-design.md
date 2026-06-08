# SupaLite Landing Page — Design Spec

Date: 2026-06-08
Status: approved (1st version)

## Goal

A promotional product homepage for SupaLite, hosted on GitHub Pages at
`genideas-labs.github.io/supalite`. Single landing page that converts a visitor
into `npm install supalite`, with all copy sourced from the existing README so
content does not drift.

## Decisions

- **Language:** EN/KO toggle (persisted in `localStorage`, defaults to
  `navigator.language`). Code snippets are language-agnostic.
- **Deployment:** GitHub Actions uploads the `site/` folder to Pages on push to
  `main`. `docs/` is reserved for real markdown docs and is not reused.
- **Scope:** single landing page; docs link out to GitHub README / npm.
- **Design:** dark developer theme — deep slate/near-black background,
  monospace code with neon green/cyan accent, Inter + JetBrains Mono.

## Tech approach

Zero-build static site. No framework, no bundler.

```
site/
  index.html              all markup; English copy inline, data-i18n keys
  assets/styles.css        dark theme + responsive
  assets/app.js            EN/KO toggle, copy-to-clipboard, tabs, hljs init
  assets/favicon.svg
.github/workflows/pages.yml  deploy site/ to Pages on push to main
```

i18n: each translatable element carries `data-i18n="<key>"` with English inline
as the no-JS fallback. `app.js` captures the inline English at load and holds a
Korean override dictionary; toggling swaps `innerHTML`.

Code highlighting: highlight.js via CDN (github-dark theme, transparent
background to sit on the card surface).

## Sections (top → bottom)

1. **Hero** — name, tagline ("a lightweight TypeScript PostgreSQL client with a
   Supabase-style API"), serverless-latency hook, npm badges, copyable
   `npm install supalite`, GitHub/npm CTAs, "Used in production by oqoq.ai",
   language toggle in nav.
2. **One-liner pitch** — "a slim Supabase client for query builder + RPC +
   transactions; need auth/storage/realtime? use supabase-js".
3. **Features grid** (6 cards) — type-safe query builder · transactions (not in
   Supabase) · RPC · multi-schema · pooling/perf · `supalite gen types` codegen.
4. **"Reads like Supabase"** — paginated-select snippet with tabbed
   SupaLite / Prisma / Drizzle comparison.
5. **Compatibility & fit** — ✅ select/filters/embeds/CRUD/RPC/transactions,
   ❌ auth/storage/realtime, plus a when-to-use note vs Prisma/Drizzle.
6. **Quickstart** — install → connect → query → `gen types`, all copyable.
7. **Footer** — GitHub · npm · README (EN/KO) · Issues · MIT · Genideas Inc.

## Manual one-time step

Repo **Settings → Pages → Source: GitHub Actions** (required once before the
first deploy succeeds).
