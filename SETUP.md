# Setup

Everything here runs on free tiers. You need a free Cloudflare account and Node.js 22.18 or newer.

## 1. Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # then edit the values (never commit .dev.vars)
npm run db:migrate:local              # creates the local D1 database
npm run dev:api                       # terminal 1: Worker + D1 on http://127.0.0.1:8787
npm run dev                           # terminal 2: Vite on http://localhost:5173 (proxies /api)
```

To try the production build (service worker, offline) locally: `npm run preview`, then open http://127.0.0.1:8787.

Generate a cookie secret for `.dev.vars` with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Before every commit or deploy:

```bash
npm run check    # typecheck, lint, format, tests, contrast, content validation, build
```

## 2. Cloudflare (one time)

Run these on your own computer (a browser is needed for the login), in this order:

```bash
npx wrangler login                       # opens the browser, pick your account
npx wrangler d1 create aka-nihongo       # prints a database_id
```

Paste the printed `database_id` into `wrangler.jsonc` (replace the zeros), then **commit and push it** (the id is not a secret). If it only lives in your local file, any `git pull`, branch switch or fresh clone brings the zeros back and the app "loses" its database. Tip: `npx wrangler d1 create aka-nihongo --binding DB` writes the id into the existing `DB` entry for you; if you answer the prompts by hand, use the binding name `DB` or Wrangler adds a second entry. Lost the id? `npx wrangler d1 list` shows it again (never create the database twice). Then create the tables and do the first deploy:

```bash
npm run db:migrate:remote                # creates the tables in the real D1 database
npm run deploy                           # full check, build, deploy Worker + static assets
```

Now set the secrets. Each `wrangler secret put` asks for the value interactively (so it never lands in your shell history) and deploys a new version right away, which is why the Worker has to exist first:

```bash
npx wrangler secret put APP_ACCESS_CODE  # the shared code you will type on each phone
npx wrangler secret put COOKIE_SECRET    # paste a fresh 64 hex char value (see above)
npx wrangler secret put GROQ_API_KEY     # optional until Phase 5 (console.groq.com, free)
npx wrangler secret put GEMINI_API_KEY   # optional until Phase 5 (aistudio.google.com, free)
```

Until both `APP_ACCESS_CODE` and `COOKIE_SECRET` are set, the access screen answers "Serwer nie odpowiada".

## 3. Install on the iPhone

Wrangler printed a URL like `https://aka-nihongo.<your-subdomain>.workers.dev`. Open it on the iPhone in Safari, enter the access code, then Share, "Do ekranu początkowego" (Add to Home Screen). Later updates are just `npm run deploy`; the app shows "Nowa wersja aplikacji" with an "Odśwież" button.

## 4. Changing the access code

`npx wrangler secret put APP_ACCESS_CODE` with a new value. This signs every device out (the cookie is bound to the code), so both phones type the new code once. Rotating `COOKIE_SECRET` does the same.

## 5. Good to know

- A daily cron (03:17 UTC) hard deletes profiles that were deleted more than 30 days ago. It is configured in `wrangler.jsonc` and needs nothing from you.
- Local data lives in each phone's IndexedDB and is synced to D1 in the background. Export a JSON backup from the profile sheet whenever you like.
- On the free plan, D1 and Workers limits are far above what two people use.
