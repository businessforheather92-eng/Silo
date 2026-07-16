# Silo — launch runbook

Everything in the codebase is ready. What's left is three accounts only you can
create, then ~5 commands. Total cost to launch: ~$5 of Anthropic API credit.
Hosting and payments are free until you make sales.

**Deploy target is Netlify** (`netlify/functions/`, `netlify.toml`) — this
superseded the earlier Cloudflare Pages plan. The old `functions/api/*.js`
Cloudflare Pages Functions are still on disk (harmless, unused) in case you
ever want to run both, but Netlify is the one this runbook deploys to.

## 1. Anthropic API key (~5 min, ~$5)

1. https://console.anthropic.com → sign up → **Billing** → add $5 credit.
2. **API Keys** → Create key → copy it (starts `sk-ant-`). You'll paste it into
   Netlify in step 3 — don't put it in any file in this repo.

Cost reality: the proxy forces Haiku and caps replies at 1024 tokens, so a
typical AI message costs a fraction of a cent. A heavy paying user ≈ $1/mo.

## 2. Lemon Squeezy store + products (~30 min)

1. https://lemonsqueezy.com → create account → create a store
   (they're the merchant of record — they handle sales tax/VAT for you).
2. **Products → New product** — create TWO:
   - "Silo Lifetime", one-time payment, **$24.99**
   - "Silo Monthly", subscription, **$7.99/mo**, with a **14-day free trial**
     turned on (in the product's checkout/subscription settings — "Free
     trial" → 14 days; requires a card upfront, first charge happens on
     day 15). No trial on the Lifetime product.
   (No license keys needed either way — buyers create an account in the app,
   and the server verifies their purchase by the email they paid with. The
   server already treats a trialing subscription as fully entitled — LS
   reports it as status `on_trial`, which `netlify/functions/auth.js` and
   `netlify/functions/ls-webhook.js` both already check for — so no code
   changes are needed here, only this store setting.)
3. Copy these:
   - the **checkout link** for each product (Share → looks like
     `https://YOURSTORE.lemonsqueezy.com/buy/<uuid>`)
   - your **Store ID** (Settings → General — a number)
   - an **API key** (Settings → API → create) — the server uses it to check
     "does this email have a paid order or active subscription?" at signup.
4. Paste the two checkout links in the places marked `TODO` (four spots total):
   - `adhd-os.jsx` → `BUY_URL` (lifetime) and `BUY_URL_SUB` (monthly) near the top
   - `index.html` → the "Get Lifetime" and "Subscribe" buttons in the pricing section
5. **Settings → Webhooks → add webhook**, URL
   `https://YOUR-SITE.netlify.app/api/ls-webhook`, subscribe to at least:
   `order_created`, `subscription_created`, `subscription_updated`,
   `subscription_payment_success`, `subscription_expired`. Copy the **signing
   secret** it gives you — that's `LS_WEBHOOK_SECRET` in step 3 below. This is
   what turns off AI access promptly if someone's subscription actually ends
   (a Lifetime purchase never needs this — it's permanent from the start).
6. Store gets reviewed by Lemon Squeezy before it can take live payments —
   submit for review early, it can take a day or two.

## 3. Netlify (~15 min, free)

See the step-by-step GitHub + Netlify walkthrough at the end of this file for
the exact clicks. Summary:

1. Push this repo to GitHub, then https://app.netlify.com → **Add new site →
   Import an existing project** → pick the repo. Netlify reads `netlify.toml`
   automatically (build command, publish dir, functions dir all preconfigured
   — nothing to fill in).
2. **Site configuration → Environment variables** — add:
   | name | value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` key |
   | `SESSION_SECRET` | a long random string — run `openssl rand -hex 32` and paste the output. Signs login sessions; never share or change it casually (changing it signs everyone out). |
   | `LEMONSQUEEZY_API_KEY` | the LS API key from step 2 |
   | `LS_STORE_ID` | your Lemon Squeezy store id |
   | `LS_LIFETIME_PRODUCT_ID` | the numeric product id of "Silo Lifetime" (Products page → open it → id is in the URL, or `GET /v1/products?filter[store_id]=...`). **Required** — without it, `hasPaidOrder()` can't tell a real Lifetime purchase apart from a Monthly subscription's $0 trial order (Lemon Squeezy creates an "order" record for both), which misclassifies every Monthly subscriber as `plan:"lifetime"` and permanently breaks revocation. |
   | `LIFETIME_CAP` | optional; how many Lifetime purchases are honored, first-come-first-served by purchase time, store-wide (default 100). "Lifetime, limited to the first 100 buyers." Anyone past the cap is automatically refunded (see below) and never granted lifetime access — enforced live against the LS API, not a counter that can drift. **Currently set to 101, not 100** — bumped by 1 to absorb the one test-mode Lifetime purchase already on the store, so the first 100 *real* buyers still get exactly 100 slots. If you do more test purchases before going fully live, bump this again by however many test Lifetime orders exist (`GET /v1/orders` filtered to the Lifetime product, or check `/api/lifetime-status`'s `sold` count) — then trigger a redeploy, since functions only pick up a changed env var on their next build. |
   | `LS_WEBHOOK_SECRET` | the signing secret from the webhook you created in step 2.5 |
   | `BLOBS_SITE_ID` | your Netlify site id (Site configuration → General → Site details). **Required** — `getStore()`'s automatic siteID/token detection doesn't reliably reach these Lambda-style function handlers in production; without this the functions 502 with `MissingBlobsEnvironmentError`. |
   | `BLOBS_TOKEN` | a Netlify personal access token (User settings → Applications → New access token). Paired with `BLOBS_SITE_ID` above as the manual Blobs config fallback. Note: a personal access token is account-wide, broader than this alone needs — fine to start, worth tightening later. |
   | `AUTH_REQUIRED` | leave unset (accounts required). Set `false` for a free-AI launch week. |
   | `AI_DAILY_CAP` | optional; AI messages per account per day (default 400) |
3. **Netlify Blobs stores user accounts/entitlement/rate-limit state** — no
   separate database or namespace to create, just the two env vars above.
4. Trigger a deploy (pushing to the connected branch auto-deploys; or **Deploys
   → Trigger deploy** in the dashboard).

Optional custom domain (~$12/yr): buy anywhere, then Netlify site →
**Domain management → Add a domain**. Nothing in the code needs to change.

## 4. Test the money path (15 min, do not skip)

1. In Lemon Squeezy turn on **Test mode**, buy the **Lifetime** product with
   the test card `4242 4242 4242 4242` and a real email you control.
2. On the live site: ✦ Pro → **Create account** with that same email + a
   password. It should unlock. Try an AI feature (Tasks → chunk something).
3. Signed out / no account: an AI feature must show the "part of Silo Pro"
   message and pop the ✦ Pro menu.
4. Try creating an account with an email that HASN'T bought — it must be
   refused.
5. Repeat with the **Monthly** product and a second test email — checkout
   should show the 14-day trial (no charge yet in test mode either), and
   signing in with that email should unlock Pro immediately, same as a paid
   order (LS reports the subscription as `on_trial`, which the server already
   treats as entitled).
6. Cancel that same test subscription in Lemon Squeezy, wait for it to hit
   "expired" (or trigger it manually from the LS test-mode dashboard), and
   confirm an AI feature now shows the Pro paywall again for that account —
   this proves `ls-webhook.js` is actually revoking access, not just granting it.
7. If all of that behaves, turn off test mode.
   (Note: test-mode orders may not appear once test mode is off — that test
   account simply stops validating; your real purchase flow is unaffected.)

## 5. Launch (ongoing — this is 90% of the outcome)

Where ADHD people actually are: r/ADHD (read the self-promo rules, contribute
first), r/adhdwomen, TikTok/short demos of single tools (the hyperfocus circuit
breaker and thought-recovery demo well), Hacker News Show HN, Product Hunt.
Lead with one tool and one feeling ("it catches the thought you just lost"),
not a feature list.

## How the pieces fit (reference)

- `index.html` — landing page (root). `app/index.html` — the app at `/app/`.
- `netlify/functions/auth.js` — signup/login. Signup works for emails with
  either a paid Lifetime order (only the first `LIFETIME_CAP`, store-wide, by
  purchase time) or an active Monthly subscription (both checked live via the
  LS API — never cached as a shortcut, since a subscription's $0 trial order
  is also a "paid" order and would otherwise get misclassified as Lifetime).
  Passwords are PBKDF2-hashed in Netlify Blobs; sessions are signed tokens
  (~6 months) — but see `entitled:<email>` below for why the token alone
  isn't the final word on access.
- `netlify/functions/ls-webhook.js` — keeps the `entitled:<email>` Blobs flag
  current as subscriptions renew or actually expire. Lifetime accounts (within
  the cap) set it once and it's never cleared; Monthly accounts depend on this
  webhook firing correctly — that's exactly what step 4.5 above is testing.
  Also auto-refunds any Lifetime order that lands past the cap (stale landing
  page, direct checkout link, race condition) rather than silently keeping
  money for a deal that's no longer being sold.
- `netlify/functions/lifetime-status.js` — public, unauthenticated `GET`.
  Reports `{ limit, sold, remaining, soldOut }` live against the LS API (not
  a persisted counter — can't drift from reality). The landing page's inline
  script uses it to show "N of 100 left" and swap the Lifetime tile to a
  "sold out → see Monthly" state once it's gone.
- `netlify/functions/claude.js` — AI proxy: holds the API key, requires a
  valid session AND a live `entitled:<email>="1"` flag (not just a valid
  token — otherwise a cancelled Monthly subscriber would keep AI access for
  the rest of their ~6-month token), enforces the per-account daily cap,
  forces `claude-haiku-4-5` + 1024-token cap.
- `netlify.toml` redirects `/api/*` to the deployed functions — the frontend
  always just calls `/api/claude` and `/api/auth`, so it works unchanged
  locally (Vite dev stub) and in production (Netlify Function).
- The session lives in the buyer's browser (`c_account` in localStorage).
  Accounts only gate AI — app data never leaves the user's browser.
- Free tier = the whole app minus AI. AI calls without a session get HTTP 402
  and the app opens the ✦ Pro menu.
- Password resets: none built yet — handle by email support for now (delete
  the `user:<email>` blob and have them sign up again; their purchase
  re-validates automatically).
- Local dev: `npx vite` — `/api/*` are stubbed (any email + 8-char password
  signs in, AI is canned demo mode unless `ANTHROPIC_API_KEY` is in `.env`).
  To exercise the real Netlify Functions locally instead of the Vite stubs,
  use `npx netlify dev` (needs `netlify link` to the site first).
- After changing code: `npm run build && node mount_test.mjs dist/assets/app-*.js`,
  then push to the connected GitHub branch (auto-deploys) or run
  `npm run deploy:netlify`. Bump `CACHE` in `public/sw.js` on each deploy so
  installed PWAs pick up the new version.
