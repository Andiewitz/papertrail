# CI/CD and serverless test strategy

## What is implemented now

`npm run verify` runs four checks:

1. ESLint.
2. TypeScript without emit.
3. A Next.js production build.
4. An integration runner that starts the app on a random local port with an isolated SQLite database.

The integration flow verifies anonymous access is denied, registration and session cookies work, a shift can be clocked in, duplicate requests are idempotent, the same shift can be clocked out, history is correct, cross-origin writes are denied, and sign-out invalidates the session.

The test database is created in a unique operating-system temporary directory and removed after each run. It never touches `local.db` or Turso.

## GitHub Actions

The `CI` workflow runs for pull requests and pushes to `main` with Node 22 and a clean `npm ci` install. Configure the repository’s branch protection so `Lint, type-check, build, and integration test` is required before merging into `main`.

## Continuous deployment

Use the existing Vercel Git integration as the deployment mechanism:

- Pull requests receive Preview deployments after CI begins.
- Merges into protected `main` create a Production deployment.
- Vercel must receive `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `AUTH_SECRET` in the matching environment.

Do not add a second GitHub Actions Vercel deploy workflow while the Vercel Git integration is enabled; it would create duplicate deployments. If the Git integration is removed later, create a separate deploy workflow using `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` as GitHub secrets.

## Next test layers

| Layer | Scope | Tooling |
| --- | --- | --- |
| Unit | Duration, pay-period, approval, and policy functions | Node test runner or Vitest |
| Integration | Route handlers plus a real local SQLite database | Current `scripts/integration-test.mjs` |
| Browser | Login, clock-in/out, corrections, manager approval | Playwright |
| Deployment smoke | Production/Preview health and one non-destructive route | Vercel deployment URL + authenticated test tenant |
| Security | Dependency scan, auth rate-limit/origin regressions, secret scan | npm audit, GitHub secret scanning, CI checks |

## Deployment smoke-test policy

Before testing real production attendance data, create a dedicated non-production Turso database and CI test tenant. The smoke test must create and delete only that tenant’s data. Never point automated destructive tests at the live production database.
