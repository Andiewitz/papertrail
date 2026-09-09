# Turso Read/Write Optimization Plan

## Goal

Make Papertrail feel immediate while preserving the serverless security model: database-backed session revocation, Collab authorization, and idempotent timekeeping. Optimize the normal single-workspace path first; do not weaken checks merely to remove a query.

## Baseline

| Flow | Current database work | Main issue |
| --- | --- | --- |
| Fresh authenticated page | Session read, then workspace-list read | The browser previously made a third workspace request; server hydration now removes that extra client request. |
| Dashboard | One 28-day time-summary read | The result is computed from one row per entry after breaks are aggregated. It is accurate but re-runs on every dashboard mount. |
| Workspace, member | Session/permission read, time-history read, member-directory read | The directory is fetched even when a Member has not asked to see it. |
| Clock action | Permission read, state read(s), write, read-back | Correct and idempotent, but the normal success path can use fewer round trips. |
| Sign in/sign up | Rate-limit cleanup write, rate-limit upsert, auth reads/writes | Expired rate-limit cleanup runs on every authentication attempt. |

## Principles

1. Keep session, membership, and role checks database-backed. A token or in-memory shortcut must not bypass revocation, deactivation, or a role change.
2. Cache only in the signed-in browser process. Do not put user time data in public HTTP/CDN caches or `localStorage`.
3. Invalidate deliberately after a timekeeping write; never make users wait for a dashboard cache to expire after clocking in or out.
4. Optimize normal successful requests first. Preserve detailed, specific errors on conflict/fallback paths.
5. Keep calendar-day metrics timezone-correct. SQLite does not understand IANA timezone/DST rules, so avoid replacing that calculation with a deceptively cheap UTC aggregate.

## Phase 1 — Remove avoidable reads from navigation

### 1.1 Bootstrap one workspace with the session

Replace the root layout's separate `currentUser()` and `listCollabs()` calls with a single bootstrap query that returns the session user and their primary active workspace. This matches the one-workspace product model.

- Return `user`, `workspace`, and the role in one query.
- Use the existing session expiry semantics; delete an expired session only when one is found.
- Keep the existing full list helper only for migration/admin compatibility until old multi-workspace data is retired deliberately.

Expected result: one server-side read on a fresh authenticated load instead of two, and no client-side workspace read in the normal case.

### 1.2 Keep navigation data in memory

Extend the dashboard context with a small per-session cache:

- `workspace` stays resident for the lifetime of the shell.
- `dashboardStats` has a 30–60 second freshness window.
- `timeEntries` is keyed by the single workspace and retained while navigating Dashboard ↔ Workspace ↔ Settings.
- Clear all cached data on sign-out, session expiry, workspace rename, or membership deactivation.

Use React state/context only. Do not use `localStorage`, browser disk cache, or a shared serverless global cache for personal time records.

### 1.3 Fetch the directory only when it is needed

- Admin dashboard: load the directory because the people summary is visible.
- Co-admin/member workspace: load it only after the user opens Members.
- Avoid fetching Inbox data until Inbox has real data to show.

Expected result: a member opening Workspace avoids one directory read.

## Phase 2 — Make dashboard reads bounded and purposeful

### 2.1 Split active-shift lookup from history lookup

The current dashboard query uses `clock_out IS NULL OR clock_in >= ?`, which is harder for an index to satisfy efficiently.

- Query the active shift by `(collab_id, user_id)` using the existing partial open-shift index.
- Query the 28-day completed history by `(user_id, clock_in)`.
- Merge the two small result sets in the route.

Add a migration only if measurements show it is needed:

```sql
CREATE INDEX IF NOT EXISTS time_entries_user_open_idx
ON time_entries(user_id)
WHERE clock_out IS NULL;
```

For the single-workspace dashboard, prefer the existing `(collab_id, user_id)` open-shift index instead of adding a redundant index prematurely.

### 2.2 Preserve timezone-correct daily averages

Keep the 28-day result bounded to one row per time entry with break time aggregated in SQL. Calculate local calendar-day grouping in server JavaScript using the browser's IANA timezone.

Do not use `date(..., 'unixepoch')` as a substitute: it reports UTC dates and can assign a late-night shift to the wrong day for the employee.

If profiling later proves this route is expensive, introduce a stored workspace timezone and a materialized daily-summary table. That is a later design decision because it trades each clock action for another write.

### 2.3 Revalidate instead of refetching on every dashboard visit

- Serve dashboard stats from the in-memory cache immediately when fresh.
- Revalidate in the background after the freshness window.
- On clock-in, clock-out, break-start, or break-end, update/invalidate both time-entry and dashboard-stat caches before showing the success notice.

Expected result: repeated Dashboard ↔ Workspace navigation produces zero new stats reads unless data changed or the freshness window elapsed.

## Phase 3 — Reduce normal timekeeping write-path round trips

### 3.1 Keep database constraints as the source of truth

Retain:

- The partial unique open-shift index.
- The partial unique open-break index.
- Conditional `WHERE clock_out IS NULL` / `WHERE ended_at IS NULL` writes.
- Idempotent fallback behavior for retried requests.

### 3.2 Use conditional write statements with `RETURNING`

For successful clock actions, express validation in the write predicate where possible:

- Clock out only when an open shift exists and no open break exists.
- Start a break only when an open shift exists and no open break exists.
- End a break only when an open break exists for the active shift.

Normal success should become:

1. Membership/permission read.
2. One conditional write with `RETURNING`.

Only a no-row result performs follow-up reads to distinguish “not clocked in,” “break still active,” and idempotent retry cases. This preserves current useful errors without charging every successful action for every edge-case check.

### 3.3 Return the updated entry without an additional broad history query

Keep the current single-entry `withBreaks` read only where a response needs break detail. For simple completed actions, return the `RETURNING` row and update the client cache locally; refresh the full history only on conflict or explicit refresh.

## Phase 4 — Lower incidental auth writes

### 4.1 Stop global rate-limit cleanup on every auth attempt

`enforceRateLimit()` currently deletes all expired rate-limit records before every upsert.

- Keep the atomic rate-limit upsert.
- Remove global cleanup from the request path.
- Add `scripts/prune-rate-limits.mjs` for the Debian maintenance schedule already used for backups, for example daily after the backup succeeds.

This removes an unbounded write from sign-in/sign-up while keeping rate-limit correctness. Stale rows are harmless until the maintenance job removes them.

### 4.2 Keep low-frequency writes simple

Do not optimize profile edits, invitation creation, role changes, or workspace renames before measuring them. They are infrequent and their current transactional behavior is clearer than a more clever version.

## Measurement and acceptance criteria

Before and after each phase, record:

- Vercel function duration and invocation count.
- Turso query/read/write counts for a fixed test scenario.
- Browser navigation timing on a warm production deployment, not first-load development compilation.

Add integration coverage for:

1. Bootstrap returns only the signed-in user’s active workspace.
2. A member opening Workspace does not request the directory until Members is opened.
3. Dashboard cache is used on repeat navigation and invalidated after every clock/break action.
4. Clock action retries remain idempotent and specific conflict messages remain intact.
5. Rate limiting still resets correctly after expiry without in-request table cleanup.

Target outcomes:

- Warm Dashboard/Settings navigation: no Turso read caused solely by workspace discovery.
- Member Workspace entry: no directory read unless requested.
- Repeat Dashboard navigation within the freshness window: zero dashboard-stat reads.
- Normal successful time action: at most one authorization read and one conditional write; extra reads only for an edge case.
- No user-scoped data stored in public/shared caches.

## Rollout order

1. Implement bootstrap + in-memory dashboard cache.
2. Add lazy directory loading and verify navigation behavior.
3. Refactor timekeeping conditional writes with expanded idempotency tests.
4. Add the rate-limit pruning script to the Debian maintenance schedule.
5. Measure production behavior for a week before considering daily-summary materialization or new indexes.
