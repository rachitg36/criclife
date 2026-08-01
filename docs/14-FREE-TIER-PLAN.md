# 14 — Free Tier Plan & Domain

**Constraint:** CricLife must run at **₹0 / $0 per month** at your scale
(< 20 teams, one league, public audience view, English only).

This is achievable with real headroom. Below is the exact stack, the numbers
that prove it fits, the four things that had to change from the original plan,
and the trigger points where you'd eventually have to pay.

---

## 1. Your question: can Supabase or Firebase give me a free URL?

Short answer: **Firebase can, Supabase cannot — but Cloudflare Pages does it
better than either.**

| Service | Gives you a website URL? | What you actually get |
|---|---|---|
| **Supabase** | ❌ **No** | You get `<ref>.supabase.co` — that's your **API and database endpoint only**. Supabase has no static site hosting product. You cannot put your React app there. |
| **Firebase** | ✅ Yes | Firebase Hosting gives `<project>.web.app` and `<project>.firebaseapp.com` free. But you'd only use Firebase Hosting, not Firebase's database — which means running two vendors for no benefit. |
| **Cloudflare Pages** | ✅ Yes | `<project>.pages.dev` free, **unlimited bandwidth**, commercial use allowed. |
| **Netlify** | ✅ Yes | `<name>.netlify.app`, 100 GB/month cap. |
| **Vercel** | ✅ Yes | `<name>.vercel.app`, 100 GB/month cap, **Hobby tier is non-commercial only** per their ToS. |

### Recommendation

```
Frontend  →  Cloudflare Pages   →  criclife.pages.dev        (free, instant)
Backend   →  Supabase           →  <ref>.supabase.co         (free, API only)
Nice name →  is-a.dev           →  criclife.is-a.dev         (free, ~1 day)
```

**Both of your URLs are free and permanent.** You point `criclife.is-a.dev` at
`criclife.pages.dev` with a CNAME record, and share the nicer one.

### Domain availability — checked today (2026-08-01)

| Domain | Status | How to get it | Cost |
|---|---|---|---|
| **`criclife.is-a.dev`** | ✅ **CONFIRMED AVAILABLE** — verified against the is-a.dev registry | Open a PR on `github.com/is-a-dev/register` adding a JSON file with your CNAME. Merged usually within a day. | Free forever |
| **`criclife.pages.dev`** | Claimed automatically when you name your Cloudflare Pages project `criclife`. Globally unique, first-come. | Create the Pages project — takes 2 minutes. **Do this early to reserve the name.** | Free forever |
| `criclife.web.app` | Available if you create a Firebase project named `criclife` | Not recommended — you'd be splitting vendors | Free |
| `criclife.com` | Almost certainly taken or premium | — | Paid |
| `criclife.in` | Worth checking if you ever want a real domain | Registrar | ~₹700/yr |

**Fallbacks if `criclife` is already taken on Pages:** `criclifeapp`,
`criclife-league`, `getcriclife`, `criclife-io`. Note that the Pages subdomain
and the is-a.dev subdomain are independent — you can have an ugly
`criclifeapp.pages.dev` under the hood and still share the clean
`criclife.is-a.dev`.

> **Action item, do this first:** create the Cloudflare Pages project named
> `criclife` before writing any code, purely to reserve the subdomain. An empty
> project costs nothing.

### Caveat you should know

A free subdomain is a great on-ramp and a poor foundation for anything you can't
afford to lose. `is-a.dev` and `pages.dev` are both run by real organisations
with good track records, but you don't own them. If CricLife becomes something
you depend on, buy `criclife.in` for ~₹700/year and point it at the same Pages
project — a 5-minute change, and every install keeps working if you add it as a
custom domain rather than replacing the old one.

---

## 2. The all-free stack

| Layer | Service | Free tier | Cost |
|---|---|---|---|
| **Hosting / CDN** | **Cloudflare Pages** | Unlimited bandwidth, unlimited sites, 500 builds/mo, commercial use OK | **$0** |
| **Database + API + Auth + Realtime + Storage** | **Supabase Free** | 500 MB DB, 1 GB storage, 5 GB egress, 50k MAU, 200 concurrent realtime connections, 2M realtime messages/mo, 500k edge fn invocations, unlimited API requests, 2 projects | **$0** |
| **Transactional email** (magic links) | **Resend Free** | 3,000 emails/mo, 100/day | **$0** |
| **Source control + CI** | **GitHub** (public repo) | Unlimited Actions minutes on public repos | **$0** |
| **Keepalive cron** | GitHub Actions scheduled workflow | included above | **$0** |
| **Error tracking** | **Sentry Developer** | 5,000 errors/mo, 1 user | **$0** |
| **Analytics** | **Cloudflare Web Analytics** | Unlimited, privacy-first, no cookie banner needed | **$0** |
| **Web push** | Self-hosted VAPID | No service required — it's a browser standard | **$0** |
| **Fonts** | Self-hosted Inter + Geist (OFL licence) | — | **$0** |
| **Icons** | Lucide (ISC licence) | — | **$0** |
| **Domain** | `criclife.pages.dev` + `criclife.is-a.dev` | — | **$0** |
| | | **TOTAL** | **$0 / month** |

---

## 3. Does it actually fit? The headroom maths

Assumptions for your scale: **20 teams × 16 players = 320 players**, roughly
**100 matches per year**, average **250 deliveries** per match, peak **80
concurrent viewers** on a big game.

| Limit | Your usage | Headroom |
|---|---|---|
| **DB storage** 500 MB | 25,000 deliveries/yr × ~400 B = **~10 MB/year**, plus ~2 MB of everything else | **~40 years** ✅ |
| **File storage** 1 GB | 20 logos (50 KB) + 320 photos (200 KB) = **~70 MB** | **14×** ✅ |
| **Egress** 5 GB/mo | Audience page ~250 KB → **~20,000 page loads/month** | Comfortable ✅ |
| **Realtime concurrent** 200 | Peak 80 viewers + 3 scorers = **83** | **2.4×** ✅ |
| **Realtime messages** 2M/mo | 250 balls × 80 viewers = 20k/match; 10 matches/mo = **200k** | **10×** ✅ |
| **Auth MAU** 50,000 | **320 players** + anonymous audience (doesn't count) | **150×** ✅ |
| **Edge fn invocations** 500k/mo | `finalize_match` 10 + `recompute_rankings` 40 + OG images ~500 = **~550** | **900×** ✅ |
| **Supabase projects** 2 | 1 production + 1 staging (dev runs locally) | Exactly fits ⚠️ |
| **Resend email** 3,000/mo | ~320 players × a few logins = **~500** | **6×** ✅ |
| **Cloudflare builds** 500/mo | ~50 deploys | **10×** ✅ |
| **Sentry errors** 5,000/mo | Hopefully near zero | ✅ |

**The binding constraint is realtime messages, and you're at 10% of it.** Nothing
here is close to tight.

---

## 4. The four changes required to stay free

### 4.1 Cloudflare Pages instead of Vercel ⚠️ *changed from doc 01*

Two reasons:
1. **Vercel's Hobby tier is non-commercial only.** A club league with no revenue
   is arguably fine, but if you ever charge a team fee you're in violation.
   Cloudflare explicitly permits commercial use on free.
2. **Unlimited bandwidth vs 100 GB.** If a match goes viral in a WhatsApp group
   and you blow past 100 GB, Vercel **pauses your site until next month**.
   Cloudflare just keeps serving. For a live-score app, being taken offline
   mid-match is the worst possible failure.

Vite builds to static files, so deployment is identical either way. No lock-in.

### 4.2 A keepalive cron to prevent the 7-day pause ⚠️ *new*

**Supabase free projects pause after 7 days with no database activity.** Waking
one takes a manual dashboard click plus up to 60 seconds of cold start. For a
league that plays every other weekend, this *will* bite you — right as someone
tries to score a match.

Fix: a free GitHub Actions workflow that pings the database every 3 days.

```yaml
# .github/workflows/keepalive.yml
name: Supabase keepalive
on:
  schedule:
    - cron: '0 6 */3 * *'      # every 3 days at 06:00 UTC
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Touch the database
        run: |
          curl -fsS \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            "${{ secrets.SUPABASE_URL }}/rest/v1/app_settings?select=id&limit=1"
```

Ten lines, free, and the project never pauses. **Add this in Phase 0**, not later.

Belt and braces: also warm the connection when a match is scheduled within the
hour, so the first scorer of the day never waits.

### 4.3 Drop phone OTP; use magic link + Google only ⚠️ *changed from doc 01*

Supabase phone auth routes through Twilio, which costs money per SMS. Remove it.

Also: Supabase's **built-in email sender is heavily rate-limited** (a handful of
messages per hour) and is not intended for production. Configure **Resend** as
custom SMTP — free tier is 3,000 emails/month, far beyond 320 players logging in.

Result: magic link (via Resend) + Google OAuth. Both free, both better UX at a
cricket ground than typing a password anyway.

### 4.4 Plain table instead of a materialized view ⚠️ *changed from doc 02*

The original plan used a materialized view for `player_career_stats`. At 320
players and 25,000 deliveries that's over-engineering, and MV refreshes take
locks that are annoying on a 500 MB shared instance.

**Use a regular table**, fully rewritten by the `recompute_rankings` edge
function on match completion and nightly. The whole recompute at your scale is
a sub-second query. Simpler, no locks, same result.

> Doc 02 § 7 is amended accordingly: `player_career_stats` is a **table**, not
> a materialized view. Everything else about it is unchanged.

---

## 5. Also worth doing while you're optimising for free

| Choice | Why |
|---|---|
| **Public GitHub repo** | Unlimited free Actions minutes (private repos get 2,000/mo). Nothing in this codebase is secret — the secrets live in environment variables. |
| **Self-host fonts** | Faster than Google Fonts CDN, no third-party request, and one fewer thing to break. |
| **Cloudflare Web Analytics over Google Analytics** | Free, unlimited, no cookies → **no cookie banner**, which matters for a clean audience view. |
| **Skip the OG image edge function in v1** | A single well-designed static OG image costs nothing and looks fine in WhatsApp. Add dynamic score cards in Phase 9 if you want them. |
| **`supabase start` for local dev** | Runs the whole stack in Docker on your machine. Keeps you at 2 cloud projects (prod + staging). |
| **Compress uploads client-side** | Resize player photos to 400×400 WebP in the browser before upload. Turns 3 MB phone photos into 40 KB and protects the 1 GB storage limit. |

---

## 6. What breaks first if CricLife grows

In order of what you'd hit:

| # | Trigger | Symptom | Fix | Cost |
|---|---|---|---|---|
| 1 | **> 200 concurrent viewers** on one match | New viewers can't connect to realtime | Supabase Pro | $25/mo |
| 2 | **> 5 GB egress/month** (~20k audience page loads) | Overage or throttling | Supabase Pro (250 GB included) | $25/mo |
| 3 | **> 2M realtime messages/month** | Messages silently dropped | Supabase Pro, or batch multiple balls per broadcast | $25/mo |
| 4 | **> 3,000 login emails/month** | Magic links stop sending | Resend paid, or lean harder on Google OAuth | $20/mo |
| 5 | **> 500 MB database** (~50 years away) | Writes fail | Supabase Pro (8 GB) | included above |

**Realistically: one $25/month Supabase Pro subscription covers you all the way
to a few hundred teams.** Cloudflare Pages stays free essentially forever.

A cheap intermediate step before paying: cap the realtime fan-out by having the
audience view poll every 3 seconds instead of subscribing when viewer count
exceeds a threshold. Slightly less magical, dramatically cheaper.

---

## 7. Free-tier checklist for Phase 0

- [ ] Create Cloudflare Pages project named **`criclife`** → reserves `criclife.pages.dev`
- [ ] Open the is-a.dev PR for **`criclife.is-a.dev`** → CNAME to `criclife.pages.dev`
- [ ] Create Supabase project `criclife-prod` (choose the region nearest your league)
- [ ] Create Supabase project `criclife-staging` (that's your 2 free projects used)
- [ ] Sign up Resend, verify a sending domain, wire it as Supabase custom SMTP
- [ ] **Disable phone auth** in the Supabase dashboard
- [ ] Add `.github/workflows/keepalive.yml`
- [ ] Make the GitHub repo **public**
- [ ] Enable Cloudflare Web Analytics on the Pages project
- [ ] Create the Sentry project (Developer plan)
- [ ] Generate VAPID keys for web push, store as Supabase secrets
- [ ] Self-host Inter + Geist in `public/fonts/`
- [ ] Add a `size-limit` budget so the bundle can't quietly grow past the targets
      in doc 09

---

## 8. Amendments to earlier docs

These supersede what's written elsewhere. Everything not listed is unchanged.

| Doc | Was | Now |
|---|---|---|
| 01 § Tech Stack | Hosting: Vercel | **Hosting: Cloudflare Pages** |
| 01 § Tech Stack | Auth: magic link + Google + phone OTP | **magic link (Resend SMTP) + Google.** No phone OTP. |
| 02 § 7 | `player_career_stats` MATERIALIZED VIEW | **plain table**, rewritten by edge function |
| 09 § 7 | `og_image` edge function in v1 | **Deferred to Phase 9.** Static OG image in v1. |
| 12 Phase 0 | — | **Add:** reserve domains, keepalive cron, Resend SMTP, public repo |
| 13 B1/B3/B5/B7/B10 | Open | **Answered** — see doc 13 § E |
