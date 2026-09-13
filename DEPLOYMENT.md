# Deploying Schedio

Schedio's runtime uses PostgreSQL. Production provisioning belongs in `oxy-infra`;
this repository does not carry a provider-specific deployment template.

## Required configuration

The backend refuses to start without both values:

- `DATABASE_URL`: PostgreSQL connection URL supplied by the managed database.
- `SOCIAL_TOKEN_ENCRYPTION_KEY`: 64 hexadecimal characters representing a
  32-byte AES-256-GCM key, stored as a platform secret.

Also configure `NODE_ENV=production`, `PORT=8080`, `FRONTEND_URL` and the Oxy
authentication settings required by `@oxy.so/core`. Do not commit values.

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

## Verification

After a deployment, prove the exact commit/image is running and complete the six
runtime probes in the cutover runbook. A healthy empty response is not evidence
that migrated data is readable; use known non-empty ids and compare content as
well as counts.
