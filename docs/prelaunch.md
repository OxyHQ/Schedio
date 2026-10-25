# Prelaunch parking and eventual launch

The owner deferred Schedio's public launch on 2026-10-25. DNS and certificate
setup are launch work, not a reason to leave an old Oxy producer running.
This source change does **not** assert that the operational parking steps below
have happened. Record their actual receipts before declaring Schedio parked.

## Deployment hold

Both deploy workflows require the repository variable
`SCHEDIO_LAUNCH_ENABLED` to equal `true`, for automatic releases and manual
dispatch alike. Missing or false holds deployment. CI, package validation and
source updates such as the Alia SDK update in PR #72 remain available. Public
DNS/TLS smoke and rollback checks remain unchanged; never bypass them to call a
prelaunch deployment successful.

At the 2026-10-25 19:12 UTC readback, service `schedio` in `oxy-cluster`
(us-west-2) still ran one task from `oxy-schedio:17`, source
`f2e4589bc0b851493a3c3b71b90ca30b29d08c81`, digest
`sha256:75f1c68bea9c8cf44d5f2df5a468332ffc4aea69b2cf4c622edeadceb1b78867`.
The API process itself runs the publishing poll; there is no separate publishing
service. That image uses the old Oxy core 6 transport. There were no Application
Auto Scaling targets, policies or scheduled actions for Schedio, no EventBridge
Scheduler schedules, and none of the six EventBridge rules targeted Schedio.
Task definitions 2–26 were still active and therefore potentially launchable by
an operator. Absence of recent v1 mints does not prove those paths are disabled.

## Reviewed operator parking

1. Confirm both deployment workflows have no in-flight release, and that the
   launch variable is absent or false. Until this source hold is merged, disable
   only the two Schedio deploy workflows as a reversible operational hold; keep
   CI and unrelated workflows enabled. A historical workflow re-run can contain
   its historical code, so the binding cutoff below remains necessary.
2. Refresh read-only aggregate counts of connections, posts and deliveries. Do
   not delete records or discard leases. If work exists, preserve its original
   requester, approval revision and effect keys for a reviewed restart. Earlier
   zero counts are dated evidence, not a substitute for this check.
3. Record and compare the exact workload binding before expiring it:
   `01a14433-6e30-7ae9-b22f-172dbdd64822`, application
   `6a37b02cd55f88733615197c`, provider `aws-iam`, subject
   `arn:aws:iam::237343248947:role/oxy-schedio-task`, environment `production`.
   Its last recorded expiry was null; a fresh read is required. An operator
   changes only `expires_at` with a compare-and-set against that reviewed tuple
   and previous value. Keep the row and its provenance. Do not disable the whole
   application, revoke users' external provider grants, delete credentials or
   remove the IAM role. Expiry prevents dormant old images from minting tokens.
4. Set the existing ECS service's desired count to zero, then verify zero
   desired/running/pending tasks and no separately running task using its role.
   Save the stopped task IDs and timestamps. The worker handles SIGTERM and
   retains recoverable delivery leases. Do not delete the service, task
   definitions, database, encryption key, SSM parameters or image pins.
5. The Schedio-only infrastructure declaration records count/floor zero for a
   future recreation. The shared module ignores changes to desired count, so a
   Terraform source change alone does not stop an existing task. Apply only a
   reviewed narrow plan; no unrelated resources belong in this operation.
6. Verify the expired binding refuses minting, all Schedio launch paths are
   accounted for, and the global issuer's actual maximum token lifetime has
   drained. The currently verified limit is 300 seconds; start that interval
   after the final old producer stops and the binding cutoff is effective, not
   after an observation window with no traffic. The platform's v1 retirement is
   a separate reviewed release. Once retired, the issuer itself rejects v1 even
   if an old task definition is later started.

Read-only inventory evidence: organization scratch
`ecosystem_scope_review/schedio-prelaunch`, `runtime-readback.json` and
`workflows-readback.json`. Operational completion belongs in the platform
migration ledger with fresh receipts; this document is the procedure.

## Database maintenance while parked

The deployment hold and workload expiry do not remove database access. Reviewed
DB-only one-shots may still use `scripts/run-ecs-one-shot.sh` with an explicit
migration/diagnostic command, the service's existing network configuration and a
reviewed immutable image. Do not run `server.ts`, the publisher or catalogue
registration under the guise of maintenance. Do not restore an Oxy binding just
to perform a PostgreSQL migration. Preserve the provider-token encryption key
and external Mastodon state.

## Launch later, using protocol 2

There is no requirement to build a new image through a held deployment workflow.
An existing reviewed protocol-2 image is already available: `oxy-schedio:26`
uses digest
`sha256:eb74019bc510a3e58ddd3d0afab96cfdb43072abc8315502a81e8f7d03c2d7e1`,
tagged to source `07618821895ca7f4c5c61c5a6a23e3e4d238db38` with both a
`deployed-` tag and a retention pin. That source uses Oxy core 7.3 and the shared
own-service factories. Its attempted rollout was rolled back because the public
DNS smoke could not pass. Recheck image availability, source/CI provenance and
retention when launch is resumed; an old receipt is not a fresh image review.

1. Review current source/CI and a verified protocol-2 image, including requester
   isolation and original scheduled-task authority. Recheck current queue counts
   and apply the additive pre migrations using the DB-only path while parked.
   If this image is no longer suitable, prepare a separately reviewed image-only
   build path before lifting the hold; do not temporarily enable live deployment
   merely to obtain an image.
2. Complete the existing domain/ACM steps in `DEPLOYMENT.md` and
   `oxy-infra/terraform-uswest2/app-schedio.tf`. Keep canonical `schedio.app` and
   `api.schedio.app`, the Cloudflare-only origin restriction and public smoke.
   No purchase, nameserver change or substitute origin is implied.
3. While desired count is still zero, prepare an immutable task definition from
   that reviewed protocol-2 image with the existing role/network/secrets. Restore
   only the exact reviewed binding's prior expiry by compare-and-set after image
   and source verification. Catalogue registration and a bounded workload canary
   must use that new definition, never revision 17 or an arbitrary rollback.
4. Bootstrap the existing service to the verified new definition and desired
   count one together. Set `schedio_image_digest` to that verified protocol-2 digest and restore the
   Schedio-only declared desired count/alarm floor through review. Verify actual image digest, stable service, requester
   isolation and canonical public health. If the bootstrap fails, return to
   count zero and expire the binding again; never fall back to the v1 image.
5. Only after the reviewed bootstrap and public checks succeed, set
   `SCHEDIO_LAUNCH_ENABLED=true` and enable normal deploy workflows. Their
   subsequent builds, migrations, catalogue registration, smoke and rollback
   remain intact. A normal rollback target must now be a verified protocol-2
   release. Pin the latest published frontend SDKs through normal CI; PR #72 is
   source preparation, not launch approval.
