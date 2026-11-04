# Schedio

Schedio: compose a post once, queue or schedule it, and publish it to the
social accounts a person or an organization has connected (Mastodon over
OAuth, Mention through Oxy). Bun monorepo, `packages/` layout. Identity,
organizations and permissions are Oxy's; Schedio stores Oxy ids only.

Oxy-wide rules are in `~/Oxy/AGENTS.md` and `~/Oxy/docs/`; versions are in
`package.json`, never here. Deployment is in `DEPLOYMENT.md`, the publishing
model in `docs/publishing.md`, the prelaunch hold in `docs/prelaunch.md`.

## Packages

| Path | Name | What it is |
|---|---|---|
| `packages/backend/` | `@schedio/backend` | Express API at api.schedio.app, PostgreSQL through Drizzle, plus the in-process publishing worker |
| `packages/frontend/` | `@schedio/frontend` | Expo / expo-router app (web, iOS, Android) |
| `packages/contracts/` | `@schedio/contracts` | Zod 4 wire contract; `GET /api/openapi.json` is generated from it |
| `packages/sdk/` | `@schedio/sdk` | Typed client the frontend uses |
| `packages/shared-types/` | `@schedio/shared-types` | Legacy shared types |

## Commands

```bash
bun install                                   # postinstall builds shared-types, contracts and sdk
bun run lint                                  # Biome (--error-on-warnings) + expo lint
bun run --filter @schedio/backend typecheck
bun run --filter @schedio/backend test        # PostgreSQL suites need TEST_DATABASE_URL
bun run check:openapi                         # contract freshness; generate:openapi writes it
```

Backend tests: `docker compose -f docker-compose.postgres.yml up -d`, then
`TEST_DATABASE_URL=postgres://schedio:schedio@127.0.0.1:5441/postgres` and a
64-hex `SOCIAL_TOKEN_ENCRYPTION_KEY`. Migrations: `db:generate`, then
`db:migrate -- --target-database=<name> --phase=<pre|post|all>`; CI checks
they match the schema and keep their locks short (`db:check-locks`).

## Oxy, the one way

- **One `OxyServer` per process: `packages/backend/src/oxy.ts`.** Workload
  identity (no API key), `serviceIdentity: 'when-anonymous'`, base URL from
  `OXY_API_URL`. Mention is `mentionForOxyService(oxy)`, the capability
  catalogue registration a service client of it. Never construct another one,
  and never `new OxyServices()` with a user token.
- **Edge**: `oxyTrustProxy`, `createOxySecurityHeaders`, `createOxyCors`,
  `createOxyRateLimit(oxy)`, `createOxyAuthMiddleware(oxy)` in `server.ts`.
- **Organization authority is read live, never mirrored.** `publishing/authority.ts`
  asks `oxy.accountAccessFor(req, organizationId)` with the caller's bearer:
  acting for an organization needs `account:act_as`, changing its review
  policy `account:update`. Gate on permissions, never on role names; writes
  ask `fresh`. `OxyAccessError` becomes 401 / 403 / 503 in
  `publishing/errors.ts` through `accessErrorStatus` — an outage is 503, never
  a "no", and is never cached.
- **Calls as the person** go through `oxy.withUser(req | bearer, …)`
  (`publishing/taskAuthority.ts` switches into the organization that way and
  keeps only the Oxy task id).
- **Capability tickets** (`/_oxy/capabilities/*`): `createLiveCapabilityTicketVerifier`
  with `createOxyJwksKeyResolver` and `oxy.agency.introspectCapabilityTicket`
  (`capabilities/capability-authority.ts`); invalid → 401, Oxy unreachable →
  503, Oxy no longer standing behind it → 403 and audited.
- **Outbound**: provider URLs (Mastodon instances) are caller-influenced, so
  `safeFetch` + `readResponseJson` (`publishing/network.ts`). Never `safeFetch`
  an Oxy host.
- Errors are `{ "error": { "code", "message" } }` with a code from
  `@schedio/contracts`' `ErrorCode`; the capability lane keeps the SDK's
  `{ "error": "<code>" }` shape its callers read.
