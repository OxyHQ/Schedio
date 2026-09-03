# Deploying Schedio

Schedio's first-party runtime is PostgreSQL-only. The checked-in DigitalOcean
spec is a fail-closed service template: it deliberately does not name or create
a production database resource. Merging a code change is not authorization to
create, migrate or delete production data.

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

`.do/app.yaml` builds with Bun and declares value-less runtime slots for the
PostgreSQL connection and social-token key. Before proposing the production
spec, start from the exact app's current rendered spec, attach the exact,
already provisioned and backfilled PostgreSQL component, and bind
`DATABASE_URL` to that component. Do not reuse the legacy Mongo component name
or mutate its engine in place. Inject the new token key once and preserve the
encrypted `EV[...]` value App Platform returns on every later update. The
checked-in template is intentionally not deployable as a functioning backend:
startup fails closed until both values exist.

Validate the checked-in template structurally, but never apply that value-less
file directly to production. Materialize a private rendered spec from the exact
app's current spec, preserve its encrypted secret value, review the proposed
diff, then apply that private file:

```bash
doctl apps spec validate .do/app.yaml
export SCHEDIO_RENDERED_SPEC_PATH=/absolute/private/path/schedio-app.rendered.yaml
doctl apps update the-reviewed-app-id --spec "$SCHEDIO_RENDERED_SPEC_PATH"
```

Do not infer an app id from its display name. Resolve and review the exact target
before exporting or updating its spec, and keep the private rendered file out of
the repository. Disable that exact app's automatic deploy before merging this
runtime branch; merging while the legacy service still watches `main` can start
the PostgreSQL binary before schema, data and secrets are ready.

## Verification

After a deployment, prove the exact commit/image is running and complete the six
runtime probes in the cutover runbook. A healthy empty response is not evidence
that migrated data is readable; use known non-empty ids and compare content as
well as counts.
