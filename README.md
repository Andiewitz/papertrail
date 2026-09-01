# Turso Next.js starter

A serverless Next.js App Router starter with a small notes CRUD API backed by Turso/libSQL.

## Run locally

1. Create a Turso database and token (for example, with the Turso CLI):

   ```sh
   turso db create turso-next-starter
   turso db show turso-next-starter --url
   turso db tokens create turso-next-starter
   ```

2. Copy `.env.example` to `.env.local` and set the database URL, token, and a generated `AUTH_SECRET`. Set `APP_URL` to your stable production origin when deployed.
3. Install and run:

   ```sh
   npm install
   npm run dev
   ```

Open http://localhost:3000. The first request creates the tables. This starter assumes a fresh database; for an existing database, introduce versioned migrations before deployment.

## Authentication and security

- Email/password input is validated with Zod. Passwords must be 12–128 characters.
- Passwords are salted and hashed with Node's `scrypt` (N=16384, r=8, p=1); plaintext passwords are never stored.
- Sessions use random opaque tokens. Only their SHA-256 hashes are stored in Turso; the token is held in an `HttpOnly`, `Secure` (in production), `SameSite=Lax` cookie.
- Authentication endpoints are protected by a same-origin check and shared database rate limits (5 sign-ups/hour and 10 sign-ins/15 minutes per hashed client address). `Retry-After` is returned when limited.
- Notes are scoped to the signed-in user at query time.

Before a public launch, add email verification, password-reset flows, monitoring, and an account-recovery policy appropriate to your product.

## Deploy to Vercel

The included `vercel.json` uses Vercel's Next.js build pipeline. Import this repository in Vercel, then set these encrypted environment variables for **Production**, **Preview**, and **Development**:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | Your Turso `libsql://` database URL |
| `TURSO_AUTH_TOKEN` | A Turso database auth token |
| `AUTH_SECRET` | A unique random 32-byte secret; generate it with the command in `.env.example` |

Set `APP_URL` only for the Production environment after attaching your stable custom domain (for example, `https://notes.example.com`). Preview deployments intentionally derive their origin from Vercel so their authentication flow keeps working.

Deploy from the Vercel dashboard or run `npx vercel` after signing in. Never put any of these values in `NEXT_PUBLIC_*` variables or commit `.env.local`.
