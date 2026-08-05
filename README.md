# DFY Dashboard

Internal Next.js + Supabase app for **Boon Vakantieverhuur** to onboard and manage "Done For You" clients.

**Fase 1** (this repo, functionally complete): public client onboarding (`/aanmelden`), magic-link login, and
an admin panel to manage clients, correct baseline measurements ("nulmeting"), log actions, and bulk-import
via CSV.

**Fase 2a** (this repo, functionally complete): admin-only PriceLabs API integration — listing
search/couple/uncouple, historical backfill, a daily sync cron job, and a nulmeting-vs-actueel overview.

**Fase 2b** (not yet built): a full client-facing dashboard (results, roadmap, todos, goals, videos,
action-log timeline). See "Fase 2" below.

## Tech stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Supabase (Postgres, Auth, RLS) via `@supabase/ssr`
- Tailwind CSS 4 + shadcn/ui components
- next-intl (single locale: `nl`)
- Resend for transactional email (welkomstmail)
- Vitest for unit + integration tests

## Local development

### Prerequisites

- Node.js 20+ (developed/tested with Node 24) and npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (Supabase's local stack runs in containers)
- A real, working [Resend](https://resend.com) API key **and** a Resend-verified sender email — these are
  **required**, not optional, for local dev. See "Onboarding requires Resend" below.

### Setup

```bash
npm install
npx supabase start   # starts local Postgres, Auth, Studio, Mailpit, etc. (requires Docker Desktop)
```

Copy the env example and fill in values:

```bash
cp .env.local.example .env.local
```

Fill `.env.local` with:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — copy these from
  the output of `npx supabase status` (`API_URL`, `ANON_KEY` / `PUBLISHABLE_KEY`, `SERVICE_ROLE_KEY` / `SECRET_KEY`)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — from your Resend account
- `NEXT_PUBLIC_BASE_URL` — `http://localhost:3000` for local dev

Apply the database schema and RLS policies:

```bash
npx supabase db reset   # applies everything in supabase/migrations/
```

Start the app:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### Onboarding requires Resend — it does not fall back to Mailpit

Mailpit (`http://127.0.0.1:54324`, from `MAILPIT_URL` in `npx supabase status`) only catches Supabase's own
built-in auth emails — in this app, that's the magic link sent by the plain `/login` re-login flow
(`signInWithOtp`). That flow does **not** need Resend.

The welkomstmail sent during onboarding is different: `sendWelkomstmail` (`src/lib/email/send-welkomstmail.ts`)
calls the real Resend API directly (`new Resend(process.env.RESEND_API_KEY)`), bypassing Supabase's mailer
entirely. It never touches Mailpit, locally or otherwise.

This matters because `createClientWithListings` (`src/lib/onboarding/create-client-with-listings.ts`) treats a
failed welkomstmail as a hard failure, not a skip: if `sendWelkomstmail` throws — e.g. because
`RESEND_API_KEY`/`RESEND_FROM_EMAIL` are missing or not verified — the whole onboarding is rolled back (the
just-created `clients` row is deleted via `delete_client_cascade` and the just-created `auth.users` row is
deleted too). So a working `RESEND_API_KEY` and a Resend-verified `RESEND_FROM_EMAIL` are **required** for any
onboarding flow — `/aanmelden`, admin "nieuw klant", or CSV import — to succeed locally. Without them,
onboarding fails outright rather than degrading gracefully.

## Testing

```bash
npm test
```

Runs Vitest. Unit tests (`tests/unit/`) are pure and have no external dependencies. Integration tests
(`tests/integration/`) exercise real Supabase queries/RLS and require the local Supabase stack to be running
(`npx supabase start`) with migrations applied (`npx supabase db reset`).

## Admin access

There is no self-service admin signup, and logging in does **not** create a `profiles` row for you — the only
place in the codebase that inserts into `profiles` is the onboarding flow
(`src/lib/onboarding/create-client-with-listings.ts`), which always inserts `role = 'klant'`. There is no
database trigger that creates a `profiles` row on signup/login either: `signInWithOtp` (used by `/login`) only
creates an `auth.users` row. So after logging in once via `/login`, you will have an `auth.users` entry but
**no** row in `profiles` — there's nothing to edit yet. `profiles` is also RLS-protected (only an existing
admin, or the row's own owner for reads, can touch it — see `supabase/migrations/20260804102114_rls_and_functions.sql`),
so the very first admin can't be self-provisioned through the app at all. To get admin access:

1. Log in once via `/login` with your email. This creates your `auth.users` entry — find its `id` in Supabase
   Studio (`http://127.0.0.1:54323` locally) under **Authentication → Users**.
2. In Studio's **Table editor** or **SQL editor** (both run with elevated privileges that bypass RLS), manually
   INSERT a new row into `profiles` with that `id` and `role = 'admin'`, e.g.:

   ```sql
   insert into profiles (id, email, naam, role)
   values ('<your-auth-user-id>', 'you@example.com', 'Jouw Naam', 'admin');
   ```

   Leave `client_id` unset (`null`) — it's only used for `role = 'klant'` rows.

## Key routes

| Route | Purpose |
|---|---|
| `/aanmelden` | Public client onboarding form |
| `/login` | Magic-link login (admin and klant) |
| `/admin/klanten` | Admin: list of all clients |
| `/admin/klanten/[id]` | Admin: client detail — nulmeting correction, actielog |
| `/admin/klanten/nieuw` | Admin: manually add a client |
| `/admin/import` | Admin: CSV bulk import (clients + actielog) |
| `/dashboard` | Klant placeholder — full dashboard is Fase 2 |

## Deployment (Railway)

Live at `dashboard.boonvakantieverhuur.nl`, deployed on Railway against a remote Supabase project.

1. Run local migrations against the remote Supabase project:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
2. In the remote Supabase project's dashboard, go to **Auth → URL Configuration** and add the production
   domain's callback URL (e.g. `https://<production-domain>/auth/callback`) to the redirect allow-list —
   magic links silently fail to redirect if the callback URL isn't allow-listed.
3. Set the following environment variables on the main Railway service, pointing at the **remote** Supabase
   project (not local):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `NEXT_PUBLIC_BASE_URL` (the production domain, e.g. `https://<production-domain>`)
   - `PRICELABS_API_KEY` — required for the PriceLabs-koppeling feature (listing search/couple, manual
     "sync nu"); without it, coupling a listing or clicking "sync nu" fails with a clear
     `PRICELABS_API_KEY ontbreekt` error rather than a cryptic PriceLabs 401.
4. Deploy. Railway builds with `npm run build` and serves with `npm run start`.
5. **Second Railway service, for the daily PriceLabs sync cron job**: create a new service in the same
   Railway project, pointed at the same GitHub repo.
   - **Start Command:** `npm run sync:pricelabs` (equivalently `npx tsx scripts/sync-pricelabs-cron.ts`)
   - **Cron Schedule:** e.g. `0 3 * * *` (dagelijks 03:00 UTC) — Railway's native cron scheduling, minimum
     interval 5 minutes, skips a run if the previous one is still executing.
   - **Variables:** copy `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PRICELABS_API_KEY`
     from the main service (or use Railway's shared variables). This service does **not** need
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_*`, or `NEXT_PUBLIC_BASE_URL` — the cron script uses only the
     service-role Supabase client and the PriceLabs API, never the Next.js app itself.

## Fase 2 (partially built)

- ✅ PriceLabs API integration and listing-koppeling (admin-only: search/couple/uncouple a listing,
  historical backfill on coupling, daily cron sync, manual "sync nu", nulmeting-vs-actueel overview)
- Full client-facing dashboard: results, roadmap, todos, goals, videos, actielog timeline — not yet built
