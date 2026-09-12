# Validation

`npm test` exercises real loopback processes and private Unix control sockets:
manifest safety, concurrent registry mutations, collision rejection, failed
startup cleanup, guardian shutdown after supervisor crashes, profile credential
isolation, Caddy route generation and readiness, dashboard Host/Origin/token
checks, and offline/fake-tested secret synchronization.

CI runs Node 22 and 24 on macOS and Linux. Native project adoption checks cover
trusted HTTPS through ordinary macOS DNS, native hot reload, browser
interaction, embedded-page messaging and isolated cross-service cookies.
Dashboard checks exercise start/stop and page QR updates at 390px and 1280px through
`https://dashboard.localhost:8443` with normal certificate verification.

Optional local data services were exercised with synthetic fixtures and
application-provided integration checks. These checks establish local behavior;
external service integrations require separate verification. Phone trust and Tailscale split DNS require actual device
checks; desktop viewports and DNS overrides do not establish them.

Review package contents with `npm pack --dry-run` before publishing. Machine
manifests, private state, captures, logs and CA keys must never be distributed.
