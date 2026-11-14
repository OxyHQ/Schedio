# Oxy integration rules

The one way Schedio talks to Oxy. Moved from AGENTS.md; each rule is checked in review.

- **One `OxyServer` per process: `packages/backend/src/oxy.ts`.** Workload
  identity (no API key), `serviceIdentity: 'when-anonymous'`, base URL from
  `OXY_API_URL`. Mention is `mentionForOxyService(oxy)`, the capability
  catalogue registration a service client of it. Never construct another one,
  and never `new OxyServices()` with a user token.
- **Edge**: `oxyTrustProxy`, `createOxySecurityHeaders`, `createOxyCors`,
  `createOxyRateLimit(oxy)`, `createOxyAuthMiddleware(oxy)` in `server.ts`.
- **Organization authority is read live, never mirrored.** `publishing/authority.ts`
  asks `oxy.accountAccessFor(req, organizationId)` with the caller's bearer:
  acting for an organization needs `account:act_as`, changing its review
  policy `account:update`. Gate on permissions, never on role names; writes
  ask `fresh`. `OxyAccessError` becomes 401 / 403 / 503 in
  `publishing/errors.ts` through `accessErrorStatus` — an outage is 503, never
  a "no", and is never cached.
- **Calls as the person** go through `oxy.withUser(req | bearer, …)` while they
  are present. **Background work acts for the account** (oxy ADR 0066): the
  worker's Mention dispatch is `mentionForOxyService(oxy, { actingFor })`,
  naming the workspace and, for an organization, the author who operates it. No
  session, task or consent is kept. It works only once Schedio's entry in Oxy's
  first-party registry declares `actsForPeople`: Mention `write`; Schedio has
  none yet (parked before launch), so add it before launch.
- **Capability tickets** (`/_oxy/capabilities/*`): `createLiveCapabilityTicketVerifier`
  with `createOxyJwksKeyResolver` and `oxy.agency.introspectCapabilityTicket`
  (`capabilities/capability-authority.ts`); invalid → 401, Oxy unreachable →
  503, Oxy no longer standing behind it → 403 and audited.
- **Outbound**: provider URLs (Mastodon instances) are caller-influenced, so
  `safeFetch` + `readResponseJson` (`publishing/network.ts`). Never `safeFetch`
  an Oxy host.
- Errors are `{ "error": { "code", "message" } }` with a code from
  `@schedio/contracts`' `ErrorCode`; the capability lane keeps the SDK's
  `{ "error": "<code>" }` shape its callers read.
