# Kura build record

Condensed copy of the "Kura Build Record" document (10 October 2026):
https://claude.ai/code/artifact/947061b6-467f-4f7f-9e31-f5732b8a8e85
Read this with README.md before building a similar product or adding a topic.

## Objective

Build expertise little by little in three industries, starting from little knowledge, as a source of business ideas:
Turkish wine (English), 日本の後継者問題 (Japanese), Japan in Britain (English).
Per topic per week: one 10-minute lesson on a syllabus taken from how the field is taught, a quiz, and the week's news,
all kept in one searchable place. Cheap to run. Reusable for future topics.

## Learning preferences

- One lesson per topic per week, readable in 10 minutes.
- Lessons spread across the week (Mon, Wed, Fri), early evening UK time.
- A notification per lesson; no need to check proactively. Not email.
- Interactive: a five-question quiz per lesson, plus mixed review of completed lessons.
- History in every topic, and a short history section in every lesson.
- Syllabus follows a recognised teaching framework and is expected to change over time.
- Japan topic in Japanese; others in English.
- Open data only where useful.

## Decisions, in order

1. Narrow to three named industries.
2. Trial one topic as a draft document (syllabus + week 1) before building anything.
3. Add history everywhere; draft the other two; Japan in Japanese.
4. First version inside Claude: a published page with its own database, plus three weekly scheduled tasks.
5. Move to a standalone site, because a home-screen shortcut to the Claude page only opened Claude.
6. Cloudflare Pages from a private GitHub repo behind a sign-in gate (GitHub Pages is public even for private repos).
7. Keep the Claude version as a backup that the weekly tasks write to first.
8. Site's own notifications via a scheduled checker; no secrets in the repo or in task prompts.

Principles: content is separate from the app (plain files, one bundled data file); nothing secret in the repo.

## Environment

| Service | Name | Role |
| --- | --- | --- |
| GitHub repo (private) | ynagak27/kurastudy | Site, content, notifier. Push to main triggers both Cloudflare projects |
| Cloudflare Pages | kurastudy | Site at kurastudy.pages.dev. No build command, output dir `public` |
| Cloudflare Zero Trust (Free), Access app | kurastudy main | Emailed-code sign-in on kurastudy.pages.dev, one allowed email. A second app (from "Restrict previews") covers previews |
| Cloudflare KV | kura, bound as KURA_KV | Progress, devices, notification keys, announced-lessons list |
| Cloudflare Worker | kurastudy-notifier | Built from `notifier/`, cron every 5 minutes, no public address |
| Claude scheduled tasks | Kura: … weekly lesson (x3) | Mon 17:47, Wed 17:52, Fri 17:49 Europe/London |
| Claude published page | Kura Study Library | Backup; still receives every lesson |

## Setup order that worked

1. Owner creates an empty private GitHub repo (Claude cannot create repos).
2. Claude builds, tests locally (`wrangler pages dev`), pushes.
3. Owner creates a Cloudflare **Pages** project from the repo. On the create screen use "Need to use the legacy Pages workflow? Continue to Pages".
4. Owner: Pages project > Settings > General > Preview access > "Restrict previews" (sets up Zero Trust; Free plan).
5. Owner: Zero Trust > Access > Applications > add a Self-hosted app for `<project>.pages.dev` (Subdomain empty), policy = owner's email. The preview app's `*` subdomain cannot be edited; do not try.
6. Claude (via the browser pane, after the owner signs in there): create KV namespace, bind as KURA_KV, redeploy.
7. Claude: create the notifier Worker from the same repo, path `/notifier`, preview builds off.
8. Owner on phone: sign in, add to home screen, open from the icon, "Turn on notifications", "Send a test".

## Working preferences

- Trial as a draft first; narrow with options before specifying.
- Click-by-click setup instructions with exact labels.
- Claude does dashboard clicks where it can; owner only signs in. Screenshots when stuck.
- Free tiers first; small cost acceptable. Private by default. One tap to open, notifications to bring him back.

## Open items (as of 10 Oct 2026)

- Confirm the first full weekly run (wine lesson 2, Mon 12 Oct) end to end.
- Turn off duplicate Claude app notifications once Kura's are reliable.
- Sign-in length to one month if codes are requested too often.
- "Ask Claude" on the standalone site (needs a paid API key and a relay).
- Time zones (fixed to UK time for now).
