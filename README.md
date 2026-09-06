# Papertrail

A calm, private workspace application built with Next.js and Turso/libSQL.

## Run locally

1. Create a Turso database and token (for example, with the Turso CLI):

   ```sh
   turso db create turso-next-starter
   turso db show turso-next-starter --url
   turso db tokens create turso-next-starter
   ```

2. Copy `.env.example` to `.env.local` and set the database URL, token, and a generated `AUTH_SECRET`. Set `APP_URL` to your stable production origin when deployed. For a zero-configuration local database, omit the Turso variables and use `LOCAL_DATABASE_URL=file:local.db`.
3. Install and run:

   ```sh
   npm install
   npm run db:migrate
   npm run dev
   ```

Open http://localhost:3000. `npm run db:migrate` applies every versioned database change exactly once; use `npm run db:status` to inspect what is applied.

## Authentication and security

- Email/password input is validated with Zod. Passwords must be 12–128 characters.
- Passwords are salted and hashed with Node's `scrypt` (N=16384, r=8, p=1); plaintext passwords are never stored.
- Sessions use random opaque tokens. Only their SHA-256 hashes are stored in Turso; the token is held in an `HttpOnly`, `Secure` (in production), `SameSite=Lax` cookie.
- Authentication endpoints are protected by a same-origin check and shared database rate limits (5 sign-ups/hour and 10 sign-ins/15 minutes per hashed client address). `Retry-After` is returned when limited.
- Time entries are scoped to the signed-in employee. A database-level partial unique index prevents more than one open shift per employee.
- The first account creates a workspace and becomes its administrator. Later accounts need an administrator-created, single-use, seven-day invitation token. The token is only returned on invitation creation; it is never returned by the invitation list.
- Administrators can use the protected API to list employees, create invitations, and deactivate an employee. Deactivation revokes that employee's existing sessions immediately.

## Workforce administration API

These endpoints require an authenticated administrator unless noted otherwise:

- `GET /api/admin/employees` — employee directory (administrators and managers).
- `PATCH /api/admin/employees/:userId` — change an employee role or deactivate them (administrators; cannot remove the final active administrator).
- `GET /api/admin/invitations` — invitation metadata only (administrators and managers).
- `POST /api/admin/invitations` with `{ "email": "employee@company.com", "role": "employee" }` — creates an invitation and returns its one-time token. Deliver that token through a trusted channel until email delivery is added.

Before a public launch, add verified email delivery, password-reset flows, monitoring, and an account-recovery policy appropriate to your product.

## Deploy to Vercel

The included `vercel.json` uses Vercel's Next.js build pipeline. Import this repository in Vercel, then set these encrypted environment variables for **Production**, **Preview**, and **Development**:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | Your Turso `libsql://` database URL |
| `TURSO_AUTH_TOKEN` | A Turso database auth token |
| `AUTH_SECRET` | A unique random 32-byte secret; generate it with the command in `.env.example` |

Set `APP_URL` only for the Production environment after attaching your stable custom domain (for example, `https://notes.example.com`). Preview deployments intentionally derive their origin from Vercel so their authentication flow keeps working.

Before the first production deployment, run the migrations once from a machine that has your production Turso credentials:

```sh
$env:NODE_ENV = "production"
npm run db:migrate
```

Deploy from the Vercel dashboard or run `npx vercel` after signing in. `GET /api/health` verifies runtime configuration, database connectivity, and migration availability (it returns no credentials). Never put these values in `NEXT_PUBLIC_*` variables or commit `.env.local`.
