# Resumry AI — Cloudflare architecture

Lightweight, low-cost, serverless full-stack:

- **Cloudflare Pages** — hosts the static frontend (`/public`, including `index.html`).
- **Cloudflare Functions** — backend API under `/functions/api/*` (file-based routing → `/api/*`).
- **Cloudflare D1** — the **source of truth** for users, sessions, subscriptions, resumes, cover letters, and usage. (localStorage is only an offline cache.)
- **Lemon Squeezy webhooks** — billing/subscription events update D1.
- **Server-side AI proxy** — rate-limited + quota-enforced; the AI key never reaches the browser.
- **Server-side auth + sessions** — HttpOnly cookie, PBKDF2 passwords, optional Google sign-in.

```
schema/0001_init.sql          D1 schema
functions/
  _middleware.js              attaches the session user + security headers
  lib/                        auth, response, ratelimit, lemonsqueezy, (shared)
  api/auth/                   signup, login, logout, session, google
  api/ai/generate.js          rate-limited AI proxy
  api/billing/webhook.js      Lemon Squeezy webhook → D1
  api/resumes/                list/create + [id] get/put/delete
  api/covers/                 list/create
public/
  index.html                  the existing app (frontend)
  js/                         api, session, store (cache+sync), ai, billing
  _headers                    CSP + security headers
wrangler.toml, package.json, .dev.vars.example
```

## One-time setup

1. **Install + log in**
   ```bash
   npm install
   npx wrangler login
   ```
2. **Create the database** and paste the id into `wrangler.toml` (`database_id`):
   ```bash
   npx wrangler d1 create resumry
   ```
3. **Create the tables** (local + remote):
   ```bash
   npm run db:init:local
   npm run db:init
   ```
4. **Secrets** (production):
   ```bash
   npx wrangler pages secret put AI_API_KEY
   npx wrangler pages secret put LS_WEBHOOK_SECRET
   npx wrangler pages secret put LS_VARIANT_PRO_MONTHLY
   npx wrangler pages secret put LS_VARIANT_PRO_ANNUAL
   npx wrangler pages secret put LS_VARIANT_LIFETIME
   npx wrangler pages secret put LS_VARIANT_DOWNLOAD_PASS
   ```
   For local dev, copy `.dev.vars.example` → `.dev.vars` and fill it in.
5. **Run locally**
   ```bash
   npm run dev
   ```
6. **Deploy**
   ```bash
   npm run deploy
   ```
   (Or connect the repo in the Cloudflare dashboard for Git-based deploys + preview builds.)

## Lemon Squeezy

- Create products/variants (Pro monthly, Pro annual, Lifetime, Download Pass); note each **variant id** → set the `LS_VARIANT_*` secrets.
- Add a webhook → URL `https://YOUR-DOMAIN/api/billing/webhook`, set a signing secret → `LS_WEBHOOK_SECRET`. Subscribe to `subscription_*` and `order_created`.
- In checkout, pass `checkout[custom][user_id]` (handled by `public/js/billing.js`) so the webhook can match purchases to accounts.

## AI provider

Defaults to an OpenAI-compatible endpoint (`AI_API_URL`, `AI_MODEL`, `AI_API_KEY`).
To use Gemini or Anthropic, point those at the provider's endpoint/model and adjust the
request body in `functions/api/ai/generate.js`. Quotas live in `functions/lib/ratelimit.js`.

## Wiring the existing UI (next phase)

`index.html` still contains the current builder/templates/export UI. The new modules in
`public/js/` replace its data layer:
- `Resumry.session` → replaces localStorage-based auth.
- `Resumry.store` → replaces direct localStorage resume reads/writes (now cache + D1 sync).
- `Resumry.ai` → replaces any templated/“AI” calls with the server proxy.
- `Resumry.billing` → replaces simulated purchases with real Lemon Squeezy checkout; the
  plan/entitlement is read from `Resumry.session.user().plan` (server truth).

Migration is incremental: include the scripts, then swap call sites one module at a time.
Templates and export stay client-side and can be split into their own files later.

## Security notes

- Session cookie is HttpOnly/Secure/SameSite=Lax; sessions stored hashed in D1.
- Passwords hashed with PBKDF2-SHA256 (WebCrypto).
- Webhook signature verified (HMAC-SHA256) with idempotency.
- AI endpoint requires auth + rate limit + monthly quota; key is server-only.
- CSP and security headers in `public/_headers`.
- Always escape user-entered résumé content when rendering (XSS) in the UI layer.
