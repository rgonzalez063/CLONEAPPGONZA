# Backend

Accounts, a Postgres database, and an API. Written 2026-10-14.

## What runs where

| piece | choice |
| --- | --- |
| database | Postgres. `DATABASE_URL` set: your hosted database (node-postgres). Not set: PGlite, a real Postgres in WebAssembly stored in `.data/pglite`, for local use. Same SQL either way. |
| schema | `migrations/001_init.sql`, applied automatically at start (`schema_migrations` records what ran). |
| accounts | email and password. Passwords hashed with scrypt (N=16384, random 16-byte salt). Logins are random 32-byte tokens in an http-only, same-site cookie (secure in production); only a SHA-256 of the token is stored. 30-day expiry. |
| API | Next.js route handlers under `app/api`, every body validated with zod (`lib/server/schemas.ts`). |
| client | `lib/store.ts` keeps the same functions the screens already used, now over `/api`. Saves are debounced and sent as small patches. |
| pages | `middleware.ts` sends visitors without a login cookie to `/login`; the API is what actually enforces the login. |

## Data model (as built)

`users`, `auth_sessions`, `templates`, `sessions`, `datasets`, `properties`. This is simpler than `architecture.md` planned: results (method results, matched pairs) are not stored, because the app recomputes them from the sales and settings in a fraction of a second, so there is nothing to keep in sync. Widgets (chosen values, limits, done and lock state) live in `sessions.widgets` with their order in `widget_order` (jsonb does not keep key order). Sales are one row each, so a dataset of 5,000 sales loads and saves in chunks of 1,000.

## Cross-device behavior

- Everything is saved to the database, so signing in on any device shows the same sessions and templates.
- **Last write wins.** If two devices edit the same session at the same moment, the later save overwrites the earlier on the fields it changed (widgets are saved whole). Reload a session before editing it on a second device.
- The header shows "Saving…", "All changes saved" or "Not saved: <reason>"; the browser warns before you leave with unsaved changes; failed saves retry three times.
- Sessions created before accounts existed (in this browser's local storage) can be moved to your account from the Sessions page.

## Templates

A template keeps: transactional settings, paired sales rules, comment options, the list and order of features (including group options and comparisons), and dataset names, per MLS and property type. It never keeps sales, results or the subject. One default per MLS and type; new sessions use it automatically. Create with "Save as template" on the results page (new, or replace the one the session started from); rename, clone, set default and delete on `/templates`.

## Setup

1. Copy `.env.example` to `.env.local`. For a hosted database, create it yourself and paste the connection string into `DATABASE_URL`. Claude does not create accounts or keys.
2. `npm install && npm run build && npm start`. The first person to open the site creates the account; after that sign up is closed unless `ALLOW_SIGNUP=true`.
3. Forgot your password: `node scripts/set-password.mjs you@example.com "new password"` (ends all logins for that account).
4. Backups: turn on your database host's daily backups and check they are enabled. For the local database copy `.data/` while the app is stopped.

## Security checklist

- [x] secrets only in env vars; `.env*` and `.data/` are gitignored; nothing secret reaches the browser
- [x] input validated on the server with zod on every route; bodies over 12 MB refused; at most 5,000 sales per dataset (checked inside a transaction)
- [x] authorization on every read and write: every query is scoped by the signed-in user's id. `lib/server/server.test.ts` proves a second user gets nothing back (read, list, patch, dataset patch, delete, templates), and the browser test did the same over HTTP (404s, empty lists)
- [x] rate limits: login (8 per 15 minutes per email and address, 40 per address), sign up (10 per hour), account deletion (5 per 15 minutes). **In memory, per server process:** if you run several instances, put a shared limiter in front.
- [x] request checks against cross-site posts: every change request must be JSON, and a mismatched Origin is refused; cookie is same-site
- [x] passwords: 10 character minimum, scrypt, constant-time compare, and a dummy hash for unknown emails so response time does not reveal which emails exist
- [x] sign out here or everywhere; account deletion deletes the account and everything under it (cascading, tested), after asking for the password again
- [x] no user data in URLs (only random ids) and none in logs (server errors log the message only, never request bodies)
- [x] webhooks: none
- [x] uploads: the CSV is read in the browser and only parsed rows are sent; no file is stored
- [ ] **email verification and password reset by email: not built** (no email provider, single-user use). Reset is the script above.
- [ ] **dependencies:** `npm audit --omit=dev` shows 2 findings, both from Next.js's bundled PostCSS (build-time, needs a hostile source map in CSS the app does not process). The fix is Next 16, a breaking upgrade; plan it separately. jsPDF was upgraded to 4.2.1 to clear its critical advisory.
- [ ] privacy policy: not needed for a private single-user tool; if others use it, list your hosting and database providers.
- [ ] HTTPS: the cookie is `secure` in production, so deploy behind HTTPS.

## Activity log
- `session_events` (migration 002): one row per event, owned by the session and the user, deleted with either. Read and written only through routes that check the session belongs to the signed-in user (`GET/POST /api/sessions/:id/events`, `POST /api/sessions/:id/clone`).
- Events hold plain values only (names, MLS numbers, amounts); never file contents. Capped at 20,000 per session and 200 per request.

## Market files
- `market_files` (migration 003): up to two files per session (competing sales and listings; a wider neighborhood file), the listings as compact JSON (up to 10,000 each), and the appraiser's conclusions and wording. Read and written only through routes that check the session belongs to the signed-in user; deleted with the session; copied by a clone.
- `GET /api/priors`: the signed-in user's own done adjustments in other sessions (same zip, within a year). Never other users'.

## AI scanning
- `POST /api/extract` sends one uploaded file to Anthropic's API with the user's own key (from the environment). The key is never written to the database or logs. Files are not stored. 15 MB limit, 40 scans per hour per user (in memory). `GET /api/dashboard` returns the signed-in user's own counts and medians only.
- Privacy: scanned files leave the computer. The screen says so before any file is chosen.
