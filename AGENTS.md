# Schedio

Compose a post once, queue or schedule it, and publish it to connected social
accounts (Mastodon over OAuth, Mention through Oxy). Bun monorepo. Identity,
organizations and permissions are Oxy's; Schedio stores Oxy ids only.

## Commands

```bash
bun install                                   # postinstall builds shared-types, contracts and sdk
bun run dev                                   # all workspaces (dev:frontend / dev:backend for one)
bun run lint                                  # Biome (--error-on-warnings) + expo lint
bun run typecheck
bun run --filter @schedio/backend test        # PostgreSQL suites need TEST_DATABASE_URL
bun run check:openapi                         # contract freshness; generate:openapi writes it
bun run check:publishing-artifacts
docker compose -f docker-compose.postgres.yml up -d   # local test database
```

Migrations: `bun run --filter @schedio/backend db:generate`, then
`db:migrate -- --target-database=<name> --phase=<pre|post|all>`.

## Map

- `packages/backend` Express API and in-process publishing worker (Drizzle/PostgreSQL)
- `packages/frontend` Expo app (web, iOS, Android)
- `packages/contracts` Zod wire contract; the OpenAPI document is generated from it
- `packages/sdk` typed client; `packages/shared-types` is legacy
- Publishing model: [docs/publishing.md](docs/publishing.md); deploy: [DEPLOYMENT.md](DEPLOYMENT.md)

## Conventions

- Versions live in `package.json`, not in docs, so they cannot drift.
- Use the single `OxyServer` in `packages/backend/src/oxy.ts`; the full rules
  are in [docs/oxy-integration.md](docs/oxy-integration.md).
- Gate on Oxy permissions, never role names, and read organization authority
  live: mirroring it goes stale.
- Fetch caller-influenced URLs (Mastodon instances) with `safeFetch`; never
  `safeFetch` an Oxy host.
- API errors are `{ "error": { "code", "message" } }` using `ErrorCode` from `@schedio/contracts`.

## Boundaries

- Never construct a second `OxyServer` or `new OxyServices()` with a user token: identity must stay workload-bound.
- Never cache an Oxy outage as a denial; it is a 503.
- Never publish to npm from a laptop; see the npm releases doc.
- Ask first before changing the OpenAPI contract shape or migration order: clients and deploys depend on them.
- Schedio is prelaunch ([docs/prelaunch.md](docs/prelaunch.md)); red deploy smokes are expected.

## Testing

- Backend change: run backend `typecheck` and `test`, then `bun run lint`.
- Contract change: `bun run check:openapi`. Migration change: CI runs `db:check-locks` (short locks) and a schema match check.
- Done means lint, typecheck and the relevant tests pass locally and CI is green.
- Backend tests need `TEST_DATABASE_URL=postgres://schedio:schedio@127.0.0.1:5441/postgres` and a 64-hex `SOCIAL_TOKEN_ENCRYPTION_KEY`.

## PRs and commits

- Branch from `main`, open a PR, squash merge; CI in `.github/workflows/ci.yml` is the gate.
- Keep commits focused; do not mix docs and behaviour changes.

## Secrets

Never print or commit `*_DATABASE_URL`, `SOCIAL_TOKEN_ENCRYPTION_KEY` or provider tokens. Deployment secrets are described in [DEPLOYMENT.md](DEPLOYMENT.md); local values come from your own env.

## Links

- [Oxy engineering standards](https://github.com/OxyHQ/oxy/blob/main/docs/engineering/standards.md)
- [Lint and format](https://github.com/OxyHQ/oxy/blob/main/docs/engineering/lint-and-format.md)
- [Build and runtime traps](https://github.com/OxyHQ/oxy/blob/main/docs/engineering/build-and-runtime-traps.md)
- [Gate writing](https://github.com/OxyHQ/oxy/blob/main/docs/engineering/gate-writing.md)
- [npm releases](https://github.com/OxyHQ/oxy/blob/main/docs/npm-releases.md)
- [Application roles](https://github.com/OxyHQ/oxy/blob/main/docs/auth/application-roles.md)
- [Bloom app conventions](https://github.com/OxyHQ/Bloom/blob/main/docs/app-conventions.mdx)

Owner: Nate Isern (OxyHQ). Last reviewed: 2026-11-11.
