# Kura study library

A private study site: weekly 10-minute lessons, quizzes and news on a few industry topics.

## How it fits together

- `content/` is the source of truth. One JSON file per topic, lesson and news item.
- `scripts/build.py` checks every file and writes `public/data/library.json`, the one file the site reads.
- `public/` is the site (no build step on the host). `functions/` runs on Cloudflare Pages:
  - `_middleware.js` only lets a signed-in owner through (Cloudflare Access).
  - `api/progress.js` stores quiz progress in the KV namespace bound as `KURA_KV`, so it syncs across devices.
- Cloudflare Pages redeploys on every push to `main`.

## Adding content (the weekly runs do this)

1. Add `content/lessons/<topic>-<NN>.json` and any `content/news/<topic>-w<NN>-<MM>.json`.
2. Run `python3 scripts/build.py`. It must print `OK`. Fix anything it reports.
3. Commit `content/` and `public/data/library.json` together and push to `main`.

Lesson: `{topic, n, title, published (YYYY-MM-DD), minutes, body (Markdown, "### " headings), quiz[5 x {q, options[4], answer 0-3, why}], sources[{title, url, read: "full"|"excerpt"}]}`

News: `{topic, added, week, event_date, when, headline, body, why, source, url}`

A new topic is one file in `content/topics/` (`name, short, lang, day, order, hue, blurb, framework, syllabus[{n, module, title, goal}]`). `hue` is one of plum, indigo, moss, ochre, teal.

## Notifications

- `public/sw.js` shows notifications; the switch at the bottom of the site registers a device (`functions/api/push.js`, stored in KV under `push:subs:<email>`).
- `notifier/` is a separate scheduled Worker (`kurastudy-notifier`) connected to this same repo with root directory `notifier`. It is rebuilt on every push with `public/data/library.json` bundled in, checks every 5 minutes, and announces each lesson id it has not announced before (list kept in KV under `push:notified`).
- Signing keys are generated on first use and kept in KV under `vapid`. Nothing secret is in the repo.

## Cloudflare settings

- Pages project connected to this repo. Build command: none. Build output directory: `public`.
- Settings > Bindings: KV namespace with variable name `KURA_KV`.
- Access switched on for both the production address and preview addresses.
- Optional variables: `OWNER_EMAILS` (comma-separated, replaces the list in `_middleware.js`), `ACCESS_AUD` (pins the Access application).

## Local preview

    printf 'DEV_EMAIL=you@example.com\n' > .dev.vars
    npx wrangler pages dev public --kv KURA_KV
