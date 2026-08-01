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

Both are free and permanent. `criclife.pages.dev` is first-come, so claim it
before someone else does.

### 2a. Cloudflare Pages → `criclife.pages.dev`

1. Sign up at <https://dash.cloudflare.com> (free, no card).
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. Pick this repo (push it to GitHub first — see step 5).
4. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Node version: `22`
5. Project name: **`criclife`** ← this is what claims the subdomain.
6. Add environment variables (Settings → Environment variables), same keys as
   `.env.local` but with your real production values.

### 2b. is-a.dev → `criclife.is-a.dev`

Verified available on 2026-08-01.

1. Fork <https://github.com/is-a-dev/register>.
2. Add `domains/criclife.json`:

```json
{
  "owner": { "username": "your-github-username", "email": "rachitpublic@gmail.com" },
  "record": { "CNAME": "criclife.pages.dev" }
}
```

3. Open a PR. Usually merged within a day.
4. Once merged, add `criclife.is-a.dev` as a **custom domain** on the Pages
   project (Settings → Custom domains). Keep `criclife.pages.dev` working too —
   never replace it, or installed PWAs break.

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
   - Enable **Google** (needs a Google Cloud OAuth client)
   - **Disable Phone** — SMS costs money. See `docs/14-FREE-TIER-PLAN.md` § 4.3.

The `anon` key is safe in the browser. Row Level Security protects the data,
not key secrecy.

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

```bash
git init
git add .
git commit -m "Phase 0: foundations"
git branch -M main
git remote add origin https://github.com/<you>/criclife.git
git push -u origin main
```

Make the repo **public** — Actions minutes are unlimited on public repos
(private gets 2,000/month).

Then add repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | your anon key |

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
- **Cloudflare Web Analytics** → enable on the Pages project. Free, unlimited,
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

- [ ] `criclife.pages.dev` reserved and deploying
- [ ] `criclife.is-a.dev` PR opened
- [ ] Both Supabase projects created, phone auth disabled
- [ ] Resend wired as custom SMTP
- [ ] Keepalive workflow has run successfully at least once
- [ ] Repo is public, CI green
- [ ] App installs to a phone home screen from the deployed URL
- [ ] Dark/light toggle animates correctly, no flash on reload
- [ ] The no-scroll E2E test passes at all four viewports

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
