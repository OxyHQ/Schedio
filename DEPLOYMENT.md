# Deploying Schedio

Schedio's first-party runtime is PostgreSQL-only. The checked-in DigitalOcean
spec describes the desired service and database resources; it does not perform a
production deployment by itself, and merging a code change is not authorization
to create, migrate or delete production data.

## Required configuration

The backend refuses to start without both values:

- `DATABASE_URL`: PostgreSQL connection URL supplied by the managed database.
- `SOCIAL_TOKEN_ENCRYPTION_KEY`: 64 hexadecimal characters representing a
  32-byte AES-256-GCM key, stored as a platform secret.

Also configure `NODE_ENV=production`, `PORT=8080`, `FRONTEND_URL` and the Oxy
authentication settings required by `@oxyhq/core`. Do not commit values.

## Build and start

The repository uses Bun and tracks `bun.lock`:

```bash
bun install --frozen-lockfile
bun run build:backend
bun run start:backend
```

The frontend build is:

```bash
bun install --frozen-lockfile
bun run build:frontend
```

## Schema and existing data

Use [docs/postgres-cutover.md](docs/postgres-cutover.md) before changing any live
service configuration. It requires an independently reviewed target database
name, an additive migration, a write freeze, source hashes and counts, an
all-or-nothing import into an empty target, row-content reconciliation and a
verified rollback boundary.

The migrator has no implicit phase or target:

```bash
bun run --cwd packages/backend db:migrate \
  --target-database=the-reviewed-target-name \
  --phase=pre \
  --dry-run
```

Remove `--dry-run` only in an approved change window after the output has been
reviewed.

## DigitalOcean App Platform

`.do/app.yaml` builds with Bun, injects the managed PostgreSQL connection into
the backend and keeps the social-token key out of source control. Add that key
as an encrypted secret in App Platform before starting the backend.

Apply the spec only after reviewing the live app diff:

```bash
doctl apps spec validate .do/app.yaml
doctl apps update the-reviewed-app-id --spec .do/app.yaml
```

Do not infer an app id from its display name. Resolve and review the exact target
before the update.

## Verification

After a deployment, prove the exact commit/image is running and complete the six
runtime probes in the cutover runbook. A healthy empty response is not evidence
that migrated data is readable; use known non-empty ids and compare content as
well as counts.
