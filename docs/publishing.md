# Mention and Mastodon publishing

Schedio owns drafts, schedule order, approval revisions and delivery receipts. Connected providers own their published posts. A successful delivery stores its provider URL; Schedio never reports success before receiving a validated provider response.

The Accounts, Compose and Queue screens use `@schedio/sdk`. The canonical zod 4 schemas and route registry live in `packages/contracts`; `GET /api/openapi.json` serves the generated contract. Run `bun run generate:openapi` after changing contracts; CI checks freshness. Lists of posts use scope-bound keyset cursors (default 50, maximum 500); the SDK's `iteratePosts` rejects repeated cursors. Each workspace supports up to 500 scheduled posts. Reordering submits its exact current queue and affects the priority of due posts, preserving scheduled times.

## Configuration and connection

Apply the additive `0001_bright_corsair` migration before starting the new image. The image includes contracts and the Mention SDK. The server starts its worker after connecting to PostgreSQL, and stops accepting work during shutdown. Multiple instances claim leases with row locks and `SKIP LOCKED`.

Mention is available with the current Oxy account, including the selected organization. Its destination row is an account projection, with no OAuth grant, token, refresh token, connection button or disconnect permission. Schedio's shared workload provider authenticates the service; each scheduled Mention revision stores only its Oxy task ID, created from the real session that requested scheduling. The task retains the original operator separately from the effective account. When a user selects an organization, the request-local Oxy client uses the canonical managed-account exchange after the existing membership check. No user bearer is persisted.

Mastodon remains an external OAuth connection. Keep `SOCIAL_TOKEN_ENCRYPTION_KEY` and `SOCIAL_OAUTH_REDIRECT_URI` (normally `https://schedio.app/accounts`) configured. A signed-in user authorizes on the provider and returns to Accounts. Random hashed state is bound to the user/workspace, expires after ten minutes, and is consumed once; PKCE protects exchange. Provider tokens, refresh tokens, client secrets and pending OAuth secrets remain encrypted and are never exposed by account APIs. Refresh is serialized under a database lock. Disconnect erases credentials and prevents future dispatch, without deleting published posts.

Mention uses its product SDK's own factory, shared Oxy authenticated transport and canonical audience. Dispatch carries the original task/account proof and checks the returned Mention identity. Mastodon retains the core SDK's DNS-pinned public-URL transport, HTTPS and disabled redirects.

## Review and ownership

Personal drafts belong to their creator. An organization owns its drafts and destinations; each HTTP operation resolves current membership through the Oxy SDK with a request-local uncached client. Members with `account:act_as` can prepare content. Owners and administrators manage review policy and approve the exact content/destination revision. Editing either increments the revision, clears approval and returns an unattempted post to draft. Attempted publications cannot be edited: a new message needs a new draft.

A scheduled Mention post retains its original requester's live authority. Revoked membership, session, task or workload stops publishing; the worker never substitutes the organization owner. An ordinary authorized reschedule may create a fresh root for the same payload and stable delivery keys. Editing an unattempted post revokes its old root and clears scheduling/approval. Attempted content still cannot be edited. Dispatch rechecks current organization review policy and the exact approved revision. Provider and post locks preserve the existing serialization rules; enabling review blocks unapproved scheduled work.

## Delivery and uncertainty

Publish-now queues a due instruction; it does not fabricate a completed status. Each destination has a stable random effect key, attempts, lease token and independently visible result. Successful destinations are never retried. A late worker cannot overwrite a newer lease's result. Unknown outcomes retain the same effect key and original payload. Up to three automatic attempts occur while safe; explicit retry never resets that identity or its first-attempt timestamp.

Mention's own publishing endpoint reuses its durable effect receipt, isolated by verified service and account. The receipt reserves a key before domain effects. Duplicate keys return a refusal without running the effect again. That receipt currently does not return the original post ID after a lost response, so Schedio retains `unknown` rather than inventing a URL or issuing a new key. Inspect the destination to resolve these cases manually; Schedio does not guess from matching text.

[Mastodon's statuses contract](https://docs.joinmastodon.org/methods/statuses/) retains idempotency keys for up to one hour. Schedio conservatively stops retrying uncertain Mastodon deliveries 45 minutes after the first attempt, including expired leases and manual retries. The remaining result stays unknown and requires destination inspection. Provider deployments must implement that documented idempotency behavior. [Mastodon OAuth](https://docs.joinmastodon.org/client/authorized/) provides the delegated connection.

This phase publishes text to Mention and Mastodon. Other legacy platform values remain readable in storage but cannot be newly connected or selected. Legacy scheduled records without real delivery instructions fail closed and need editing to choose connected destinations.

## Verification

`TEST_DATABASE_URL=postgres://... bun run --filter @schedio/backend test` runs the real PostgreSQL transaction tests, including a forced lock-wait revision race, exclusive leases, late-worker fencing, partial delivery, lost responses, expired retry windows, queue authorization, approval changes, OAuth state/credential lifecycle and pagination. The network tests reject private endpoints before sending credentials. Backend build/typecheck, frontend typecheck/web export, Biome, Expo lint, migration/schema generation, OpenAPI freshness and artifact integrity are separate gates.

No real provider account was authorized or published to during implementation. Production smoke testing requires the configured HTTPS callback and an explicitly authorized test account on each provider.

## Alia communication drafts

Schedio owns a signed Oxy capability catalog at `src/capabilities/schedio.catalog.ts`. Its only tools are `listDestinations` (`read`) and `createDraft` (`create`). There is no capability endpoint for approval, scheduling, publishing or payment. The runtime uses the shared Oxy catalog SDK, not a saved user session. Internal requests carry an exact-audience Capability ticket; Schedio verifies its Ed25519 signature, exact app/account-root/tool/capabilities and limits, then introspects it with its service identity on every call. A failed or revoked authority check stops before effects. Organization input must equal the ticket's effective account; the domain service checks every destination under that scope.

Draft creation uses a stable caller key scoped to account and actor. The deterministic operation ID is the post primary key, and a transaction advisory lock serializes concurrent calls. A lost reply returns the same draft; changed content or destinations with the same key conflicts. A draft remains unscheduled and unapproved and the caller receives a Schedio review link. Editing the communication template does not make other capabilities available.

After deploying this API, run `bun run --cwd packages/backend capabilities:register` using Schedio's registered temporary workload role and environment. Local assumed-role/SSO credentials use the same shared provider; no Oxy client key fallback exists. Oxy must register the application's service principal/audience and its exact catalog digest before Alia discovers the tools. `OXY_API_URL` defaults to `https://api.oxy.so`. No catalog registration or deployment is performed by tests. A real cross-service smoke of original requester/task revocation remains a rollout gate; external tools retain their own bounded grants.

## First-party rollout

Source checkpoint only; no deployment, registry publication or production writes are claimed. Publish and pin Oxy core 7/contracts 6 and the new Mention SDK/contracts, deploy Oxy's live task readers and Mention's own publishing receiver, then apply generated migration `0002_boring_spectrum` in the pre phase before deploying Schedio. The registry composition below satisfies the package gate; activation still
requires the deployed Mention receiver and the ordered migration.

The 2026-10-23 19:31 UTC read-only production census found zero social accounts, posts and deliveries (`first-party-root/schedio-counts-log.json` in organization scratch). There is no live queue to convert from own OAuth. Recheck immediately before cutover. If concurrent legacy Mention work appears, preserve its rows/effect keys and require an ordinary verified session to reschedule; never convert an external grant into global own authority. Historical external OAuth states fail closed for Mention; Mastodon exchange/refresh remains intact.

Candidate validation passed 59 backend tests (disposable PostgreSQL and actual shared Oxy/Mention HTTP transport), backend build/typecheck, frontend typecheck/web export, OpenAPI freshness, migration lock checks, Biome and Expo lint. The core 7 payload type guard also exposed old privacy callers reading an already unwrapped `.data`; they now consume the actual payload. Registry artifact provenance is checked again with the final published pins; temporary candidate overrides are never committed.

Privacy data no longer uses a global persistent cache. Reads are bound to the
verified current account, requested profile and session epoch; switching account
or logging out discards pending replies and clears the displayed state. The main
screen tree is keyed by account so old privacy forms are not reused. The legacy
unscoped storage key is removed without reading it. Two HTTP/async regression
tests cover a delayed previous-account response and logout/login to the same
account; frontend typecheck and Expo lint pass.


Published registry composition, 2026-10-25: Oxy core 7.3.0, contracts 6.0.0,
services 13.0.0, MCP 1.4.0, protocol 1.5.1 and Mention SDK/contracts 0.2.0. The
artifact receipt records the actual public tarball hashes/integrities and release
source; no local tarball or override remains. Candidates were removed before an
isolated-cache registry install, and frozen installation verifies the lock. The
installed contracts declaration matches the public Zod 4 artifact. Frontend
validation also uses Zod 4 with explicit record keys and issue diagnostics.

All 59 backend tests, two account/session-switch privacy regressions, backend
and frontend types, backend build, OpenAPI freshness, publishing provenance and
changed-file Biome pass with these published packages. Source readiness does not
claim rollout: Mention's matching receiver must be live first, then recheck the
legacy queue census and apply the pre migration before enabling Schedio callers.
Mastodon retains its external OAuth grant and provider state throughout.
