# DFY Dashboard

Internal Next.js + Supabase app for **Boon Vakantieverhuur** to onboard and manage "Done For You" clients.

**Fase 1** (this repo, functionally complete): public client onboarding (`/aanmelden`), magic-link login, and
an admin panel to manage clients, correct baseline measurements ("nulmeting"), log actions, and bulk-import
via CSV.

**Fase 2** (not yet built): PriceLabs API integration (listing sync), a full client-facing dashboard
(results, roadmap, todos, goals, videos, action-log timeline), and scheduled sync jobs. See "Fase 2" below.

## Tech stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript
- Supabase (Postgres, Auth, RLS) via `@supabase/ssr`
- Tailwind CSS 4 + shadcn/ui components
- next-intl (single locale: `nl`)
- Resend for transactional email (welkomstmail)
- Vitest for unit + integration tests

## Local development

### Prerequisites

- Node.js (see `package.json` for engine requirements) and npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running (Supabase's local stack runs in containers)
- A [Resend](https://resend.com) API key (for sending real email locally you'd need this; the local Supabase
  stack itself uses Mailpit for auth emails, see below)

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

Local auth emails (magic links, welkomstmail if not using a real Resend send) land in **Mailpit**, not your
inbox — check `MAILPIT_URL` from `npx supabase status` (typically `http://127.0.0.1:54324`).

## Testing

```bash
npm test
```

Runs Vitest. Unit tests (`tests/unit/`) are pure and have no external dependencies. Integration tests
(`tests/integration/`) exercise real Supabase queries/RLS and require the local Supabase stack to be running
(`npx supabase start`) with migrations applied (`npx supabase db reset`).

## Admin access

There is no self-service admin signup. To get admin access:

1. Log in once via `/login` with your email (this creates your `profiles` row via the auth flow).
2. Open Supabase Studio (`http://127.0.0.1:54323` locally) and manually set `role = 'admin'` on your row in
   the `profiles` table.

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

> **TODO — not done yet.** The remote Supabase project for this app does not exist yet. Nothing below has
> been executed; this is the plan for when that project is created in a later session.

1. Create the remote Supabase project, then run the local migrations against it:
   ```bash
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
2. In the remote Supabase project's dashboard, go to **Auth → URL Configuration** and add the production
   domain's callback URL (e.g. `https://<production-domain>/auth/callback`) to the redirect allow-list.
   (This was a real gap found during local dev too — magic links silently fail to redirect if the callback
   URL isn't allow-listed — so production will need the equivalent.)
3. Create a new Railway project connected to this GitHub repo.
4. Set the following environment variables in Railway, pointing at the **remote** Supabase project (not
   local):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `NEXT_PUBLIC_BASE_URL` (the production domain, e.g. `https://<production-domain>`)
5. Deploy. Railway builds with `npm run build` and serves with `npm run start`.

## Fase 2 (out of scope for this repo's current state)

- PriceLabs API integration and listing-koppeling
- Scheduled sync jobs (PriceLabs → local cache)
- Full client-facing dashboard: results, roadmap, todos, goals, videos, actielog timeline
