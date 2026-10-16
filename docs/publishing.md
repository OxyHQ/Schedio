# Mention and Mastodon publishing

Schedio owns drafts, schedule order, approval revisions and delivery receipts. Connected providers own their published posts. A successful delivery stores its provider URL; Schedio never reports success before receiving a validated provider response.

The Accounts, Compose and Queue screens use `@schedio/sdk`. The canonical zod 4 schemas and route registry live in `packages/contracts`; `GET /api/openapi.json` serves the generated contract. Run `bun run generate:openapi` after changing contracts; CI checks freshness. Lists of posts use scope-bound keyset cursors (default 50, maximum 500); the SDK's `iteratePosts` rejects repeated cursors. Each workspace supports up to 500 scheduled posts. Reordering submits its exact current queue and affects the priority of due posts, preserving scheduled times.

## Configuration and connection

Apply the additive `0001_bright_corsair` migration before starting the new image. The image includes contracts and the Mention SDK. The server starts its worker after connecting to PostgreSQL, and stops accepting work during shutdown. Multiple instances claim leases with row locks and `SKIP LOCKED`.

Keep `SOCIAL_TOKEN_ENCRYPTION_KEY` configured as before, and set `SOCIAL_OAUTH_REDIRECT_URI` to the deployed HTTPS Accounts screen, normally `https://schedio.app/accounts`. This exact redirect is registered with each provider. A signed-in user starts authorization, follows the provider's consent screen, and returns to Accounts to complete it. OAuth state is random, stored hashed, bound to the user/workspace, expires after ten minutes, and is consumed once. PKCE protects code exchange. Tokens, refresh tokens, client secrets and pending OAuth secrets are authenticated-encrypted. Account APIs never expose them. The Mention connection must authorize the Oxy account selected for the workspace. Expired credentials refresh under a database lock; revoked or unrefreshable credentials require reconnection.

Mention uses its product-owned publishing SDK with an Oxy MCP OAuth grant scoped to `social.accounts.read social.posts.publish`, bound to `https://mcp.mention.earth`. Each dispatch verifies the connection's current Mention account. Ordinary Oxy user sessions are never forwarded to Mention by Schedio. Mastodon calls use the core SDK's DNS-pinned public-URL transport with HTTPS and redirects disabled, including registration, exchange, refresh and publishing.

Disconnecting disables future Schedio dispatch and erases stored credentials. It does not delete published posts. The provider's own authorized-app settings can revoke the grant completely.

## Review and ownership

Personal drafts belong to their creator. An organization owns its drafts and destinations; each HTTP operation resolves current membership through the Oxy SDK with a request-local uncached client. Members with `account:act_as` can prepare content. Owners and administrators manage review policy and approve the exact content/destination revision. Editing either increments the revision, clears approval and returns an unattempted post to draft. Attempted publications cannot be edited: a new message needs a new draft.

A scheduled organization post is a standing organization instruction, authorized when created and approved. It can survive the original author's membership change. Dispatch rechecks the current organization review policy and exact approval revision, the destination's workspace/active state, and the valid provider OAuth grant. Policy and credential locks serialize revocation against dispatch. Enabling review blocks previously scheduled unapproved posts.

## Delivery and uncertainty

Publish-now queues a due instruction; it does not fabricate a completed status. Each destination has a stable random effect key, attempts, lease token and independently visible result. Successful destinations are never retried. A late worker cannot overwrite a newer lease's result. Unknown outcomes retain the same effect key and original payload. Up to three automatic attempts occur while safe; explicit retry never resets that identity or its first-attempt timestamp.

Mention's existing durable MCP receipt reserves a key before domain effects. Duplicate keys return a refusal without running the effect again. That receipt currently does not return the original post ID after a lost response, so Schedio retains `unknown` rather than inventing a URL or issuing a new key. Inspect the destination to resolve these cases manually; Schedio does not guess from matching text.

[Mastodon's statuses contract](https://docs.joinmastodon.org/methods/statuses/) retains idempotency keys for up to one hour. Schedio conservatively stops retrying uncertain Mastodon deliveries 45 minutes after the first attempt, including expired leases and manual retries. The remaining result stays unknown and requires destination inspection. Provider deployments must implement that documented idempotency behavior. [Mastodon OAuth](https://docs.joinmastodon.org/client/authorized/) provides the delegated connection.

This phase publishes text to Mention and Mastodon. Other legacy platform values remain readable in storage but cannot be newly connected or selected. Legacy scheduled records without real delivery instructions fail closed and need editing to choose connected destinations.

## Verification

`TEST_DATABASE_URL=postgres://... bun run --filter @schedio/backend test` runs the real PostgreSQL transaction tests, including a forced lock-wait revision race, exclusive leases, late-worker fencing, partial delivery, lost responses, expired retry windows, queue authorization, approval changes, OAuth state/credential lifecycle and pagination. The network tests reject private endpoints before sending credentials. Backend build/typecheck, frontend typecheck/web export, Biome, Expo lint, migration/schema generation, OpenAPI freshness and artifact integrity are separate gates.

No real provider account was authorized or published to during implementation. Production smoke testing requires the configured HTTPS callback and an explicitly authorized test account on each provider.

## Alia communication drafts

Schedio owns a signed Oxy capability catalog at `src/capabilities/schedio.catalog.ts`. Its only tools are `listDestinations` (`read`) and `createDraft` (`create`). There is no capability endpoint for approval, scheduling, publishing or payment. The runtime uses the shared Oxy catalog SDK, not a saved user session. Internal requests carry an exact-audience Capability ticket; Schedio verifies its Ed25519 signature, exact app/account-root/tool/capabilities and limits, then introspects it with its service identity on every call. A failed or revoked authority check stops before effects. Organization input must equal the ticket's effective account; the domain service checks every destination under that scope.

Draft creation uses a stable caller key scoped to account and actor. The deterministic operation ID is the post primary key, and a transaction advisory lock serializes concurrent calls. A lost reply returns the same draft; changed content or destinations with the same key conflicts. A draft remains unscheduled and unapproved and the caller receives a Schedio review link. Editing the communication template does not make other capabilities available.

After deploying this API, run `bun run --cwd packages/backend capabilities:register` using Schedio's existing Oxy application identity (ECS workload identity, or the complete `OXY_APPLICATION_KEY`/`OXY_APPLICATION_SECRET` pair). Oxy must register the application's service principal/audience and its exact catalog digest before Alia discovers the tools. `OXY_API_URL` defaults to `https://api.oxy.so`. No catalog registration or deployment is performed by tests. A real cross-service smoke using a grant and then its revocation remains a rollout gate.
