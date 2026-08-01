# 🏏 CricLife — Planning Documentation

> A futuristic, mobile-first, real-time cricket scoring and statistics web app.

**Status:** Phase 0 deployed, git initialized.
**Last updated:** 2026-08-01
**Runs at $0/month** — see [14-FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md)
**Domains:** `criclife.geminirachit.workers.dev` (Cloudflare Workers, live) · `criclife.is-a.dev` (pending PR)

---

## Read in this order

| # | Document | What it answers |
|---|----------|-----------------|
| 00 | [OVERVIEW](./00-OVERVIEW.md) | What are we building, for whom, and what's in/out of scope |
| 01 | [TECH-STACK](./01-TECH-STACK.md) | Which technologies and why |
| 02 | [DATA-MODEL](./02-DATA-MODEL.md) | Every table, column, relationship and index |
| 03 | [ROLES-PERMISSIONS](./03-ROLES-PERMISSIONS.md) | Roles, the scoring token, permission matrix, RLS |
| 04 | [RULES-ENGINE](./04-RULES-ENGINE.md) | Cricket laws encoded — ball outcomes, state machine, edge cases |
| 05 | [SCORER-VIEW](./05-SCORER-VIEW.md) | The zero-scroll one-thumb scoring interface |
| 06 | [AUDIENCE-VIEW](./06-AUDIENCE-VIEW.md) | The live spectator experience |
| 07 | [STATS-AND-RANKINGS](./07-STATS-AND-RANKINGS.md) | Every stat, the ranking formula, filters |
| 08 | [DESIGN-SYSTEM](./08-DESIGN-SYSTEM.md) | Visual language, tokens, dark/light, motion |
| 09 | [ARCHITECTURE](./09-ARCHITECTURE.md) | Folder structure, state, realtime, offline sync |
| 10 | [API-CONTRACT](./10-API-CONTRACT.md) | Endpoints, RPCs, realtime channels, payloads |
| 11 | [SCREENS-AND-ROUTES](./11-SCREENS-AND-ROUTES.md) | Complete screen inventory and route map |
| 12 | [ROADMAP](./12-ROADMAP.md) | Phased build plan with acceptance criteria |
| 13 | [OPEN-QUESTIONS](./13-OPEN-QUESTIONS.md) | Decisions log + what's still open |
| 14 | [FREE-TIER-PLAN](./14-FREE-TIER-PLAN.md) | Free domain, free hosting, limits with headroom maths, upgrade triggers |

---

## The 60-second summary

**CricLife** lets a group of friends, a club, or a local league run real cricket
matches on their phones.

- A **Super Admin** owns the app and can do anything.
- **Team Admins** create teams and add players.
- **Players** own their own profile and can set their own role (batter,
  bowler, all-rounder, wicket-keeper).
- Exactly one live match has a set of **Scoring Tokens**. Whoever holds a token
  can record balls. Tokens can be handed to one person or several at once, and
  revoked at any time.
- **Scorers** get a dense, one-thumb, no-scroll ball-entry screen.
- **Audience** gets a beautiful live scorecard that updates in real time.
- Finished matches are archived forever and roll up into **player stats** and a
  **rankings** page, filterable by any set of teams or across everyone.

Overs per innings is a per-match setting. So is nearly everything else — see
[04-RULES-ENGINE](./04-RULES-ENGINE.md) § Match Configuration.

---

## Naming conventions used across all docs

- **Database**: `snake_case` tables (plural) and columns.
- **TypeScript**: `PascalCase` types, `camelCase` variables.
- **Routes**: `kebab-case`.
- A **delivery** = one ball bowled (legal or not). Stored in `deliveries`.
- A **legal delivery** = one that counts toward the over.
- **Innings** is both singular and plural. The table is `innings`.
