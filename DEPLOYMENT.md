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

## Schema

The target database name is read from the provisioned resource and reviewed
independently of the connection URL. The migrator has no implicit phase or target:

```bash
bun run --cwd packages/backend db:migrate \
  --target-database=the-reviewed-target-name \
  --phase=pre \
  --dry-run
```

Remove `--dry-run` only in an approved change window after the output has been
reviewed.

## Verification

After a deployment, prove the exact commit/image is running, then verify:

1. `/api/health` is 200 and the process remains stable.
2. An authenticated settings read returns a known, non-empty user's values.
3. A known post is readable only by its owner.
4. Queue and analytics reads return rows for known ids.
5. Social-account reads contain no access or refresh token fields.
6. A new write and read-back succeed.

A healthy empty response is not evidence that stored data is readable; use known
non-empty ids and compare content as well as counts.
