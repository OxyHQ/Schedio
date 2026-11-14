# Ecosystem activity

The backend publishes aggregate traffic and its infrastructure heartbeat to the
Oxy API, which broadcasts changes to the website dashboard. Collection runs in
the service process regardless of whether somebody opens the dashboard.

`server.ts` starts it with one call, `startEcosystemTraffic` from
`@oxy.so/core/server`, and awaits its `stop()` on shutdown. `OXY_ECOSYSTEM_ACTIVITY_ENABLED`
is `true` or `false` (anything else fails boot) and wins; unset, it publishes
wherever `AWS_REGION` is set. Once it should publish, a missing region fails
boot. Publishing needs a registered Oxy workload binding for the deployed task
role. The shared Oxy activity producer uses workload identity; do not provision
`OXY_SERVICE_API_KEY` or `OXY_SERVICE_API_SECRET` for this own service.
Where it does not publish nothing is emitted, which must not be interpreted as
zero traffic. Production sets `OXY_ECOSYSTEM_ACTIVITY_ENABLED=false` while Schedio
is prelaunch (it is not in `ecosystem_activity_services` in oxy-infra); a
development shell with `AWS_REGION` set and the flag unset publishes, so keep the
`.env.example` default `false`.
Verify the live workload binding and enable the flag in the deployment before
claiming coverage. Source configuration is not evidence of deployed coverage.

HTTP middleware is mounted before body parsers and routers, including public
routes, webhooks, failures and authenticated internal calls. Outgoing fetch and
Node HTTP requests are observed by the shared SDK, including requests made by
background workers. Socket.IO message sends and receives are observed where
this service exposes Socket.IO. Internal/external scope is independent of
inbound/outbound direction; media is a separate activity category. Here `scope`
classifies traffic, not OAuth permissions or access grants between own apps.

Only bounded aggregate fields leave the service. No bodies, message contents,
user identifiers, tokens or IP addresses are added to activity events. Visitor
origins represent the Cloudflare edge PoP, not an IP-derived country. Infrastructure
location follows `AWS_REGION`; registration and graceful removal update the
shared inventory, and crashed instances expire through the API registry.

The publisher does not observe database wire traffic, raw TCP, HTTP/2, WebRTC,
or a separate process that has not installed the collector. These transports
must not be represented by fabricated lines.
