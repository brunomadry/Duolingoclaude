# Setup

Everything here runs on free tiers. You need a free Cloudflare account and Node.js 22.18 or newer.

## 1. Local development

```bash
npm install
cp .dev.vars.example .dev.vars        # then edit the values (never commit .dev.vars)
npm run db:migrate:local              # creates the local D1 database (from Phase 1 on)
npm run dev:api                       # terminal 1: Worker + D1 on http://127.0.0.1:8787
npm run dev                           # terminal 2: Vite on http://localhost:5173 (proxies /api)
```

Generate a cookie secret for `.dev.vars` with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Before every commit or deploy:

```bash
npm run check    # typecheck, lint, format, tests, contrast, content validation, build
```

## 2. Cloudflare (one time)

Claude cannot log in for you. Run these yourself, in this order:

```bash
npx wrangler login                       # opens the browser, pick your account
npx wrangler d1 create aka-nihongo       # prints a database_id
```

Paste the printed `database_id` into `wrangler.jsonc` (replace the zeros), commit that change (the id is not a secret), then:

```bash
npm run db:migrate:remote                # creates the tables in the real D1 database
npx wrangler secret put APP_ACCESS_CODE  # the shared code you will type on each phone
npx wrangler secret put COOKIE_SECRET    # paste a fresh 64 hex char value (see above)
npx wrangler secret put GROQ_API_KEY     # optional until Phase 5 (console.groq.com, free)
npx wrangler secret put GEMINI_API_KEY   # optional until Phase 5 (aistudio.google.com, free)
```

## 3. Deploy

```bash
npm run deploy     # runs the full check, builds dist/ and deploys the Worker + static assets
```

Wrangler prints a URL like `https://aka-nihongo.<your-subdomain>.workers.dev`. Open it on the iPhone in Safari, enter the access code, then Share, "Do ekranu początkowego" (Add to Home Screen).

## 4. Changing the access code

`npx wrangler secret put APP_ACCESS_CODE` with a new value. Existing devices keep working until you also rotate `COOKIE_SECRET`, which signs everyone out.
