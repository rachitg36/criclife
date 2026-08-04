# CricLife — Phase 0 Setup

The code scaffold is written. This file covers the parts that need **your**
accounts and a browser, plus the commands to get it running.

> **Note:** I could not run `npm install` — the sandbox I work in has no access
> to the npm registry. Every source file is written and all internal imports
> resolve, but the first `npm install && npm run typecheck` on your machine is
> where dependency versions get proven. Expect to fix a version pin or two.

---

## 1. Get it running locally (5 minutes)

```bash
cd "D:\Claud\Cricket Normal"

npm install
cp .env.example .env.local     # fill in Supabase values from step 3
npm run dev                    # → http://localhost:5173
```

Before Supabase exists you can still boot the app by putting placeholder values
in `.env.local`:

```
VITE_SUPABASE_URL=https://placeholder.supabase.co
VITE_SUPABASE_ANON_KEY=placeholder-anon-key-long-enough-to-pass
VITE_APP_ENV=local
VITE_PUBLIC_URL=http://localhost:5173
```

### What you should see

- Home screen with the animated aurora, a count-up `0–0`, and quick links
- A working **Dark / Light / Auto** toggle with a circular wipe transition
- `/settings/appearance` — accent colour picker and Calm mode, both persisting
  across reloads with no flash of the wrong theme
- `/matches/:id/score` — the no-scroll scoring shell with the real layout budget
- `/live/anything` — public audience route, reachable without signing in

---

## 2. Reserve your free domains — **do this first**

> **Update, 2026-08-01:** Cloudflare retired the old "Pages" dashboard flow
> (git-integration onboarding with a Framework preset picker). Static sites
> now deploy as **Workers with Static Assets**, and the free subdomain is
> `<worker-name>.<account-name>.workers.dev` instead of `<project>.pages.dev`.
> **This step is done** — deployed via the Wrangler CLI to
> `criclife.geminirachit.workers.dev`. Steps below are kept for reference /
> redeploying from scratch.

### 2a. Cloudflare Workers (Static Assets) → `criclife.<account>.workers.dev`

1. Sign up at <https://dash.cloudflare.com> (free, no card).
2. Install Wrangler as a dev dependency (already done: `npm install -D wrangler`).
3. `wrangler.jsonc` in the repo root configures static asset serving from
   `dist/` with SPA fallback — no dashboard project-creation step needed.
4. `npx wrangler login` — opens a browser tab to authorize.
5. `npm run deploy` — runs `vite build` then `wrangler deploy`. Prints the
   live URL on success.
6. Environment variables for production Supabase values: since this repo has
   no CI/CD wiring yet, `.env.local`'s values get baked into the build at
   deploy time (Vite inlines `VITE_`-prefixed vars at build, not runtime).
   Once real Supabase credentials exist, update `.env.local` before running
   `npm run deploy` again, or wire a GitHub Actions workflow that injects them
   from repo secrets.

### 2b. is-a.dev → `criclife.is-a.dev`

**Done** — PR opened: [is-a-dev/register#45746](https://github.com/is-a-dev/register/pull/45746).
Usually merged within a day. `domains/criclife.json` in that PR:

```json
{
  "owner": { "username": "rachitg36", "email": "rachitpublic@gmail.com" },
  "records": { "CNAME": "criclife.geminirachit.workers.dev" }
}
```

Once merged, add `criclife.is-a.dev` as a **custom domain** on the Worker
(Workers & Pages → criclife → Settings → Domains & Routes). Keep
`criclife.geminirachit.workers.dev` working too — never replace it, or
installed PWAs break.

---

## 3. Supabase (2 free projects)

1. Sign up at <https://supabase.com>, create an organisation.
2. Create **`criclife-prod`**. Region: nearest your league (Mumbai / Singapore
   for India). Save the database password somewhere safe.
3. Create **`criclife-staging`**. That is both free projects used — local
   development runs in Docker via `supabase start`, not a third cloud project.
4. **Project Settings → API** → copy `Project URL` and `anon public` key into
   `.env.local`.
5. **Authentication → Providers**:
   - Enable **Email** (magic link)
   - Enable **Google** — see § 3b below, it needs a Google Cloud OAuth client
   - **Disable Phone** — SMS costs money. See `docs/14-FREE-TIER-PLAN.md` § 4.3.

The `anon` key is safe in the browser. Row Level Security protects the data,
not key secrecy.

### 3b. Google sign-in

The app side is done — `LoginPage`'s "Continue with Google" already calls
`signInWithOAuth({ provider: 'google', redirectTo })`, and the OAuth code comes
back through the same `/auth/callback` as a magic link. Nothing to build. What
is missing is an OAuth client, which needs a browser and your Google account.

**Free.** A Google Cloud project and OAuth credentials cost nothing; no billing
account is required for OAuth alone.

1. **console.cloud.google.com** → create a project (call it CricLife).
2. **APIs & Services → OAuth consent screen**. User type **External**. Fill in
   app name, your support email, your developer email. Scopes: the defaults
   (`email`, `profile`, `openid`) are enough — the app reads nothing else.
   Leave it in **Testing** and add your own address under _Test users_; you
   only need _Publish_ once people outside that list sign in, and publishing an
   app that asks for nothing beyond basic profile does not need verification.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   Application type **Web application**.
4. **Authorised redirect URI** — exactly one, and it is Supabase's, not the
   app's:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   `mkzgwwqkwcjcggxuavlr` for staging, `tljbwnbjwgdpmdhvttai` for prod. **Add
   one per project**, or one of the two environments will fail. This trips
   people up: the app's own `/auth/callback` does **not** go here. Google
   redirects to Supabase, Supabase redirects to the app.

5. Copy the **Client ID** and **Client secret** into Supabase →
   **Authentication → Providers → Google**, and enable it. The secret goes in
   the dashboard and nowhere else — never into this repo, `.env.local`, or a
   chat.
6. Check **Authentication → URL Configuration** has the app's own callback on
   its redirect allowlist (`http://localhost:5173/**`, and the deployed URL).
   Without it, GoTrue silently substitutes Site URL and the round trip lands
   somewhere unexpected — see HANDOFF.md § 2.

Then click **Continue with Google** on `/login`. A failure shows the reason on
the callback screen rather than a generic message, so read what it says.

### 3a. Push the schema — **the app does nothing until you do this**

Confirmed on a real phone on 2026-08-03: with an empty database the deployed
app redirects to `/login` and the magic link fails. That is not a bug — the
`profiles` table and its signup trigger don't exist yet, so there is nothing
for the callback to write to. Every other screen fails the same way.

Do **staging first**. This is the first time any of it touches hosted Postgres.

**Route 1 — the CLI (preferred).** Only this route records the migrations in
Supabase's own history table, so future pushes behave:

```bash
npx supabase login                        # opens a browser
npx supabase link --project-ref mkzgwwqkwcjcggxuavlr   # staging
npx supabase db push
# then, once staging looks right:
npx supabase link --project-ref tljbwnbjwgdpmdhvttai   # prod
npx supabase db push
```

**Route 2 — the Dashboard, if the CLI is a hassle.** Concatenate the
migrations and paste the result into **SQL Editor → Run**:

```bash
for f in supabase/migrations/*.sql; do echo; echo "-- $(basename "$f")"; cat "$f"; done > /tmp/criclife-schema.sql
```

Verified to apply to an empty database in one shot: 22 tables, 41 functions,
45 policies, 4 tables published for Realtime, zero errors. Two files must
**never** be included, and the loop above correctly excludes both:

- `supabase/tests/00_local_auth_stub.sql` — fakes the `auth` schema for a bare
  local Postgres. Real Supabase already has the real one; running the stub
  there would collide with it.
- `supabase/seed.sql` — local dev fixtures (4 teams, 44 shadow players, a
  Super Admin bound to a fake auth user). You do not want these in prod.

Route 2's catch: it leaves Supabase's migration-history table empty, so a
later `supabase db push` will try to replay everything and fail on the first
`create table`. Pick one route per project and stay on it.

**Then regenerate the DB types** the normal way, replacing the introspection
workaround described in HANDOFF.md § 5.1:

```bash
npx supabase gen types typescript --linked > src/types/database.ts
npm run typecheck
```

> **Why you and not the assistant.** A Claude Code session cannot do this
> step: outbound HTTPS to `supabase.co` is blocked by the sandbox network
> policy, and the database password and access token must never travel
> through a chat (see CLAUDE.md). If you want a future session to be able to
> run it, two things have to change — widen the environment's network policy
> to reach `supabase.co`, and add `SUPABASE_ACCESS_TOKEN` as an environment
> variable in the environment's settings rather than pasting it in a message.
> See <https://code.claude.com/docs/en/claude-code-on-the-web>.

---

## 4. Resend for magic-link email

Supabase's built-in email sender is rate-limited to a handful per hour and is
not meant for production.

1. Sign up at <https://resend.com> (free: 3,000/month, 100/day).
2. Verify a domain, or use their onboarding sender to start.
3. Create an API key.
4. In Supabase: **Project Settings → Authentication → SMTP Settings**:
   - Host `smtp.resend.com`, Port `465`
   - Username `resend`
   - Password: your Resend API key
   - Sender: `CricLife <noreply@yourdomain>`

---

## 5. GitHub — public repo + the keepalive cron

**Done** — repo is live and public at
<https://github.com/rachitg36/criclife>. Actions minutes are unlimited on
public repos (private gets 2,000/month).

Then add repository secrets (**Settings → Secrets and variables → Actions**):

| Secret              | Value                       |
| ------------------- | --------------------------- |
| `SUPABASE_URL`      | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon key               |

`.github/workflows/keepalive.yml` then pings the database every 3 days.

> **Do not skip this.** Free Supabase projects pause after 7 days idle, and
> waking one needs a manual dashboard click plus a 60-second cold start. For a
> league that plays every other weekend, it will fail exactly when someone
> opens the app to score a match.

Run it once manually to confirm: **Actions → Supabase keepalive → Run workflow**.

---

## 6. Fonts

Two variable fonts are referenced but not committed. Until you add them the app
falls back to the system font — everything works, it just looks less
distinctive.

```bash
npm i -D @fontsource-variable/inter geist
cp node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2 public/fonts/inter-variable.woff2
cp node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2 public/fonts/geist-variable.woff2
npm rm @fontsource-variable/inter geist
```

---

## 7. Optional: Sentry and analytics

- **Sentry** (free: 5,000 errors/month) → create a project, put the DSN in
  `VITE_SENTRY_DSN`. Wiring lands in Phase 9.
- **Cloudflare Web Analytics** → enable on the Worker. Free, unlimited,
  cookie-free, so no cookie banner on the audience view.

---

## 8. Verify Phase 0 is done

```bash
npm run typecheck     # strict TS, no errors
npm run lint          # zero warnings allowed
npm run test          # unit tests
npm run build         # production build
npm run test:e2e      # Playwright — includes the no-scroll gate
```

Phase 0 acceptance criteria from `docs/12-ROADMAP.md`:

- [x] `criclife.geminirachit.workers.dev` deployed and live
- [x] `criclife.is-a.dev` PR opened — [#45746](https://github.com/is-a-dev/register/pull/45746), pending merge
- [x] Both Supabase projects created, phone auth disabled
- [x] Resend wired as custom SMTP (both prod and staging)
- [x] Keepalive workflow has run successfully at least once
- [x] Repo is public, CI green (all four jobs)
- [ ] App installs to a phone home screen from the deployed URL — **not yet
      verified on a real device**
- [x] Dark/light toggle animates correctly, no flash on reload (verified locally + on the deployed URL)
- [x] The no-scroll E2E test passes at all four viewports

---

## What's in the scaffold

```
src/
├─ app/
│  ├─ router.tsx              all routes from docs/11, real and stubbed
│  ├─ providers/              Query client + ThemeProvider
│  ├─ layouts/                Root · App (tab bar) · Public · Scoring (no-scroll)
│  └─ guards/                 RequireAuth · RequireSuperAdmin · RequireScoringGrant
├─ components/ui/             Button · Card · Skeleton · CountUp · Aurora ·
│                             LivePill · ThemeToggle · Placeholder
├─ features/                  home · settings · scoring · audience · ranks ·
│                             admin · system
├─ lib/                       env · supabase · db (Dexie) · theme · haptics ·
│                             format · cn · sw
├─ stores/                    uiStore (persisted preferences)
├─ styles/                    tokens.css · globals.css · animations.css
└─ types/                     database.ts (regenerate after Phase 2 migrations)
```

### Deliberate choices worth knowing

- **`src/engine/` does not exist yet** — that is Phase 1, and it comes before
  any feature UI. ESLint already enforces its purity rules (no React, no I/O,
  no `Date.now()`, no `Math.random()`) so the constraint is live from the
  moment you create the folder.
- **The service worker never auto-reloads.** A scorer may be mid-over with an
  unsynced queue. `src/lib/sw.ts` exposes a prompt instead.
- **`ScoringLayout` has a dev-mode tripwire** that logs a console error the
  instant anything overflows, long before CI catches it.
- **Every delivery will be written to IndexedDB before the UI updates**, not
  after. `src/lib/db.ts` has the schema ready.

---

## Next: Phase 1 — the rules engine

Build `src/engine/` with no UI at all: `applyDelivery`, strike rotation,
dismissal legality, innings end conditions, replay. 100% branch coverage and
three real-match fixtures replaying to byte-identical scorecards.

It is the only part of this app where a mistake is expensive to undo, and it
needs no design decisions. Spec: `docs/04-RULES-ENGINE.md`.
