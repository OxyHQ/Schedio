# Deploying Schedio

Production runs on Oxy's AWS account, declared in `oxy-infra`
(`terraform-uswest2/app-schedio.tf` and `iam-schedio-deploy.tf`):

- API: ECS service `schedio` on `oxy-cluster` behind the shared ALB at
  `https://api.schedio.app`, task role `oxy-schedio-task`.
- Database: `schedio` on the shared `oxy-postgres`, owned by role `schedio`.
- Web: the `schedio` Cloudflare Worker at `https://schedio.app`.

`.github/workflows/deploy-aws.yml` releases the API after CI passes on `main`:
it builds the arm64 image, derives a task definition from the running one with
only the image changed, applies the `pre` migrations as a one-shot, rolls the
service, registers the capability catalog with Oxy, smokes `/api/health` and
rolls back on failure. `.github/workflows/deploy-cloudflare.yml` exports and
deploys the web app the same way.

Images are immutable: the deploy pushes `oxy/schedio:<sha>` (never `:latest`)
and every revision it registers names its image by digest. Before it changes
anything it pins the rollback target, the running release at the digest its
tasks pulled (`scripts/pin-ecs-rollback-target.sh`), and tags it and the new
image `deployed-<sha>` so ECR's lifecycle policy keeps them. A failed release
therefore returns to exactly the image that was serving, never to a tag that
has since moved.

## Required configuration

Environment and secrets are owned by `oxy-infra`, never by this repository or
GitHub. The backend refuses to start without:

- `DATABASE_URL`: SSM `/oxy/schedio/DATABASE_URL`.
- `SOCIAL_TOKEN_ENCRYPTION_KEY`: 64 hexadecimal characters representing a
  32-byte AES-256-GCM key, SSM `/oxy/schedio/SOCIAL_TOKEN_ENCRYPTION_KEY`.
  Rotating it orphans every stored provider connection.

The task also sets `NODE_ENV=production`, `PORT=8080`,
`OXY_API_URL=https://api.oxy.so`, `FRONTEND_URL=https://schedio.app` and
`SOCIAL_OAUTH_REDIRECT_URI=https://schedio.app/accounts`. Schedio holds no Oxy
key pair: it attests `oxy-schedio-task`, which Oxy binds to the Schedio
application (oxy ADR 0026).

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
