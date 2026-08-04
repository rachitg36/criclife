# CricLife — Handoff

**Date:** 2026-08-03
**State:** **Phases 0–8 complete, Phase 9 partly done**, pushed to
`claude/continue-session-uhh3e8`.

Read this file, then `CLAUDE.md`. Skip straight to **§ 2** for what to do next.

> **Standing instruction:** update this file at the end of every phase —
> what got built, what got deferred, what's next — so a fresh session (new
> chat, new device, new cloud environment) can pick up cold. Don't wait to
> be asked again.

---

## 1. What this project is

A mobile-first PWA for scoring cricket matches. One person scores from a phone
on a screen that never scrolls; anyone can watch live on a public link; every
match is archived into player stats and rankings. Runs entirely on free tiers.

Decisions already locked in are logged in `docs/13-OPEN-QUESTIONS.md` § A and § E.

---

## 2. Continue here — exact next step

### ✅ A full match has been scored — 2026-08-04

On a phone, on the deployed build, against `criclife-staging`. Both innings,
a result computed, `complete_match` called. That is `record_delivery`, the
offline queue, the engine, the RPCs and the sync worker all proven end to end
for the first time — § 8.6's "none of Phases 1–6 have run against a real
Supabase project" is finally out of date.

**Two faults it exposed, both now fixed:** the winner was announced as a raw
team UUID (the engine is pure and knows only ids, so its own `result.text`
cannot name anybody — `features/scoring/resultText.ts` rebuilds the sentence),
and the live-match bar silently picked the first of several live matches, so
finishing one match and tapping the bar opened an _older_ one that was still
open. It now goes to the list when more than one is live.

**Still unproven:** Realtime. `/live/:publicSlug` has never been opened
alongside a live scorer, so § 8.11 stands.

---

### ▶ Start here tomorrow — 2026-08-04

The pad works. Nobody has scored a ball yet. **That is the next action**, and
it is the one thing that would prove more than everything else on this list.

1. `git pull` — the branch moved a lot tonight.
2. Open the match on `localhost:5173`, pick openers and a bowler, and score:
   a single (strike should swap), a four, a six, a **wide with 0 extra runs**
   (the score must go up by exactly 1 and the over must not advance), and a
   wicket. That exercises `record_delivery` from a client for the first time
   and is the only real check on § 8.14's two fixes.
3. Then open `/live/:publicSlug` in a second tab while still scoring. Realtime
   has never carried a message in this project's life (§ 8.11).

**The deployed site is current as of 2026-08-04** — version `447cf456`, built
with the staging project's credentials passed inline (`VITE_SUPABASE_URL=… npx
vite build`), which overrides the `.env` files and needs no
`.env.production.local`. Verified by grepping the bundle for the project ref
before uploading. Wrangler's own output is the only confirmation available
from this sandbox: the agent proxy returns 403 for the deployed URL, so
**nobody has loaded it in a browser**.

**Two things gate it working on a phone:**

1. Staging's redirect allowlist must contain
   `https://criclife.geminirachit.workers.dev/**`, or sign-in lands on
   whatever Site URL says — see the URL Configuration table below. This is the
   only reason the deployed site's sign-in has ever failed.
2. Migration 16 has not run on staging, so **Abandon match** will report that
   the function does not exist, and Google sign-ins will not bring a picture.
   Everything else on the deployed build works without it.

**⚠ A 16th migration is waiting.** `20260804120000_oauth_profile_and_abandon.sql`
is committed but has run nowhere but the local scratch database. Paste it into
**both** Supabase projects' SQL Editor before using Google sign-in or the
Abandon button — until then `abandon_match` does not exist and the button will
report so. Function count goes 56 → 58.

**Known, not yet done:**

- The deployed Worker is still the Phase 7 build pointing at `criclife-prod`,
  whose URL Configuration has never been set — which is why signing in to the
  live site lands on `localhost:3000`. Fix is in § 2's env block: set
  staging's Site URL and Redirect URLs, then redeploy pointed at staging.
  Inline env vars override the `.env` files (`VITE_SUPABASE_URL=… npx vite
build`), verified, so `.env.production.local` is not strictly needed.
- The owner's match is 3-a-side over 20 overs with `maxOversPerBowler` on
  auto = 4. Three bowlers × 4 overs = **12 overs maximum**, so over 13 cannot
  be bowled. That is the engine being right, not a bug, but a full innings
  needs a shorter match or an explicit bowler limit.
- Home is still the **Phase 0 placeholder** ("Phase 0 · Foundations", 0–0).
  docs/11 § 2 specifies a live-now carousel and a "Score this match" CTA.
  `/matches` now covers getting back to a match, but Home does not.

---

### ✅ The pad renders against a real project — 2026-08-04

The scorer pad is up on `localhost:5173` against `criclife-staging`, with a
real match, real squads and a started innings: score block, batters, bowler,
over strip, run pad, modifiers, actions. **No ball has been recorded yet** —
that is the next thing, and it is the moment `record_delivery` is finally
called by a client rather than by pgTAP.

Getting here took seven fixes in one sitting, and only the last was the real
cause. Worth reading § 6.4's last seven rows together, because they are one
story: every layer knew something the layer above it did not say. The root
cause was `replay()` returning `innings: []` for a match with no deliveries —
so a brand-new match could never be scored, and every blank screen traced
back to it.

---

### ✅ Sign-in works — 2026-08-03. What that unlocks, and what it does not

**Somebody has signed in.** Magic link → callback → onboarding → into the app,
against `criclife-staging`, from the owner's laptop. That is the first time
in the project's life that a real JWT has existed, which means the first time
RLS has been evaluated for real rather than in pgTAP.

**Where things stand**

|                                         |                                                        |
| --------------------------------------- | ------------------------------------------------------ |
| Sign-in                                 | **working** on staging, end to end                     |
| `criclife-staging` schema               | all 15 migrations, 56 functions — § 4                  |
| `criclife-prod` schema                  | applied 2026-08-03 from the 15-file version — § 4      |
| Deployed Worker                         | **2026-08-04, version `447cf456`, pointed at staging** |
| Add-to-Home-Screen                      | verified on a real phone                               |
| Local dev on the owner's Windows laptop | running, on this branch, `.env.local` → staging        |

**What it took, for the record** — three separate faults, each of which the
app reported as the same wrong thing:

1. **`POST /auth/v1/otp` returned 500** and nothing reached Resend. Custom
   SMTP on staging. Turned _off_; Supabase's built-in sender took over and the
   mail arrived. Resend still needs fixing before anyone outside the Supabase
   org can sign in — see § 6.3.
2. **The first link pointed at prod**, whose `redirect_to` was still
   `http://localhost:3000`. Wrong project _and_ wrong redirect.
3. **The callback screen lied about all of it.** It showed "links expire after
   a while" for every failure, because it read neither the `error_code` in the
   callback URL nor the exchange error supabase-js throws internally. Both are
   read now — `src/features/auth/callbackError.ts`. Worth remembering as a
   pattern: the app hid the real cause three times in one session, and each
   time the fix was to stop guessing and surface what the layer below already
   knew.

**Now unblocked, and the next thing worth doing:** an actual match. Nobody has
called a scoring RPC against real hosted Postgres. See § 8.6 and § 8.11 — that
pair of unproven claims is what a single real match would knock down. Both
projects carry the full schema now, so there is nothing left in the way.

**Open question nobody has answered yet — worth resolving before more building.**

The owner's Windows checkout (`D:\Claud\Cricket Normal`) turned out to contain
a **parallel, independent build of this same project**, which was parked on a
local branch `local-work-backup` (commit `43a84fe`) to unblock the branch
switch. It is local to that machine and has never been pushed. It contains:

- a complete, _different_ set of Phase 2 migrations on their own timestamp
  series (`20260802000100_…` … `20260802000700_rls.sql`) — this branch's are
  `20260802120000_…` onward, 15 files covering Phases 2–8;
- a different pgTAP layout (`supabase/tests/database/01_rls_personas.test.sql`);
- a different auth approach (`src/lib/env.schema.ts`, `src/lib/session.ts`);
- edits to `src/app/router.tsx` and `tests/e2e/smoke.spec.ts` — the same two
  files Phase 7 changed.

Two schemas for one project, and **the one already applied to staging is this
branch's**. The practical risk is low (the other work is Phase-2-scoped and
this branch supersedes it) but it should be an explicit decision, not a thing
that quietly rots: `git diff main local-work-backup --stat` on that machine,
then either delete the branch or say what needs salvaging.

**Two real bugs this session, both found only by running the thing**

Neither was reachable from any test, and both were in code that had been
"green" for a phase:

1. The login screen rendered a literal red `{}` as the entire explanation for
   a failed sign-in — some GoTrue failures carry a body with no usable text,
   and `error.message` went straight to the screen.
2. Before that, it showed the browser's raw `Failed to fetch` on a network
   error, which tells a scorer at a ground with two bars of signal nothing.

Both fixed in `src/features/auth/authErrors.ts`, regression-guarded. Worth
noting _how_ the first fix went wrong on the first attempt: it also treated a
missing HTTP status as a network failure, which swallowed genuine server
messages — the pre-existing `LoginPage` test caught it immediately.

---

### Next: finish Phase 9

Phase 8 is done. Phase 9 is roughly half done — see `docs/12-ROADMAP.md`,
where every bullet is now marked `[x]`, `[~]` (partial, with what is missing)
or `[ ]`. What is left, in the order I would take it:

1. **Web push notifications.** Needs VAPID keys and a push service. The
   `notifications` table is written to; nothing reads it.
2. **The a11y pass proper.** A skip link, `<main>` landmarks, tablist roles and
   screen-reader text for icon-only controls are in. An axe run, a
   screen-reader pass and a keyboard-scoring audit are not, and need a browser
   harness this sandbox does not have.
3. **Visual regression suite**, **onboarding tour**, **the rest of `/admin`**
   (player merge, teams, grants, rules profiles).
4. **The club beta**, which is the actual "Done when".

Or: `/phase`.

Before writing code: **re-verify the foundation is still green.** A fresh
container has neither `node_modules`, nor `.env.local`, nor a running Postgres,
nor pgTAP (see § 3 and § 5.1). Full cold-start sequence:

```bash
npm install
cp .env.example .env.local   # then fill it in — values are in § 4
sudo service postgresql start
sudo apt-get install -y postgresql-16-pgtap    # gone after every container restart
bash supabase/tests/run-local.sh --seed --pgtap   # expect 237/237 "ok", 0 "not ok"
npm run typecheck && npm run lint && npm run test  # expect 331/331
npm run build && npm run size                      # expect 174.69 kB / 180 kB
```

### The one thing to know before touching the audience view

`src/features/audience/store.ts` deliberately does **not** import
`@/lib/supabase` at the top of the file. It reads the initial snapshot over
plain `fetch` (`src/lib/publicApi.ts`) and only `await import()`s the real
Supabase client afterwards, for the Realtime socket. That is not stylistic:
`@supabase/supabase-js` is 216 kB raw / ~57 kB gzipped, and a static import
there puts all of it on the critical path of the one route with a hard
performance budget. A single innocent-looking `import { supabase }` at the top
of any eagerly-loaded audience module undoes it, and `npm run size` is what
will tell you.

### What Phase 7 actually changed, beyond the screen

Two of the three most consequential things this phase did are not in
`src/features/audience/` at all:

1. **`postgres_changes` had never worked.** Phases 5 and 6 subscribe to
   `scoring_grants` for live grant revocation, and both looked healthy — the
   channel connects, the client reports `SUBSCRIBED`. But nothing had ever
   added a table to the `supabase_realtime` publication, and Supabase's
   Realtime server only replays changes for tables in it. Every one of those
   subscriptions was silently inert. `20260803180000_audience_realtime.sql`
   fixes it for `deliveries`, `innings`, `matches` and `scoring_grants`. **This
   means Phase 5's live-revocation behaviour has still never been seen to
   work** — it was untestable before and is merely un-_tested_ now.
2. **Zod was costing more than it was worth.** `src/lib/env.ts` imported it to
   validate five environment variables, and was the _only_ importer in the
   app — so ~260 kB of Zod rode the eager main chunk on every route including
   `/live/:publicSlug`. Replacing it with hand-rolled checks (identical
   messages, identical exported shape, now covered by `tests/lib/env.test.ts`)
   is what paid for the entire audience view inside the 180 kB budget, and it
   roughly halved size-limit's modelled Snapdragon-410 execution time.

The third is the ordinary one: the audience view itself.

---

## 3. If starting from a fresh clone (e.g. a new cloud environment)

```bash
git clone https://github.com/rachitg36/criclife.git
cd criclife
git checkout claude/continue-session-uhh3e8   # this branch, not main
npm install
```

`.env.local` is gitignored and won't exist in a fresh clone. Recreate it:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with the real values (safe to write directly — these
are publishable/anon-tier keys, meant to be exposed in the browser):

```
VITE_SUPABASE_URL=https://tljbwnbjwgdpmdhvttai.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_oyHY2XoW3H2sk3ckL8JyQA_FLYJD6OM
VITE_APP_ENV=local
VITE_PUBLIC_URL=http://localhost:5173
```

Then verify everything is still green:

```bash
npm run typecheck && npm run lint && npm run test && npm run build && npm run size
```

Local Postgres + pgTAP (see § 5.1 for why this exists instead of `supabase start`):

```bash
sudo service postgresql start
bash supabase/tests/run-local.sh --seed --pgtap   # expect 237/237 "ok", 0 "not ok"
```

(`npm run test:e2e` needs Playwright browsers, and this sandbox only has a
Chromium build whose revision doesn't match the pinned `@playwright/test`
version, and no WebKit at all — see § 5.1's e2e note before assuming
`npx playwright install --with-deps` will get you a working local run.)

To redeploy after any change: `npm run deploy` (builds, then `wrangler
deploy`). In this cloud environment `CLOUDFLARE_API_TOKEN` is already set, so
wrangler authenticates with no browser step; on a personal machine without it,
run `npx wrangler login` first. **Deploys are still manual** — no CD wiring yet
(see § 7).

**Create `.env.production.local` before deploying** — it is gitignored, so a
fresh container will not have one, and without it a production build silently
inherits `.env.local` (Vite ranks `.env.local` _above_ `.env.production`).
That would bake `VITE_PUBLIC_URL=http://localhost:5173` into the bundle and
every share link Phase 7 generates would point at localhost:

**Decision, 2026-08-03: the deployed build points at _staging_, not prod.**
Staging is where the only real team, match and deliveries live, and pointing
the live site at an empty prod project would mean proving the app twice. So
"production" currently means "the deployed build", not "the prod project" —
a deliberate, temporary blur that has to be undone before anyone outside the
owner signs in. Prod's own URL Configuration is still unset, which is a second
reason not to point at it yet.

```
VITE_SUPABASE_URL=https://mkzgwwqkwcjcggxuavlr.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_AOlNgi5MClWG1zHMbtofaA_v-Zb0XsE
VITE_APP_ENV=production
VITE_PUBLIC_URL=https://criclife.geminirachit.workers.dev
```

**This only works if staging's redirect allowlist knows the deployed URL.**
Supabase → `criclife-staging` → Authentication → URL Configuration must list
`https://criclife.geminirachit.workers.dev/**` alongside the localhost entry.

**How this fails is worth knowing, because it does not look like a failure.**
An earlier version of this file said a `redirect_to` that is not on the
allowlist "is rejected with a 400 and a named error". That is wrong, and it
sent one debugging session down the wrong path. GoTrue **silently substitutes
the project's Site URL** instead. So the mail sends, the link works, the token
is valid — and the browser lands on whatever Site URL says, with the `?code=`
still attached but the `/auth/callback` path gone.

A brand-new Supabase project ships with Site URL `http://localhost:3000`, a
port nothing in this repo has ever used. Landing on `localhost:3000/?code=…`
with `ERR_CONNECTION_REFUSED` is therefore the signature of _"the redirect was
not allowlisted on the project this build points at"_ — not of a broken link,
a dead dev server, or a wrong port. It happened on prod on 2026-08-03, whose
URL Configuration had never been touched.

Set both fields on both projects, so the fallback is harmless if it ever
happens again:

| Field         | Value                                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Site URL      | `https://criclife.geminirachit.workers.dev`                                   |
| Redirect URLs | `https://criclife.geminirachit.workers.dev/**` and `http://localhost:5173/**` |

To move to prod later, swap the two Supabase lines back to
`https://tljbwnbjwgdpmdhvttai.supabase.co` /
`sb_publishable_oyHY2XoW3H2sk3ckL8JyQA_FLYJD6OM`, and set prod's Site URL and
Redirect URLs to the deployed domain first.

After deploying, confirm the right version is live with
`npx wrangler deployments list`. Fetching the deployed URL over HTTP does not
work from this sandbox (the agent proxy returns 403 for it), so wrangler's own
output is the only verification available here — nobody has _loaded_ the
deployed Phase 7 build in a browser.

---

## 4. Live infrastructure reference

| Thing                                                                     | Value                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployed app (**Phase 7 build**, deployed 2026-08-03, version `fd6a1bd0`) | `https://criclife.geminirachit.workers.dev`                                                                                                                                                                 |
| GitHub repo                                                               | `https://github.com/rachitg36/criclife` (public)                                                                                                                                                            |
| Working branch                                                            | `claude/continue-session-uhh3e8` — all of Phases 1–7 are here, not on `main`                                                                                                                                |
| is-a.dev PR                                                               | [is-a-dev/register#45746](https://github.com/is-a-dev/register/pull/45746) — still pending merge                                                                                                            |
| Supabase `criclife-prod`                                                  | Project ID `tljbwnbjwgdpmdhvttai`, region `eu-central-1`. **No migrations pushed to it yet** — everything so far has run against a local Postgres, not this cloud project.                                  |
| Supabase `criclife-prod` publishable key                                  | `sb_publishable_oyHY2XoW3H2sk3ckL8JyQA_FLYJD6OM`                                                                                                                                                            |
| Supabase `criclife-staging`                                               | Project ID `mkzgwwqkwcjcggxuavlr`                                                                                                                                                                           |
| Supabase `criclife-staging` publishable key                               | `sb_publishable_AOlNgi5MClWG1zHMbtofaA_v-Zb0XsE`                                                                                                                                                            |
| Phone auth                                                                | Disabled on both Supabase projects (confirmed, Phase 0)                                                                                                                                                     |
| Google OAuth                                                              | Code-complete (`signInWithOAuth({provider:'google'})` wired in `LoginPage`) but **unverified end-to-end** — no Google Cloud OAuth client exists yet, and this sandbox has no route to real Supabase anyway. |

These are publishable/anon-tier credentials, safe to keep in plain text here
and in `.env.local`. **Never** put a Supabase personal access token, service
role key, or Resend API key in this file or in chat — those go directly into
the relevant dashboard, never through an assistant.

### Both projects have a schema as of 2026-08-03 — but not the _same_ schema

`criclife-staging` was done first, from the 13 migrations that existed at the
end of Phase 7, via the Dashboard SQL Editor (route 2 below), and verified
with a checklist query. Every count matched a clean local apply exactly:

| check                          | got / expect |
| ------------------------------ | ------------ |
| tables                         | 22           |
| functions                      | 41           |
| RLS policies                   | 45           |
| tables with RLS disabled       | 0            |
| realtime-published tables      | 4            |
| signup trigger on `auth.users` | 1            |
| `deliveries` replica identity  | `f` (FULL)   |
| seed data leaked in            | 0            |

`criclife-prod` was done later the same day, the same way, from the
**15**-migration file. Staging was then brought level by applying the two
Phase 8 files (`20260803190000_stats_and_rankings.sql` and
`20260803191000_fix_json_null_wicket.sql`) on their own, and both projects
now report **56 functions**. They are the same schema.

That second file matters more than a version number suggests: without it
`record_delivery` flags every ball a wicket and drops a run off every wide
(§ 8.14). For the roughly two hours staging was behind prod, anything scored
against it would have been wrong in exactly those two ways — worth knowing if
any test data from today looks strange.

**This is the table to check either project against now:**

| check                            | expect for all 15 migrations |
| -------------------------------- | ---------------------------- |
| tables                           | 22                           |
| functions                        | **56** (was 41)              |
| RLS policies                     | 45                           |
| tables with RLS disabled         | 0                            |
| realtime-published tables        | 4                            |
| signup trigger on `auth.users`   | 1                            |
| `matches_finalize_stats` trigger | 1                            |
| `deliveries` replica identity    | `f` (FULL)                   |
| seed data leaked in              | 0                            |

Those numbers are from a clean local apply of all 15 files on 2026-08-03, so
a project that reports 41 functions has the Phase 7 schema, not this one.

Two of those were genuinely uncertain before and are now settled. **The
publication branch that only runs on real Supabase works**: a real project
ships `supabase_realtime` already created, so the migration takes its
"exists, just add the tables" path — which a bare local Postgres can never
exercise, because there the migration creates the publication itself. And
the `on_auth_user_created` trigger on `auth.users` was created successfully,
which the SQL Editor's role is privileged enough to do.

**What this still does not prove.** The schema is structurally right, and as
of 2026-08-03 sign-up and sign-in have run through it for real — so the
`auth.users` trigger, the `profiles` insert policy and the onboarding write
have all been exercised against a real JWT. Everything past that has not. No
scoring RPC has been called on either project, and no Realtime message has
travelled from Postgres to a browser. Structure and behaviour are different
claims — see § 8.6 and § 8.11.

**Still to do:** `src/types/database.ts` is still the introspection-script
output (§ 5.1). Now that both projects have the schema, regenerate it properly
with `npx supabase gen types typescript --linked` and expect the hand-fixed
`returns table(...)` shapes to come back correct for the first time.

**Two routes to fix it.** Neither can be driven from this sandbox: outbound
HTTP to `supabase.co` is blocked, no Supabase credentials are in the
environment, and CLAUDE.md forbids a DB password or access token travelling
through chat.

1. **Preferred — `supabase db push`** with the CLI and your access token. This
   is the only route that populates Supabase's own migration-history table, so
   future `db push` runs behave.
2. **Fallback — paste the whole schema into the Dashboard's SQL Editor.**
   Regenerate the single-file version any time with:

   ```bash
   for f in supabase/migrations/*.sql; do echo; echo "-- $(basename "$f")"; cat "$f"; done > /tmp/criclife-schema.sql
   ```

   Verified in Phase 7 to apply to an empty database in one shot with zero
   errors: 22 tables, 41 functions, 45 policies, 4 published tables. **Never
   include `supabase/tests/00_local_auth_stub.sql`** (it fakes the auth schema
   real Supabase already has) **or `seed.sql`** (local dev fixtures). Caveat:
   this leaves the migration-history table empty, so a later `db push` will try
   to replay everything and fail on the first `create table`.

**Important gap:** the `supabase/migrations/*.sql` files have never been run
against either real Supabase project — every verification so far (pgTAP, the
seed script, RLS checks) has been against a scratch local Postgres database
because this sandbox can't reach Docker (needed for `supabase start`) and,
as far as has been tested, can't reach the real Supabase project's Postgres
connection either. **Before real users touch this app, someone with actual
network access needs to run `supabase db push` (or apply the migrations
directly) against `criclife-prod` / `criclife-staging`, then regenerate
`src/types/database.ts` the normal way** (`npx supabase gen types typescript
--linked`) instead of via the introspection-script workaround described in
§ 5.1. This is now a bigger deal than before Phase 5: `record_delivery` and
friends are the endpoints a real scorer's phone will call every six seconds
during a live match — they need to be exercised against real hosted
Postgres, real RLS, and real network latency before anyone trusts them in a
match that matters.

---

## 5. What exists in code

### 5.1 Sandbox limitations that shaped how this got built

Every session so far has hit the same walls, and worked around them the same
way each time — worth knowing before you re-discover them:

1. **No Docker.** `supabase start`, `supabase gen types typescript --local`,
   and `docker pull` all fail (403 from the registry — this sandbox's network
   policy allows npm/jsr/pypi/crates/go-proxy/anthropic.com only). Worked
   around with a **natively-installed PostgreSQL 16 + pgTAP**, driven by
   `supabase/tests/run-local.sh`. This is real, executable verification — not
   a mock — but it's a scratch database (`criclife_test`), recreated from
   scratch on every run, **not** either real Supabase project.
   - `supabase/tests/00_local_auth_stub.sql` fakes the `auth` schema
     (`auth.uid()`, `auth.role()`, `anon`/`authenticated`/`service_role`
     roles) since a bare Postgres install has none of that. **Never** run
     this against a real Supabase project — Supabase already provides the
     real thing.
   - **The local Postgres server does not survive a container restart.**
     If `sudo -u postgres psql` refuses the connection, run
     `sudo service postgresql start` (or `pg_ctlcluster <version> <cluster>
start` — check with `pg_lsclusters`) before anything else.
   - **Nor does pgTAP itself.** `create extension pgtap` failing with
     "extension is not available" means the package is gone, not that the
     suite is broken: `sudo apt-get install -y postgresql-16-pgtap` restores
     it. (Confirmed working in Phase 7 despite § 5.1's note about the network
     policy — the Ubuntu archives are reachable, unlike the Docker registry.)
   - `create publication` warns `wal_level is insufficient to publish logical
changes` on this bare install. Harmless here — a real Supabase project
     runs `wal_level=logical` already; the publication is still created and
     the pgTAP assertions about it pass.
   - **`psql`'s `:'var'` substitution does not reach inside `$...$`
     dollar-quoted bodies** (DO blocks, function bodies). A pgTAP fixture
     that needs per-iteration state should use repeated top-level statements
     with a fresh inline subquery each time, not a DO-block loop with
     `psql` variables — this cost real debugging time in Phase 5.
2. **`supabase gen types typescript` needs Docker too.** Worked around with a
   custom introspection script: a big `pg_class`/`pg_attribute`/`pg_proc`
   query (`/tmp/.../scratchpad/introspect.sql`, regenerated each session
   since `/tmp` doesn't persist) piped into a hand-written generator
   (`/tmp/.../scratchpad/gen-database-types.mjs`) that produces
   `src/types/database.ts` in the same shape `supabase gen types` would.
   The generator has needed bug fixes across Phases 2–4 (optional/nullable
   RPC args via `pronargdefaults`; array-typed args and `SETOF`-returning
   functions) and, as of Phase 5, **still cannot resolve `returns table(...)`
   shapes** — `search_profiles` and `get_match_grants`'s `Returns` need a
   permanent hand-fix after every regeneration. Re-check its output against
   `\d` on any function whose signature looks off before trusting it blindly.
3. **Playwright's pre-installed Chromium doesn't match the pinned
   `@playwright/test` version, and there is no WebKit at all.** This
   sandbox has `/opt/pw-browsers/chromium-1194` (symlinked at
   `/opt/pw-browsers/chromium`), but `@playwright/test@1.62.1` looks for
   `chromium_headless_shell-1234` by default, and the four mobile projects
   (`iphone-se`, `small-375`, `iphone-14`, `iphone-14-pro-max`) all default to
   WebKit via their device preset (`devices['iPhone SE'].defaultBrowserType`
   etc.), which isn't installed here at any revision. When you need to run
   e2e locally, temporarily add
   `channel: 'chromium'` and `launchOptions: { executablePath:
'/opt/pw-browsers/chromium' }` to the top-level `use` block in
   `playwright.config.ts`, run `--project=desktop` only, then **revert the
   config change** — don't leave it committed. Real CI
   (`.github/workflows/ci.yml`) runs `npx playwright install --with-deps
chromium webkit` fresh and is unaffected by any of this.

### 5.2 Documentation — complete, 15 files in `docs/`

`docs/README.md` is the index. Docs are the spec — when code and docs
disagree, that's been called out explicitly per phase (see § 6.4) rather than
silently picked one way.

### 5.3 Phase 1 — the rules engine (`src/engine/`)

Pure functional core: `types.ts`, `config.ts` (6 built-in rules profiles: T20,
ODI, T10, The Hundred, Gully 8, custom), `applyDelivery.ts` (the 13-step
algorithm), `strike.ts`, `dismissals.ts`, `inningsEnd.ts`, `result.ts`,
`replay.ts`, `scorecard.ts`, `projections.ts`, `commentary.ts`.

**100% branch/function/line/statement coverage**, enforced by a
`vitest.config.ts` threshold gate on `src/engine/**`.

### 5.4 Phase 2 — data layer & auth

- `supabase/migrations/` — extensions/enums → identity/teams → matches/grants
  → deliveries log → stats/audit → functions/triggers → RLS policies →
  `claim_player` RPC. Every table has RLS enabled, deny-by-default.
- `supabase/seed.sql` — 4 teams, 44 shadow players, 1 Super Admin. Local-dev
  only by Supabase CLI convention; never runs against a linked cloud project.
- `src/lib/supabase.ts`, `src/app/providers/queryClient.ts` — typed client +
  TanStack Query, tuned for flaky connectivity at a cricket ground.
- `src/features/auth/` — `AuthProvider`, `authContext.ts`, `useProfile.ts`,
  `LoginPage` (magic link + Google), `AuthCallbackPage`, `OnboardingPage`.
- `src/app/guards/RequireAuth.tsx`, `RequireSuperAdmin.tsx`.
- Router: `AuthedOutlet` (lazy) scopes `AuthProvider` — and the
  `@supabase/supabase-js` it drags in — to only the branches that need a
  session, so the audience bundle stays auth-free.

### 5.5 Phase 3 — teams, players & self-managed roles

- Migration adds `create_team`, `create_shadow_player`, `search_profiles`,
  `add_existing_profile_to_team`, `suggest_role_change`,
  `respond_to_role_suggestion`, `transfer_team_ownership`, `archive_team`.
- Screens: `/teams`, `/teams/new`, `/teams/:teamId` (+ `/squad`),
  `/teams/:teamId/add-player`, `/teams/:teamId/settings`,
  `/players/:playerId`, `/players/:playerId/edit`, `/players/claim`.
- Router grows a **second public branch**: `PublicAuthedOutlet` (lazy) —
  team/player pages are public-read but need to know the viewer's session
  without pulling `supabase-js` into the strict anonymous audience bundle.

### 5.6 Phase 4 — match setup & the scoring token

- Migration adds `create_match`, `set_toss`, `set_playing_xi`,
  `start_innings`, `issue_scoring_grant`, `revoke_scoring_grant`,
  `transfer_scoring_grant`, `create_handoff_token`, `redeem_handoff_token`,
  `get_match_grants`.
- New table not in `docs/02`: `handoff_tokens` (RLS enabled, **zero**
  policies — only the two handoff RPCs ever touch it).
- Screens: `/matches/new`, `/matches/:matchId` (hub), `/matches/:matchId/setup`,
  `/matches/:matchId/rights` (Scoring Rights Map), `/redeem-grant/:token`.

### 5.7 Phase 5 — the scorer view

- **Migration** (`20260802150000_scoring_rpcs.sql`) adds the
  `crossed_before_dismissal` column `docs/04` needed but `docs/02` never
  defined, fixes a real super-over batting-team bug in Phase 4's
  `start_innings`, and adds `record_delivery`, `undo_last_delivery`,
  `edit_delivery`, `end_innings`, `complete_match`. `record_delivery`
  deliberately re-validates only the security/integrity-critical subset
  (legality, seq, grants, lock, free-hit dismissal gate, bowler limits,
  consecutive-over) rather than the engine's full dismissal table — "the
  client engine is for speed; the server is for truth," not "the server
  re-implements the client." Also fixed: `deliveries_innings_seq_idx` made
  partial (`where not is_deleted`) — without this, `edit_delivery`'s
  documented "insert a correction at the same `seq`" would have failed in
  production, not just in a hypothetical.
- **`src/features/scoring/store.ts`** — the Zustand store that is the
  scorer's single source of live state. `commitDelivery` applies the pure
  engine result and calls `set()` **before** the `record_delivery` RPC is
  even sent — CLAUDE.md rule 4's "never await a request" holds today, ahead
  of Phase 6's Dexie durability layer, and is asserted directly in
  `tests/features/scoring/store.test.ts` (call `recordRun()` without
  awaiting it, then check the state synchronously in the same tick).
- **The pad** (`src/features/scoring/components/`): `StatusStrip`,
  `ScoreBlock`, `BattersRow`, `BowlerRow`, `OverStrip`, `RunPad`,
  `ModifierRow`, `ActionRow`, `WicketSheet` (free-hit gates every tile
  except `RUN OUT`/`OBSTRUCTING`), `OpenersPicker`, `BowlerPicker`
  (excludes the previous over's bowler and anyone at their over limit),
  `BatterPicker`, `BallHistorySheet` (run corrections only — see § 6.2),
  `InningsBreakScreen`, `MatchOverScreen`, and the sub-tabs `ScorecardTab`,
  `MapTab` (reuses `ScoringRightsMapPage` as-is), `FeedTab`, `SettingsTab`.
- **`ScorerRoute.tsx`** composes all of the above by `mode`
  (`docs/05` § 5's state table) and by `scorerTab` — the active tab lives in
  the store, not the route, so switching tabs never touches the pad's state.
- **`RequireScoringGrant.tsx`** is real: checks `can_score(match_id,
auth.uid())` via RPC, subscribes to `scoring_grants` over Realtime for
  live revocation, and — this matters, see § 6.4 — deliberately does **not**
  sit behind the usual `<RequireAuth>`. It folds "not signed in" into its
  own render instead, because `RequireAuth`'s `<Navigate>` would unmount
  `ScoringLayout` itself, breaking the no-scroll shell for anyone without a
  session (which, before a live Supabase project is wired up, is every CI
  run — see § 4 and § 6.4).
- **Haptics** (dot/runs/boundary/wicket/error) fire from `commitDelivery`
  itself, not the UI layer. **Handedness mirroring** swaps `WICKET`/`UNDO`
  sides in `ActionRow` per `uiStore.scorerHand`. **Wake lock**
  (`src/lib/wakeLock.ts`) re-acquires on `visibilitychange`, with a small
  indicator in `StatusStrip`. **Accidental-tap guard**: a real bug was found
  and fixed here — the guard originally compared against
  `input.clientDeliveryId`, a fresh random UUID every call, so it could
  never actually match and was silently inert. Fixed to key on the tap's
  content (runs/extra/wicket fields), with the 250–600ms window now
  surfacing the documented "Recorded twice? Undo" chip.

### 5.8 Phase 6 — offline & concurrency

- **Migration** (`20260803120000_offline_sync.sql`) extracts `record_delivery`'s
  per-ball validation+insert logic into a private `_insert_scored_delivery`
  helper, then adds `record_deliveries_batch` — the RPC the sync worker
  actually drains against. It does the grant/lock/innings-status/seq-staleness
  checks **once per batch** (against the batch's first item only — `seq` is a
  single global sequence, and nothing else can write mid-transaction), then
  loops over the batch calling the shared helper inside a nested
  `begin...exception...end` block (an implicit savepoint), so an earlier
  item's success in the same call survives a later item's failure.
  `record_delivery`'s own external behavior is unchanged — verified by
  re-running Phase 5's pgTAP file unmodified against the refactored function.
- **`src/lib/db.ts`** — Dexie's `pendingDeliveries` table (a Phase 0 scaffold)
  is now load-bearing: every delivery is written here, with a
  client-generated `clientDeliveryId`, before anything touches the network.
  Two different "what's outstanding" queries exist on purpose:
  `queuedForInnings` (status `queued`/`error` — what the drain reads next)
  and `unresolvedForInnings` (adds `syncing` — is anything not yet settled).
  Conflating them was the root cause of three real bugs this phase (see
  § 6.4) — a drain in flight is invisible to `queuedForInnings` but must
  still be found by the merge-resolution actions and by a second ball
  deciding whether it's starting a new offline streak.
- **`src/lib/syncWorker.ts`** — framework-free (pub/sub via
  `subscribeSyncEvents`, no direct Zustand import) so it's testable in
  isolation. `enqueueDelivery` writes to Dexie then fires `kickSync`
  (fire-and-forget, never awaited by the caller — CLAUDE.md rule 4).
  `drainMatch`/`drainInnings` batch up to 50 items per innings against
  `record_deliveries_batch`, with exponential backoff (1s→30s) on retryable
  errors. `discardQueuedForInnings` ("Keep theirs") and
  `retryQueuedForInnings` ("Keep both", re-anchors to the current server seq)
  back the merge screen. A true "keep mine" — discarding a ball another
  scorer has already had confirmed by the server — is deliberately **not**
  offered anywhere; see § 8.8.
- **Soft locks** (`docs/03` § 3.6): opening the wicket sheet broadcasts
  `{profileId, displayName, action, ttl}` over a Supabase Realtime channel
  (`scorer-soft-lock:{matchId}`); other scorers on the same match see a
  dimmed pad and an "X is entering a wicket…" banner for 8s.
- **`MergeScreen.tsx`** — blocks the whole pad on conflict, since with the
  ball order genuinely uncertain nothing else is safe to render. Resolves at
  the level of "this device's whole run of unsynced balls for the innings,"
  not a full ball-by-ball diff against the server's sequence — the latter is
  real additional work, deliberately not half-built here (see § 8.8).
- **`ReviewTrayPage.tsx`** (`/matches/:matchId/review`) — replaces the Phase 4
  stub. Lists `rejected`-status Dexie rows reactively via
  `dexie-react-hooks`' `useLiveQuery`, with per-item and bulk discard. There's
  no way to auto-hand a rejected ball to whoever now holds scoring rights —
  Dexie is local to the device — so the page links to the Scoring Rights Map
  and leaves the hand-off manual.
- **`UpdatePrompt.tsx`** (mounted in `RootLayout`, so on every route) blocks
  the "Reload to update" prompt until `pendingCount()` (global, not scoped to
  the current match — a scorer might have queued balls regardless of route)
  reaches zero. Statically imports only `@/lib/sw`; `@/lib/db` is a dynamic
  import inside the effect, so Dexie never rides the eager main chunk despite
  this component being mounted everywhere.
- **Workbox caching** — split the single fonts+images `runtimeCaching` rule
  into two, matching `docs/09` § 5's table exactly: `criclife-fonts`
  (CacheFirst, 1 year) and `criclife-images` (CacheFirst, 30 days/200
  entries) — Phase 0 had merged them into one bucket.
- **`fake-indexeddb`** is a new devDependency (`tests/setup.ts` now does
  `import 'fake-indexeddb/auto'`) — jsdom has no real IndexedDB, and Dexie
  now runs for real (not mocked) in every test that touches the scorer store
  or the sync worker.

### 5.10 Phase 7 — the audience view

- **Migration** (`20260803180000_audience_realtime.sql`) creates the
  `supabase_realtime` publication if absent and adds `deliveries`, `innings`,
  `matches` and `scoring_grants` to it, plus `replica identity full` on
  `deliveries` only. See § 2 for why this is the most consequential thing in
  the phase. `supabase/tests/pgtap/13_audience_realtime_phase7.sql` (14
  assertions) pins both the publication membership and the anonymous read
  surface — including that `profiles` is still _not_ publicly readable.
- **`src/lib/publicApi.ts`** — a ~60-line PostgREST reader (plain `fetch`,
  anon key, GET only) so the audience's first paint never waits on
  `@supabase/supabase-js`. See § 2's warning before changing any import in
  the audience feature.
- **`src/lib/deliveryRow.ts`** — `toEngineDelivery`, extracted from the scorer
  store so the scorer and the audience cannot drift into two different
  mappings of the same row. Two views disagreeing about the same match is the
  exact failure the append-only log exists to prevent.
- **`src/engine/replay.ts`** grows one export, `applyLoggedDelivery` — the body
  of `replay`'s loop. `replay` is now a fold over it. The audience needs it
  because a ball arriving over Realtime must be folded onto the existing state
  in O(1), not by re-replaying the innings (O(n) per ball is a visible hitch by
  the death overs), and because it needs the `EngineEvent[]` a ball produced in
  order to fire milestones. No behaviour change; the engine's 100 % coverage
  gate still passes.
- **Pure, unit-tested modules** in `src/features/audience/`:
  `winProbability.ts` (docs/06 § 5's heuristic — invented constants, clamped so
  a live match never reads as a certainty, and _always_ labelled an estimate;
  the first innings is explicitly a "par comparison", not a win probability),
  `moments.ts` (docs/06 § 4's nine reactions plus the anticipatory hat-trick
  ball, which reuses the engine's `CREDIT_TABLE` rather than restating which
  dismissals a bowler is credited with), `feed.ts` (newest-first feed with over
  and innings dividers; substitutes real names into the engine's id-based
  commentary rather than growing a second commentary generator), and
  `chartData.ts` (all five chart series).
- **`store.ts`** — load by slug → replay → lazily attach Realtime. Reconnect is
  exponential backoff to 30 s, then the pill becomes "PAUSED — tap to resume".
  A backgrounded tab closes its socket after 5 minutes and, on return,
  refetches and shows the "you missed 18 balls" card. **A reconcile deliberately
  fires no moments** — catching up on eighteen balls must not replay eighteen
  celebrations; the card stands in for all of them.
- **The view** (`src/features/audience/components/`): `AudienceHeader`
  (sticky, `LivePill`, calm-mode toggle, share, TV link), `Hero` (aurora,
  count-up, team tint, FINAL OVER and HAT-TRICK BALL states), `WinProbabilityBar`,
  `ThisOverStrip`, `BattersPanel`, `AudienceTabs`, `LiveFeedTab` + `FeedRow` +
  `VirtualFeed`, `ScorecardTab`, `SquadsTab`, `ChartsTab`, `MomentOverlay`,
  `CatchUpCard`, `ReplayScrubber`, `TvLayout`.
- **Charts** live in `src/components/viz/` (the location docs/01 names) as
  hand-rolled SVG: `WormChart`, `ManhattanChart`, `RunRateChart`,
  `PartnershipChart`, `WagonWheel`, over a shared `ChartFrame`/`scales`. **This
  is a deliberate deviation from docs/01, which names Recharts** — see § 6.4.
- **The replay scrubber** re-folds a prefix of the delivery log through the same
  engine that produced the live state. There is no separate "historical" code
  path that could disagree with the live one — which is the whole payoff of
  CLAUDE.md rules 1 and 3.
- **Bundle work.** The audience route's initial JS is measured at **174.69 kB
  brotli against a 180 kB budget** — 0.86 kB _more_ than before Phase 7, for the
  entire view. That is only true because of the Zod removal (§ 2) plus four
  honest lazy boundaries: `ChartsTab`, `ScorecardTab`, `SquadsTab` and
  `TvLayout` are none of them on screen at first paint, and `VirtualFeed`
  (`@tanstack/virtual-core`, ~45 kB of source) loads behind a `Suspense` whose
  fallback is the plain first 60 rows — so nothing a reader can see is ever
  waiting on it. All five are excluded from the `size-limit` glob for exactly
  that reason; `@supabase/supabase-js` was already excluded and remains so
  because the route no longer needs it to render.

### 5.11 Phase 8 — stats & rankings

- **Migration** `20260803190000_stats_and_rankings.sql`: `compute_match_stats`
  (derives `player_match_stats` from the ball log, upserted so a corrected
  delivery is fixed by re-running rather than by patching a total),
  `compute_match_ratings` (docs/07 § 2.1's three components plus the
  opposition factor, as a second pass because the factor needs every row for
  the match to exist first), `rebuild_career_stats` (exponentially decayed
  rollup, 20-match half-life, form factor), `recompute_rankings` (five boards
  against thresholds read from `app_settings`), and a trigger that finalises
  the lot when a match completes.
- **Deviation, flagged:** the roadmap calls `finalize_match` and
  `recompute_rankings` _edge functions_. They are Postgres functions. Atomicity
  with match completion is the first reason, testability the second, zero edge
  invocations the third — all three in the migration's header.
- **`src/features/ranks/filters.ts`** is the pure core, with 21 tests, because
  the renumbering rule is the phase's acceptance criterion. Global positions
  are computed over the whole population _before_ filtering; filtering
  renumbers from 1 and each row keeps its global rank as a ghost number.
  Ratings never change when you filter, and there is a test that says so.
- **`/ranks`** reads over `@/lib/publicApi`, not `supabase-js` — same
  constraint as the audience route, same reason.
- **Not built, deliberately:** format and period filters (they need per-format
  and per-window career rollups that `player_career_stats` has no columns
  for), the player-profile career tables, and the sticky "you" pill (it needs
  the viewer's own player id, and `/ranks` is deliberately session-free).

### 5.12 Phase 9 — partial

- **`src/lib/errors.ts`** — nine error kinds, each with a sentence a cricketer
  can act on, plus the scoring RPC codes from docs/10 § 3.1 which survive
  classification rather than being flattened. `src/features/auth/authErrors.ts`
  is now a one-line adapter onto it; two places deciding separately what an
  error means is exactly how the login screen drifted in the first place.
- **`src/lib/monitoring.ts`** — the reporting seam. **`@sentry/react` is not a
  dependency**: no DSN exists to verify against, and the SDK does not fit the
  audience route's remaining budget. `setErrorSink` is the one call that
  attaches it later. Dropped connections are deliberately not reported —
  reporting every lost signal at a cricket ground buries the real bugs.
- **`/admin`** — overview counts, matches with re-derive-stats, audit log.
  Match unlock is not offered on purpose (a BEFORE UPDATE trigger enforces the
  lock as well as RLS, so the button would fail silently).
- **`/settings`** index, `/settings/scoring`, `/settings/about`,
  `/settings/data`. About publishes how the rating is calculated, which is
  docs/07's own stated mitigation for "ranking formula feels unfair".
  Data export runs through the ordinary client so RLS decides what is in the
  file; deletion raises a request and explains why it is not an erase.
- **a11y:** skip link, `<main id="main" tabIndex={-1}>` in all three layouts,
  `role="tablist"` on every tab strip, `sr-only` text on icon-only controls
  and on rank movement. No axe run, no screen-reader pass.

### 5.13 A standing bundle hazard

The audience route's budget is now the tightest constraint in the codebase,
and it is charged for things that have nothing to do with it. Building Phase 8
and 9 pushed it over twice:

- adding `/stats` and `/ranks/compare` (fixed by excluding those route chunks —
  they are separate routes, so this is honest, not a fudge);
- the admin console using nested `<Routes>` and `NavLink`, which pulled ~2 kB
  more of **react-router into the shared eager vendor chunk**. That one is the
  hazard worth remembering: _any_ route reaching for a new react-router or
  React feature is charged to `/live/:publicSlug`. The admin panels are local
  state now.

It sits at **177 kB of 180 kB**. Run `npm run size` before assuming a new
screen is free.

### 5.9 Current verification numbers (all re-confirmed at end of Phase 6)

| Check                                                        | Result                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pgTAP                                                        | **237/237** ("not ok": 0) across 16 files in `supabase/tests/pgtap/`                                                                                                                                                                                                  |
| Unit/component tests (`npm run test`)                        | **484/484** across 47 files                                                                                                                                                                                                                                           |
| `npm run typecheck` / `npm run lint`                         | clean                                                                                                                                                                                                                                                                 |
| `npm run build` + `npm run size`                             | audience route **177.79 kB** brotli, budget 180 kB — see § 5.13 for how little room that is                                                                                                                                                                           |
| e2e (`npm run test:e2e`, desktop/Chromium project only)      | **9 passed, 4 intentionally skipped** — with the local `channel`/`executablePath` override from § 5.1, not committed. The audience smoke test was rewritten this phase: it asserted the Phase 0 `<Placeholder>` text, which no longer exists.                         |
| e2e, the four mobile/WebKit viewports                        | **could not run in this sandbox** — no WebKit binary at all (see § 5.1); real CI installs it fresh and is not affected                                                                                                                                                |
| E2E flows 5/6/7 (`docs/09` § 9 — the Phase 6 acceptance bar) | **not run as actual Playwright specs** — see § 8.9. Verified instead at the unit/integration layer against a mocked RPC (`tests/lib/syncWorker.test.ts`), which is the closest this sandbox can get without a live, multi-context, network-throttled Supabase backend |

---

## 6. Missing on purpose / deferred, with why

### 6.1 Whole features, by phase

| Thing                                                                                                                                        | Why                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stats rollups, rankings, `/ranks/compare`, `/stats`                                                                                          | Phase 8 — next up, see § 2                                                                                                                                                                                                                                                                        |
| A dynamic per-match OG share image                                                                                                           | Deferred to Phase 9 **by `docs/14` § "Deliberate deviations"**, which overrides the Phase 7 roadmap bullet. v1 ships the static card in `public/og-default.png`; a per-match card needs server-side rendering, which an SPA on Cloudflare static assets cannot do without adding a Worker script. |
| Pitch map chart                                                                                                                              | `docs/06` § 2 lists it as "if available"; no scorer flow captures pitch coords yet (Advanced Mode only records shot coords), so there would be nothing to draw                                                                                                                                    |
| Web push on wicket / 50 / 100 / result, "follow a match"                                                                                     | `docs/06` § 6; needs the notifications work that `docs/13` B8 has open                                                                                                                                                                                                                            |
| Advanced Mode (shot/pitch overlay after each ball)                                                                                           | `docs/05` § 8 explicitly says off by default and not a Phase 5 roadmap bullet                                                                                                                                                                                                                     |
| Full wicket-edit UI in `BallHistorySheet`                                                                                                    | `edit_delivery` supports it server-side; only run corrections are wired client-side — see § 6.2                                                                                                                                                                                                   |
| The `⋯` overflow's rarer actions (retire batter, declare, abandon, penalty runs, drinks interval, correct the over count)                    | Not named Phase 5 roadmap bullets; `⋯` currently only reaches ball history/edit                                                                                                                                                                                                                   |
| `/matches` (list: Live · Upcoming · Completed)                                                                                               | Not an explicit roadmap bullet yet; still a `<Placeholder>`                                                                                                                                                                                                                                       |
| `/matches/:matchId/settings`                                                                                                                 | Phase 4 per roadmap; still a stub                                                                                                                                                                                                                                                                 |
| `/teams/:teamId/matches`, `/teams/:teamId/stats`, `/ranks/compare`, `/stats`                                                                 | Phase 8 (stats/rankings) — stubs                                                                                                                                                                                                                                                                  |
| Most of `/settings/*` (only `/settings/appearance` is real)                                                                                  | Phase 9                                                                                                                                                                                                                                                                                           |
| `/admin/*`                                                                                                                                   | Phase 9                                                                                                                                                                                                                                                                                           |
| Real file upload for team logos / player photos                                                                                              | URL fields only; no storage wiring yet                                                                                                                                                                                                                                                            |
| A true ball-by-ball merge diff (server sequence vs. this device's queue, side by side)                                                       | The merge screen resolves at the innings level instead — see § 6.2 and § 8.8                                                                                                                                                                                                                      |
| A "keep mine" merge-resolution action (discard the _other_ scorer's already-committed ball)                                                  | Deliberately never offered — see § 8.8                                                                                                                                                                                                                                                            |
| E2E Playwright specs for roadmap flows 4 through 8 (token handoff, concurrent scoring, offline sync, revoked-grant review, post-match stats) | Only flows 1–3-adjacent smoke/viewport checks exist as actual Playwright specs; the rest are verified at the unit/component layer against mocked RPCs — see § 8.9                                                                                                                                 |

### 6.2 Simplifications inside phases that did ship

- **`BallHistorySheet` only corrects runs**, not the wicket. `edit_delivery`
  supports replacing the wicket fields too, but a full re-dismissal picker
  would duplicate `WicketSheet`'s own multi-step flow; undo-and-re-enter is
  the documented fallback for anything bigger than a run count anyway.
- **`MapTab` reuses `ScoringRightsMapPage` verbatim** rather than a
  pad-specific rebuild — same component, same `useParams` resolution, since
  the scorer route already lives at `/matches/:matchId/score`.
  `SettingsTab` exposes only the `uiStore` prefs (theme, haptics, hand,
  sound, wake lock, advanced-scoring toggle) and links out to the existing
  `/matches/:matchId/settings` stub for match-config fields, rather than
  guessing which config fields docs never named as "live-editable."
  `ScorecardTab`/`FeedTab` are built directly against the engine's
  `buildInningsScorecard`/the store's `deliveries` log — no new RPCs needed.
- **`tests/e2e/scorer-no-scroll.spec.ts`'s 44px-button-target test is
  skipped**, not deleted. It needs a seeded match plus an authenticated
  session holding a scoring grant to reach `mode: 'READY'` and render the
  real pad — that needs a live Supabase project, same class of gap as
  Phase 0's already-skipped theme-toggle tests.
- **Batting order reordering** in the XI setup screen (Phase 4) is
  up/down-style selection, not full drag-and-drop. **The Scoring Rights
  Map's graph view** (Phase 4) is a real but intentionally simple radial SVG
  layout. **Handoff QR** (Phase 4) redeems via URL, not an in-app scanner.
- **The six/match-won particle effects are a fixed set of GPU-composited
  `motion` divs, not `docs/06` § 8's "single pooled canvas, destroyed after 2s
  idle".** Same visual job, no canvas to pool or tear down, no per-frame
  main-thread work, and nothing retained once the overlay unmounts.
- **`?tv=1` auto-cycles between the at-the-crease panel and the scorecard**,
  not `docs/06` § 6's "scorecard and charts". Charts are a lazy chunk and a
  kiosk has nobody to watch a spinner; cycling into a `Suspense` fallback every
  12 seconds would look broken. Both cycled panels are already loaded.
- **The wagon wheel is usually empty**, because only Advanced Mode captures
  shot coordinates and it is off by default (`docs/05` § 8). It says so in
  words rather than drawing an empty field, which reads as a bug.
- **The audience view's "Edited" badge (`docs/06` § 7) is not built.**
  `delivery_edits` is deliberately _not_ publicly readable (only match managers
  and Super Admins can see the audit trail), so an anonymous spectator has no
  way to learn that a ball was amended. Showing the badge would need either a
  new public column on `deliveries` or a narrow security-definer RPC — a real
  data-model decision, not a UI detail, so it was left alone rather than
  half-built.
- **`MergeScreen` resolves conflicts at the innings level**, not `docs/05`
  § 6.6's full "both sequences side by side, ball by ball" spec — see § 8.8.
- **No "keep mine" merge-resolution action.** Only "keep both" (re-anchor and
  retry after the other scorer's balls) and "keep theirs" (discard mine) are
  offered. Discarding a ball the server has already confirmed for another
  scorer is a strictly more destructive, cross-user action than anything
  else in the merge flow, and undo-and-re-enter already exists as the
  general-purpose correction path — see § 8.8.

### 6.3 Human-only tasks — status (unchanged since Phase 0 unless noted)

- [x] Deploy to Cloudflare Workers — live at `criclife.geminirachit.workers.dev`,
      now carrying the **Phase 7 build**. **The deployed app talks to a Supabase
      project with no schema in it** (see the next item), so every screen that
      reads data will fail until the migrations are pushed. The audience view
      degrades honestly — "Couldn't load this match" — rather than looking broken.
- [x] Push to GitHub as a public repo
- [x] Open the is-a.dev PR — still pending merge
- [x] Create both Supabase projects
- [x] Disable phone auth on both
- [x] Resend account, wired as custom SMTP on both projects
- [x] Add `SUPABASE_URL` / `SUPABASE_ANON_KEY` as GitHub Actions secrets
- [x] Run the keepalive workflow once manually — succeeded
- [x] CI green on all four jobs (Phase 0 baseline)
- [x] Push `supabase/migrations/*.sql` to **both** Supabase projects — done
      2026-08-03, all 15 files, both verified at 56 functions (see § 4)
- [x] Sign in end to end against a real project — done 2026-08-03 (see § 2)
- [ ] **Still unproven:** no RLS policy has been evaluated against a real JWT
      and no scoring RPC has been called on either project. `record_delivery`,
      `record_deliveries_batch` and friends are the endpoints a real match
      depends on every ball, offline or not, and they have only ever run
      against a scratch local Postgres.
- [ ] (Optional, deferred) Google OAuth client — code is ready, needs a
      Google Cloud project + credentials
- [ ] (Follow-up) Merge of is-a.dev PR, then add the custom domain to the Worker
- [ ] (Follow-up) CD workflow so pushes to `main` redeploy — currently manual
- [x] Verify Add-to-Home-Screen on a real phone — **done 2026-08-03**, owner
      installed it to a mobile home screen. That confirms the install flow,
      manifest and icons; it does **not** confirm how the app behaves once
      open, since the backend still has no schema (see above)
- [ ] Score a real 20-over match on a real phone end to end — the literal
      Phase 5 "Done when" bar; unverifiable in this sandbox (no device, no
      live backend) and not yet done by a human either
- [ ] **New (Phase 7):** measure the two halves of Phase 7's "Done when" bar —
      scorer-tap → audience-render **under 1.5s p95 on 4G**, and **Lighthouse
      mobile perf ≥ 90** on `/live/:publicSlug`. Both need a live Supabase
      project and a real device; neither has been measured. See § 8.10.

> The keepalive matters. Free Supabase projects pause after 7 idle days and need
> a manual dashboard click plus a 60s cold start to wake.

### 6.4 Gaps in the docs found and closed while building (so nobody re-discovers them as bugs)

Each of these is a place where the docs described a capability but the
schema, RLS, or router as literally specified couldn't actually support it,
or where a genuine bug was found and fixed. All are called out with a
comment at the top of the relevant file too.

| Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Where it lives | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shadow player claiming: no policy can move `profile_id` from null to a real user                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Phase 2        | `claim_player` RPC (security definer)                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Creating a team is chicken-and-egg                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Phase 3        | `create_team` RPC does both atomically                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| "Invite an existing user" needs to search locked-down `profiles`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Phase 3        | `search_profiles` RPC — narrow, authenticated-only                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| "Archive team" is owner-only, stricter than the general update policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Phase 3        | `archive_team` / `transfer_team_ownership` RPCs enforce the tighter rule directly                                                                                                                                                                                                                                                                                                                                                                                                          |
| Handoff QR has no backing table in `docs/02`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 4        | New `handoff_tokens` table, RLS enabled with zero policies                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Scoring Rights Map needs grant holders' names, but `profiles` is locked down                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 4        | `get_match_grants` RPC                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `start_innings` doesn't persist openers — `innings` has no column for it pre-first-ball                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Phase 4        | Openers are the scorer pad's job, as the first `deliveries` row                                                                                                                                                                                                                                                                                                                                                                                                                            |
| The engine needs `crossed_before_dismissal` on a run-out replay, but neither `docs/02` nor the original migration defined it                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Phase 5        | Added the column                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Phase 4's `start_innings` super-over batting-team logic only worked by coincidence for innings 2, was wrong for innings ≥ 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Phase 5        | Real-cricket rule: the team that bowled first in innings 1 bats first in the super over, alternating on repeat ties                                                                                                                                                                                                                                                                                                                                                                        |
| `deliveries_innings_seq_idx` (not partial) would have made `edit_delivery`'s documented same-`seq` replacement fail in production                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Phase 5        | Made the index partial: `where not is_deleted`                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| The accidental-tap guard compared `clientDeliveryId` — a fresh UUID every call — against itself, so it could never match and was silently inert                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Phase 5        | Rekeyed on the tap's content (runs/extras/wicket fields), not its generated id                                                                                                                                                                                                                                                                                                                                                                                                             |
| Wrapping the scorer route in the same `<RequireAuth>` as every other authed screen breaks `docs/05` § 3's "the shell always renders": `RequireAuth`'s `<Navigate>` on redirect swaps out `ScoringLayout` itself, not just its content                                                                                                                                                                                                                                                                                                                                                              | Phase 5        | `RequireScoringGrant` absorbs the "not signed in" case into its own render (still inside `ScoringLayout`); the scorer route is deliberately not behind `<RequireAuth>`                                                                                                                                                                                                                                                                                                                     |
| Anything a static import in `router.tsx` pulls in rides the eager main chunk — `RequireScoringGrant` naively importing `supabase`/the store blew the bundle-size budget by 36 kB                                                                                                                                                                                                                                                                                                                                                                                                                   | Phase 5        | Both are dynamically imported inside the guard's effect instead                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `kickSync`'s fire-and-forget `drainMatch(matchId)` call had no `.catch()` — any rejection (including one only reachable in a test's torn-down mock context) became a genuinely unhandled promise rejection, not just test flakiness                                                                                                                                                                                                                                                                                                                                                                | Phase 6        | Wraps the call in `.catch()`, emitting an `error` event instead of letting it escape                                                                                                                                                                                                                                                                                                                                                                                                       |
| Three separate places left a Dexie row stuck at `'syncing'` forever whenever a drain attempt marked it `'syncing'` but then couldn't reach a terminal state for it: `drainInnings` when the batch RPC's `results` array is shorter than the batch (the documented "stops at first hard error" case), `handleBatchLevelError`'s `STALE_SEQ` branch, and `handleItemError`'s per-item conflict branch (`ILLEGAL_DISMISSAL`/`CONSECUTIVE_OVER`/`BOWLER_LIMIT`/`INNINGS_COMPLETE`)                                                                                                                     | Phase 6        | All three now explicitly reset the affected row(s) back to `'queued'` before returning/emitting, so the merge-resolution helpers (which query unresolved rows) can actually find and act on them                                                                                                                                                                                                                                                                                           |
| `queuedForInnings` (status `queued`/`error`) was used everywhere "is there unresolved work for this innings" was actually the question — but it excludes `'syncing'`, so a ball enqueued while a drain of an earlier ball was already in flight would race, and the merge-resolution actions couldn't find a ball mid-drain                                                                                                                                                                                                                                                                        | Phase 6        | Added `unresolvedForInnings` (adds `'syncing'`) as the distinct "is anything not yet settled" query; `enqueueDelivery`'s streak-anchor detection and both merge-resolution helpers now use it, while `drainInnings` itself correctly keeps using `queuedForInnings` ("what to send next")                                                                                                                                                                                                  |
| **No table had ever been added to the `supabase_realtime` publication**, so every `postgres_changes` subscription since Phase 5 connected, reported `SUBSCRIBED`, and then received nothing. `docs/02` describes tables, not replication, and `docs/09` § 4 assumes Realtime "just works"                                                                                                                                                                                                                                                                                                          | Phase 7        | `20260803180000_audience_realtime.sql` creates the publication when absent and adds `deliveries`/`innings`/`matches`/`scoring_grants`, plus `replica identity full` on `deliveries` so a filtered undo (an UPDATE) still matches. Pinned by 14 pgTAP assertions                                                                                                                                                                                                                            |
| `docs/01` names **Recharts** for the charts tab. It is ~100 kB gzipped for what are, in four of five cases, a polyline or a row of rects — on the one route with a hard "LCP < 1.8s on 4G, initial JS < 180 kB" bar (`docs/06` § 8) — and CLAUDE.md rule 7 means every series would have been fed `var(--…)` through its props anyway                                                                                                                                                                                                                                                              | Phase 7        | Hand-rolled SVG in `src/components/viz/`, zero new dependencies. `docs/01` itself already specifies hand-rolled SVG for the field/pitch maps. **Flagged, not silently swapped** — revisit if a chart turns up that genuinely needs a library                                                                                                                                                                                                                                               |
| The Phase 7 roadmap bullet says "OG share image edge function"; `docs/14` § "Deliberate deviations" says the opposite — deferred to Phase 9, static image in v1                                                                                                                                                                                                                                                                                                                                                                                                                                    | Phase 7        | Followed `docs/14`, since that table exists precisely to override the other docs on cost grounds. Recorded in `docs/12` next to the bullet so the conflict is visible                                                                                                                                                                                                                                                                                                                      |
| `src/lib/env.ts` imported Zod to validate five environment variables and was the app's **only** Zod importer, so ~260 kB of it rode the eager main chunk on every route — including the one with the 180 kB budget                                                                                                                                                                                                                                                                                                                                                                                 | Phase 7        | Hand-rolled validation with identical messages and identical exported shape, covered by `tests/lib/env.test.ts`. This alone paid for the whole audience view inside the budget                                                                                                                                                                                                                                                                                                             |
| The Phase 0 e2e smoke test asserted the audience route by looking for the `<Placeholder>`'s "Live match" text, which Phase 7 deleted                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Phase 7        | Rewritten to assert the intent instead: the route renders one of its own states for an anonymous visitor and does **not** bounce to `/login`                                                                                                                                                                                                                                                                                                                                               |
| Bundle-size budget: wiring Dexie into the scorer store pulled `db-*.js` (97 kB) into the audience-route `size-limit` measurement, since a new lazy chunk isn't excluded until someone adds it to the config                                                                                                                                                                                                                                                                                                                                                                                        | Phase 6        | Added `!dist/assets/db-*.js` to the exclusion list, same pattern as the existing lazy-chunk exclusions                                                                                                                                                                                                                                                                                                                                                                                     |
| **`supabase.channel(topic)` returns the _existing_ channel when one with that topic is already on the client, and `.on('postgres_changes', …)` throws on a channel that is joining or joined.** `removeChannel()` is `async`, so a synchronous tear-down-and-re-attach still finds the old channel in the list. Three call sites shared a topic across mounts: the scorer route died on `cannot add postgres_changes callbacks … after subscribe()` under StrictMode's double-effect, and the audience route's _reconnect_ would have thrown instead of reconnecting — in production, not just dev | Phase 9        | `src/lib/realtime.ts`'s `openChangeChannel()` gives every subscriber its own topic, which makes all of it unreachable by construction. **Not** used for the soft-lock channel: that is `broadcast`, where the topic is the address two devices meet at. 4 tests against a fake with realtime-js's real semantics                                                                                                                                                                           |
| `useScorerStore.init()` checked the error on its `matches` query and discarded it on the innings, squad and delivery queries. An empty squad is indistinguishable from a failed fetch by the time it reaches the pad, which rendered `AWAITING_OPENERS` — the words "Who is on strike?" above no names, with WICKET and UNDO still in the action row. It reads as an app whose buttons failed to load                                                                                                                                                                                              | Phase 9        | All three errors surfaced as `mode: 'ERROR'` through `classifyError`/`userMessage`. The delivery one was the dangerous one: silently reading zero balls would open a match in progress at 0/0. Plus `EmptySquadNotice`, so a genuinely unset XI says so and links to setup                                                                                                                                                                                                                 |
| The scorer pad had **no state for "the innings has not started"**. With no `innings` row the store fell through to `AWAITING_OPENERS`, and `OpenersPicker` returns null without an innings to pick openers for — as does every other row of the pad — so everything between the status strip and the action row rendered as nothing. A black screen with WICKET and UNDO on it, which is exactly what the first real match on the first real project looked like. `docs/05` § 5 lists the pad's modes and simply does not have this one: it assumes match setup always ran first                   | Phase 9        | `NOT_STARTED` is now a mode of its own, rendering `InningsNotStartedScreen` — a "Start the innings" button calling `start_innings`, plus a link to setup. The three refusals that RPC raises (`TOSS_REQUIRED`, `XI_REQUIRED`, `FORBIDDEN`) are in `DOMAIN_CODES` so each says what is actually missing. The conditions are deliberately **not** mirrored client-side; duplicating server rules is how `record_delivery` drifted (§ 8.14)                                                   |
| **The pad's failure mode was always a blank rectangle.** ScoreBlock, BattersRow, BowlerRow, OverStrip and both pickers each begin `if (!innings) return null` — individually right, collectively a black screen with WICKET and UNDO floating in it, which is what the first real match looked like twice                                                                                                                                                                                                                                                                                          | Phase 9        | The Score tab is gated on the data it needs, and `PadUnavailable` says which of the three pieces is missing and prints `mode`. It should be unreachable; if it shows, that one word is what turns "the app is broken" into a bug report. 6 tests                                                                                                                                                                                                                                           |
| **Match setup had to be done twice.** "Start match" was gated on the toss alone, sat below the fold under two squad sections, and reported failure as the server's raw `XI_REQUIRED: …`. Nothing on the page said which of the three steps were done, and `useMatchSquad` — which has existed since Phase 4 — was never read, so reopening setup showed empty lists for squads that were saved. Filling in one team and stopping looked exactly like finishing; the hub then offered "Continue setup", which led back to the screen you had just left                                              | Phase 9        | A three-line checklist at the top, `setupProgress()` (pure, 6 tests) gating the button with a one-thing-at-a-time reason, squads seeded from what is already stored, and **Start match now goes to the pad, not back to the hub** — the hub was the other half of the loop                                                                                                                                                                                                                 |
| **A brand-new match could never be scored.** `replay()` created innings only inside its per-delivery path, so with an empty delivery log it returned `innings: []` — which is every match between `start_innings` and the first ball. The pad reads `innings[currentInningsIndex]`, found nothing, and reported the innings as not started while the server had already started it; pressing the button again inserted nothing and changed nothing. The deadlock is total: the pad needs an innings to show the openers picker, and an innings only appeared once a delivery existed               | Phase 9        | `replay()` materialises any seeded innings with no deliveries, **after** the fold — the three match fixtures caught doing it before, since `targetFor` reads the previous innings' runs and gave innings 2 a target of 1. 3 tests; `src/engine` still 100%                                                                                                                                                                                                                                 |
| **`yetToBat` was never populated, and all-out ignored who actually turned up.** `emptyInnings` set `yetToBat: []` and nothing ever wrote to it — `setNewBatter` only filters players _out_ — so the "next batter" picker read "No batters remaining" at the first wicket of **every** innings, not just short ones. Separately, all-out was `config.playersPerSide - 1`, so a side of 2 picked for a 3-a-side match had nobody left to bat and an innings that had not ended                                                                                                                       | Phase 9        | `InningsSeed` carries an optional `battingOrder`; `InningsState` gains `squadSize`. `effectivePlayersPerSide()` is `min(playersPerSide, squadSize)` and is used by `inningsEnd`, `result` and `applyDelivery` so three copies of `playersPerSide - 1` cannot drift. Null squadSize keeps the old behaviour exactly. Both stores now pass the order. `src/engine` still 100%                                                                                                                |
| **There was no way back to a live match.** `/matches` was a Phase 0 stub, Home is still the Phase 0 placeholder, and the ⊕ tab pointed straight at `/matches/new` — while docs/11's navigation model says that tab's action is "start **or resume** a match". Only "start" was built, so navigating away from a match in progress lost it short of browser history                                                                                                                                                                                                                                 | Phase 9        | `/matches` is a real list — live first, then upcoming, then finished — and the ⊕ tab goes there, with **New match** at the top of it. `groupMatches`/`resumeAction` are pure, 9 tests. Home is still the Phase 0 placeholder and is now the biggest visible gap                                                                                                                                                                                                                            |
| A live match could still be lost by simply not thinking to look for it, there was **no way to abandon a match** (`abandoned` has been a valid `match_status` since Phase 2 with nothing able to reach it, so a match started by mistake was permanent), and `profiles.avatar_url` — a column since Phase 2 — was **never written to by anything**, so every avatar in the app is a coloured initial even for a Google account that arrived with a picture                                                                                                                                          | Phase 9        | `LiveMatchBar` sits above the tab bar on every authed screen while any match is in progress, driven by the same query as the list so a refresh cannot lose it. `abandon_match(id, reason)` closes the match and its innings, keeping every ball. `handle_new_user` takes `avatar_url`/`picture` and `full_name`/`name`, a new `on_auth_user_updated` trigger fills them in for anyone who linked Google later, and neither ever overwrites a picture the player chose. 16 pgTAP assertions |
| **The Google button was offered on a project that had not enabled Google.** `signInWithOAuth` does not call an API — it navigates the browser straight to GoTrue's `/authorize` — so a disabled provider is not an error object to catch and translate. The browser lands on raw JSON (`"Unsupported provider: provider is not enabled"`) outside the app entirely, with no way back. Hit on a phone against the deployed build                                                                                                                                                                    | Phase 9        | `authProviders.ts` reads GoTrue's own `/auth/v1/settings` and the button renders only when the project reports `external.google === true`. Defaults to _not_ offering it if the check fails — a missing button beats a dead end, and the email form is unaffected. 7 tests, and the pre-existing LoginPage test caught the change immediately                                                                                                                                              |
| **Eleven a side was baked into the UI and the docs**, though never into the engine. `/matches/new` refused fewer than 5 players a side; the setup button read "Save XI"; and `docs/09`'s own end-to-end flow said "add 11 players". `playersPerSide` is a per-match setting and gully cricket is played 2 and 3 a side                                                                                                                                                                                                                                                                             | Phase 9        | Minimum is 2 (a striker and a non-striker). "XI" is gone from every user-visible string and every doc — it literally means eleven. `tests/engine/smallSides.test.ts` pins 2, 6 and 11 a side so nothing re-hardcodes it. The engine already read `playersPerSide` everywhere and needed no change                                                                                                                                                                                          |

---

## 7. Decisions worth not re-litigating

Reasoning is in `docs/13-OPEN-QUESTIONS.md` § A. Short version:

| Decision                                                                                                       | Because                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PWA, not React Native                                                                                          | No app stores wanted; one codebase serves phone, laptop and the TV at the ground                                                                                                                                                                                                                                          |
| Supabase over Firebase                                                                                         | The scoring token is a row-level auth problem — that's what Postgres RLS is for. Rankings are aggregate SQL.                                                                                                                                                                                                              |
| Cloudflare (Workers Static Assets) over Vercel                                                                 | Vercel Hobby is non-commercial and caps at 100 GB, then **pauses your site**. Terrible failure mode for live scores.                                                                                                                                                                                                      |
| Rules engine before UI                                                                                         | Only part where a mistake is expensive to undo, and it needs no design decisions                                                                                                                                                                                                                                          |
| Undo by replay, not reversal                                                                                   | Reversal logic is where scoring apps get subtly wrong.                                                                                                                                                                                                                                                                    |
| Append-only delivery log                                                                                       | Disputed scores are the #1 social problem in amateur cricket                                                                                                                                                                                                                                                              |
| "Scoring map" = a rights topology graph                                                                        | Best reading of the request; the wagon wheel is separately planned as Advanced Mode                                                                                                                                                                                                                                       |
| Team admins can only _suggest_ roles                                                                           | Owner said players own their roles                                                                                                                                                                                                                                                                                        |
| Exponential decay ranking, 20-match half-life                                                                  | Recent form should matter; one lucky innings shouldn't top the board                                                                                                                                                                                                                                                      |
| Local Postgres + pgTAP instead of `supabase start`                                                             | This sandbox has no Docker; see § 5.1. Deliberate, disclosed deviation — not silently swapped for a mock.                                                                                                                                                                                                                 |
| Handoff QR encodes a URL, not a custom in-app scanner                                                          | Any phone camera already handles it; see § 6.2.                                                                                                                                                                                                                                                                           |
| `record_delivery` re-validates a critical subset server-side, not the engine's full ruleset                    | Avoids maintaining two copies of a 37-case dismissal table in two languages; the TS engine is already 100%-covered.                                                                                                                                                                                                       |
| Openers and the opening bowler are picked on the **pad**, not in match setup                                   | `docs/11` § 5 said setup, `docs/05` § 2/5 said the pad, and the code followed 05. Settled for the pad on 2026-08-03 by the owner: openers named at the toss are usually wrong by the first ball, and there is no `innings` row before `start_innings` to store the answer in anyway. `docs/11` now carries the reasoning. |
| The active scorer tab lives in Zustand, not the route                                                          | `docs/05` § 7 requires tapping away and back to restore the pad instantly; a route change would remount it.                                                                                                                                                                                                               |
| The scorer route skips `<RequireAuth>` in favour of `RequireScoringGrant` handling "signed out" itself         | The alternative unmounts `ScoringLayout` on redirect, breaking the no-scroll guarantee for anyone without a session — see § 6.4.                                                                                                                                                                                          |
| `record_deliveries_batch` checks staleness once per batch (against the first item only), not once per item     | `seq` is one global Postgres sequence, and nothing else can write mid-transaction — a per-item check would be redundant work for the same answer.                                                                                                                                                                         |
| The sync worker is framework-free (pub/sub events, no direct Zustand import)                                   | Keeps it independently testable and reusable; the store subscribes to it rather than the worker depending on the store.                                                                                                                                                                                                   |
| The audience route reads its snapshot over plain `fetch`, importing `supabase-js` only afterwards for Realtime | 216 kB raw / ~57 kB gzipped on the critical path of the one route with a hard performance budget, to do three GETs that PostgREST answers over ordinary HTTP. See § 2.                                                                                                                                                    |
| Hand-rolled SVG charts instead of Recharts                                                                     | ~100 kB gzipped for four trivial plots, on a free-tier mobile PWA. Flagged as a docs deviation rather than made silently — see § 6.4.                                                                                                                                                                                     |
| A Realtime reconcile fires no moments                                                                          | Catching up on eighteen missed balls must not replay eighteen celebrations; the "you missed 18 balls" card exists for exactly that.                                                                                                                                                                                       |
| One ball in, one ball folded (`applyLoggedDelivery`) — never a full re-replay                                  | O(n) per ball is a visible hitch by the death overs. Corrections (undo, edit) still re-replay from ball one, because that is the only honest way to rebuild state the log no longer implies.                                                                                                                              |
| Win probability is clamped to 2–98 % while a match is live                                                     | A bar pinned at 100 % with a ball still to be bowled is a claim the heuristic never made. 0 and 100 are reserved for genuinely decided states.                                                                                                                                                                            |
| Merge-resolution "keep both"/"keep theirs" only, never "keep mine"                                             | Discarding another scorer's server-confirmed ball is categorically more destructive than anything else in the app; undo-and-re-enter is the existing fallback — see § 8.8.                                                                                                                                                |

Still open, none blocking: who can create teams (B2), tournaments in v1 (B4),
a team ladder as well as player ranks (B6), web push in v1 (B8), importing
historic matches (B9).

---

## 8. Things I'd want a second opinion on

Genuine uncertainty, not false modesty:

1. **The rating formula constants** in `docs/07` § 2 are invented. They're
   plausible but untuned. They need a season of real data.
2. **The win-probability heuristic** is a placeholder shipped with an "estimate"
   label. Fine, but don't let it look authoritative.
3. **The scorer layout budget** was computed on paper and passes the
   Chromium-based no-scroll assertion at 320×568 through 430×932 in this
   sandbox — but it has **never once rendered in an actual WebKit engine**,
   let alone a real phone. WebKit's `dvh` and safe-area handling has
   historically had its own quirks; this is a real, unverified risk, not
   just a formality.
4. **Concurrent multi-scorer conflict handling is now built, but only
   exercised at the unit/component layer against a mocked RPC** — see § 8.9.
   `commitDelivery`'s previous "resync and silently prefer the server"
   behavior is gone; there's a real merge screen now. What's still unverified
   is the actual multi-device, real-network-latency version of the scenario.
5. **`exactOptionalPropertyTypes`** has needed a few explicit
   `...(x ? {y} : {})` spreads through Phase 5 (RPC payloads, `WicketInput`)
   rather than being pure friction — still seems worth keeping, but the
   pattern is worth knowing before you hit it fresh.
6. **None of Phases 1–6 have run against a real Supabase project** — every
   green checkmark in § 5.9 is against a local scratch Postgres. The scoring
   and sync RPCs are the endpoints a live match calls every six seconds,
   offline or not; "it passed pgTAP locally" and "it works against real
   hosted Postgres with real network latency and the real `auth` schema,
   under concurrent writers" are not the same claim. Push to
   `criclife-staging` and re-run before trusting this in front of real users.
7. **The accidental-tap guard and the 250–600ms "Recorded twice?" chip are
   unit-tested with fake timers, not felt on a real touchscreen.** The
   thresholds (250ms / 600ms) are the ones docs specify, but whether they
   feel right on an actual phone under actual thumb pressure hasn't been
   checked outside this sandbox.
8. **The merge screen and "keep mine" are real, deliberate simplifications,
   not TODOs in disguise — but they're worth someone re-checking against how
   an actual disputed-scoring argument plays out at a ground.** `docs/05`
   § 6.6 specs a full ball-by-ball diff (server sequence next to this
   device's queue); what shipped instead resolves at "this device's whole
   unsynced run for the innings" — enough to unblock the pad, not enough to
   show a scorer exactly which of their balls conflicts with which of the
   other scorer's. And there is no way at all to discard the other scorer's
   already-committed ball, even when the scorer holding the device is
   confident theirs is right — that always requires falling back to
   undo-and-re-enter after the fact. Both were deliberate calls under the
   phase's time box, not oversights, but "deliberate" isn't the same as
   "definitely correct" — flagging for a second opinion once this sees a
   real disputed over.
9. **E2E flows 5, 6, and 7 (`docs/09` § 9) — the actual Phase 6 "Done when"
   bar — were not run as Playwright specs.** They need two browser contexts
   (or two devices), real offline/online network transitions, and a live
   Supabase backend with real RLS and real latency; none of that exists in
   this sandbox (see § 5.1), and no such specs exist yet in `tests/e2e/`
   even as a scaffold. What stands in for them today is
   `tests/lib/syncWorker.test.ts`, which drives the same code paths
   (STALE_SEQ, NO_GRANT, batch duplicate/partial-failure handling) against a
   mocked `record_deliveries_batch` — a real test of the client-side state
   machine, but not a claim that flows 5/6/7 have ever been seen to pass
   end-to-end. Don't report Phase 6 as fully done against docs' own bar
   without someone running these for real first.

---

10. **Neither half of Phase 7's "Done when" bar has been measured, and one
    half cannot be measured from code at all.** The roadmap asks for
    scorer-tap → audience-render **under 1.5s p95 on 4G** and **Lighthouse
    mobile ≥ 90** on `/live/:publicSlug`. What exists is a client written
    against that target and a bundle measured at 174.69 kB of a 180 kB budget —
    which is evidence about one input to Lighthouse, not a Lighthouse score.
    The latency figure needs a real Supabase project, a real scorer's phone and
    a real 4G connection. Do not report Phase 7 as meeting its own bar until
    someone has run both.
11. **The Realtime path has never actually carried a message.** The publication
    migration is verified by pgTAP — the tables _are_ published, the replica
    identity _is_ right — and the client's subscribe/reconnect/teardown logic is
    unit-tested against a stubbed channel. Neither of those is the same as a row
    event having travelled from Postgres to a browser. This is the single
    largest untested surface in the phase, and it is untestable here for the
    same reason everything else is (§ 5.1, § 8.6).
12. **The win-probability constants are invented**, exactly like the rating
    constants in `docs/07` § 2 (§ 8.1). They are chosen to behave sensibly at
    the edges a spectator notices — 3 off 12 with 8 wickets should read as
    near-certain, 60 off 12 should not — and the tests pin those edges rather
    than the curve between them. The bar is always labelled "estimate" and
    always explains its inputs, which is the honest mitigation; tuning needs a
    season of real matches.
13. **The moment durations and the whole celebration layer have only been seen
    in jsdom.** `docs/06` § 4's timings (350ms four, 900ms six, 1.2s wicket) are
    implemented as specified and the queue-drain logic is tested, but nobody has
    watched a six celebrate on a phone. Whether the confetti reads as joyful or
    as jank on a mid-range Android is genuinely unknown.

14. **Two bugs sat in `record_delivery` from Phase 5 to Phase 8 and nothing
    caught them.** Not uncertainty — history, and the most useful thing in this
    section. Both were found only because Phase 8 needed to _read_ the rows
    Phase 5 had been writing, and both are fixed by
    `20260803191000_fix_json_null_wicket.sql`.

    - `v_wicket jsonb := p->'wicket'`. The client sends `{"wicket": null}` on
      every non-wicket ball, and `->` returns `'null'::jsonb`, which is **not**
      SQL `NULL`. So `v_wicket is null` was false on every delivery: every ball
      stored `is_wicket = true` (a side all out in ten balls) and no four or
      six was ever flagged, because those flags were computed as
      `runs_batter = 4 and v_wicket is null`. Fixed with
      `nullif(p->'wicket', 'null'::jsonb)`.
    - The server stored `extraRuns` verbatim, but the engine stores
      `autoExtra + input.extraRuns`. Every wide and no-ball was a run short in
      the database, and the audience view — which subtracts the wide penalty
      again on replay — rendered them as zero. Fixed by computing
      `v_auto_extra` from the match config server-side.

    **Why nothing caught them:** pgTAP asserted the RPC returned a row, not
    what was in it, and the client never re-read what it wrote — the scorer
    projects from its own local log through the engine, so the pad looked
    perfect while the database filled with nonsense. Worse, and the part worth
    carrying forward: **every existing test sent a payload the client never
    sends.** They omit `wicket` entirely, so no test could have reached the
    `'null'::jsonb` case however many of them there were.

    **The guard now exists:** `supabase/tests/pgtap/15_delivery_readback.sql`,
    22 assertions, which sends exactly what `src/features/scoring/store.ts`
    sends — `"wicket": null` and all — and asserts on the stored columns and
    the innings totals they feed. Verified the only way a regression test is
    worth anything: re-applied the migrations with the fix file skipped, and
    **14 of the 22 fail**. If you add an RPC that stores a projection of
    engine state, add its read-back assertions here. A write path nothing
    reads back is not tested, however green the suite is.

---

## 9. File map

```
criclife/
├─ CLAUDE.md              ← project memory, auto-loaded by Claude Code
├─ HANDOFF.md             ← this file — update after every phase
├─ README.md              ← public-facing overview
├─ SETUP.md               ← the human account steps
├─ wrangler.jsonc         ← Cloudflare Workers static-assets deploy config
├─ docs/                  ← 15 planning docs, README.md is the index
├─ src/
│  ├─ engine/             ← Phase 1 — pure rules engine
│  ├─ app/                ← router, providers, layouts, guards
│  ├─ features/
│  │  ├─ auth/            ← Phase 2 — login, callback, onboarding
│  │  ├─ teams/           ← Phase 3
│  │  ├─ players/         ← Phase 3
│  │  ├─ matches/         ← Phase 4; ReviewTrayPage.tsx is Phase 6
│  │  ├─ scoring/         ← Phase 5 — store.ts, ScorerRoute.tsx, components/
│  │  │                      (MergeScreen.tsx is Phase 6)
│  │  ├─ audience/        ← Phase 7 — AudienceRoute, store, useAudienceView,
│  │  │                      winProbability · moments · feed · chartData (pure),
│  │  │                      components/ (hero, tabs, moments, TV, scrubber)
│  │  ├─ home, settings, ranks, admin, system
│  ├─ components/ui/      ← Button Card Skeleton CountUp Aurora LivePill
│  │                         ThemeToggle Crest Avatar
│  ├─ components/viz/     ← Phase 7 — hand-rolled SVG charts (see § 6.4)
│  ├─ components/system/  ← UpdatePrompt.tsx (Phase 6)
│  ├─ lib/                ← env supabase db(Dexie) theme haptics format cn sw
│  │                         wakeLock (Phase 5), syncWorker (Phase 6),
│  │                         publicApi + deliveryRow (Phase 7)
│  ├─ stores/             ← zustand uiStore
│  ├─ styles/             ← tokens.css globals.css animations.css
│  └─ types/database.ts   ← generated (see § 5.1 for how, since no Docker)
├─ supabase/
│  ├─ migrations/         ← Phases 2–9, 16 files, chronologically ordered
│  ├─ seed.sql            ← local-dev only, never runs against cloud
│  └─ tests/
│     ├─ run-local.sh     ← the local Postgres+pgTAP harness — see § 5.1
│     ├─ 00_local_auth_stub.sql  ← LOCAL ONLY, never push to real Supabase
│     └─ pgtap/           ← 16 files, 237 assertions
├─ tests/
│  ├─ engine/             ← Phase 1 — 100%-covered pure engine tests
│  ├─ features/           ← auth, matches, players, scoring component tests
│  │                         (MergeScreen.test.tsx, ReviewTrayPage.test.tsx — Phase 6)
│  │                         audience/ — Phase 7, incl. AudienceRoute.test.tsx
│  ├─ lib/                ← unit tests, incl. syncWorker.test.ts (Phase 6)
│  ├─ e2e/                ← Playwright (no-scroll gate, viewport gate, smoke) —
│  │                         no specs yet for roadmap flows 4–8, see § 8.9
├─ public/                ← icons, manifest assets, fonts README
├─ scripts/               ← generate-icons.py
└─ .github/workflows/     ← ci.yml, keepalive.yml
```
