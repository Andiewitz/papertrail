# Papertrail production plan

## Audit snapshot — 2026-09-06

The employee timekeeping flow has server-side authentication, password hashing, opaque sessions, origin checks, database-backed rate limits, and an idempotent clock-in/out API. The main gaps before calling it a finished production product are organization controls, migrations, operations, and automated delivery.

| Priority | Finding | Completion action |
| --- | --- | --- |
| P0 | No automated test suite or GitHub workflow existed. | Added integration coverage and CI in this change. Make the CI check required on `main`. |
| P0 | Tables are created during application requests. | Replace runtime DDL with versioned migrations and a deploy-time migration job. |
| P0 | Production database and auth configuration is manual and failures are hard to observe. | Add a non-secret health check, structured logs, error monitoring, and a deployment smoke test. |
| P1 | Any registered user is an employee; there are no organizations, roles, or manager controls. | Add organizations, memberships, `employee`/`manager`/`admin` roles, and authorization policies. |
| P1 | Attendance has no break, correction, approval, or time-zone policy. | Model shifts, breaks, adjustments, approvals, and organization-level time zone/workweek settings. |
| P1 | Notes APIs remain from the starter application. | Remove them or finish and explicitly scope them; do not retain an unsupported parallel feature. |
| P1 | `npm audit --omit=dev` reports Next/PostCSS advisories. | Upgrade Next in a dedicated compatibility branch, then rerun production and browser regression tests. |
| P2 | No observability, retention, export, or support operations. | Add audit events, CSV exports, data-retention rules, incident playbooks, and backup/restore drills. |

## Definition of done

Papertrail is ready for a real employee pilot when an admin can invite an employee, the employee can safely record a shift and break, a manager can review/correct/approve the timecard, every change is auditable, and a protected release pipeline tests and deploys without direct production edits.

## Delivery phases

### Phase 1 — operational foundation

1. Add migration tooling and move all `CREATE TABLE` statements out of request handling.
2. Validate required production environment variables at startup or via a protected health check.
3. Add structured request IDs and error monitoring; never log passwords, tokens, or raw session cookies.
4. Configure Turso backups, least-privilege database tokens, and token rotation.
5. Make the GitHub CI workflow required before merging into `main`.

### Phase 2 — workforce model

1. Introduce `organizations`, `memberships`, and role-based authorization.
2. Replace public registration with admin invitations and verified-email acceptance.
3. Add an admin employee directory, deactivation flow, and session revocation.
4. Implement password reset and account recovery without weakening rate limits.

### Phase 3 — timekeeping rules

1. Add explicit break start/end records and calculate paid versus unpaid duration.
2. Store organization time zone, workweek start, and payroll period boundaries on the server.
3. Support missed-punch correction requests with manager approval and immutable audit events.
4. Add manager views for daily attendance, exceptions, approvals, and CSV export.
5. Define policy for overnight shifts, duplicate punches, edits after approval, and device/network restrictions.

### Phase 4 — production quality

1. Add unit tests for policy and duration calculations, then browser tests for key user flows.
2. Add accessibility review: keyboard flow, visible focus, color contrast, reduced motion, and screen-reader labels.
3. Add performance budgets and production smoke tests after deployment.
4. Write support runbooks for login failures, database token rotation, payroll disputes, and outage recovery.

## Release gates

- CI passes lint, type checking, production build, and integration flow.
- Required Vercel environment variables exist in the target environment.
- Migration has completed and a backup point exists.
- Deployment smoke test passes against the deployed URL.
- No unreviewed P0 security or dependency advisory remains.
