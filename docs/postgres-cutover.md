# Schedio PostgreSQL cutover

This runbook is deliberately separate from deployment. The repository now has a
PostgreSQL-only runtime, but no production data was inspected, exported, imported
or deleted as part of the code change. A cutover is complete only after the
source counts and hashes below have been captured and the same counts have been
verified in PostgreSQL.

## Safety properties

- Existing document ids are copied verbatim into `text` primary keys. The import
  never orders by a name and never invents a replacement id.
- The importer validates every JSONL file against a manifest containing its
  exact row count and SHA-256 before it opens PostgreSQL.
- All eight tables are imported in one transaction. The importer refuses a
  non-empty target and rolls the entire transaction back on a parse, constraint,
  foreign-key or count mismatch.
- Social-account access and refresh tokens are encrypted with AES-256-GCM before
  insertion. They are not returned by the API.
- The old store remains untouched until a separately approved retirement after
  the PostgreSQL deployment has been observed and reconciled.

## 1. Prepare without changing production

Provision a PostgreSQL 17 database and a 32-byte random
`SOCIAL_TOKEN_ENCRYPTION_KEY`, represented as exactly 64 hexadecimal characters.
Do not place either value in this repository.

Apply the additive schema while naming the expected database independently of
the connection URL:

```bash
export DATABASE_URL='postgres://.../schedio'
bun run --cwd packages/backend db:migrate --target-database=schedio --phase=pre --dry-run
bun run --cwd packages/backend db:migrate --target-database=schedio --phase=pre
```

The target database name in production must be read from the provisioned
resource; `schedio` above is an example, not a production fact.

## 2. Freeze writes and export the legacy source

Schedule a maintenance window and stop every Schedio writer before export. The
old service selected `schedio-production` when `NODE_ENV=production`; confirm
that exact database exists on the legacy host before exporting it. Record the
whole-host database listing and the eight collection counts in the change
record. An empty count must be recorded as `0`, not omitted.

With the legacy connection string supplied only to the vendor CLI, export
canonical Extended JSON, one document per line:

```bash
export LEGACY_DATABASE_URL='read-from-the-approved-secret-store'
export SCHEDIO_EXPORT_DIR='/absolute/private/path/schedio-export'
install -d -m 700 "$SCHEDIO_EXPORT_DIR"
for collection in blocks posts postanalytics publishingschedules restricts socialaccounts userbehaviors usersettings; do
  mongoexport \
    --uri="$LEGACY_DATABASE_URL" \
    --db=schedio-production \
    --collection="$collection" \
    --jsonFormat=canonical \
    --out="$SCHEDIO_EXPORT_DIR/$collection.jsonl"
done
bun run --cwd packages/backend db:build-import-manifest \
  --source-dir="$SCHEDIO_EXPORT_DIR" \
  --source-database=schedio-production
chmod 600 "$SCHEDIO_EXPORT_DIR"/*
```

Copy the manifest's counts and hashes to the reviewed change record. Do not
commit the export, manifest or credentials.

## 3. Import and reconcile

Point `DATABASE_URL` at the empty, migrated target and set the encryption key in
the shell from the approved secret store. Then run:

```bash
bun run --cwd packages/backend db:import-legacy \
  --source-dir="$SCHEDIO_EXPORT_DIR" \
  --target-database=the-reviewed-target-name
```

The command exits non-zero without committing if the target is non-empty or any
source/target count differs. After it succeeds, independently query all eight
PostgreSQL tables and compare their exact counts with `manifest.json`. Also
verify at least one known row from each non-empty table by id and content; equal
counts alone do not prove identity.

## 4. Switch and verify

Configure the service with the reviewed `DATABASE_URL` and
`SOCIAL_TOKEN_ENCRYPTION_KEY`, deploy the exact reviewed commit, and verify:

1. `/api/health` is 200 and the process remains stable.
2. An authenticated settings read returns a seeded, non-empty user's values.
3. A known post is readable only by its owner.
4. Queue and analytics reads return the imported rows for known ids.
5. Social-account reads contain no access or refresh token fields.
6. A new write and read-back succeed, and table counts change by the expected
   amount.

If verification fails, stop the new writer before restoring the old service so
the two stores never accept concurrent writes. Retain both stores and the export
until reconciliation is complete. Deleting the old database is a separate,
explicitly approved destructive operation and is not part of this runbook.
