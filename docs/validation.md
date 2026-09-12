# Validation

`npm test` exercises real loopback processes and private Unix control sockets:
manifest safety, concurrent registry mutations, collision rejection, failed
startup cleanup, guardian shutdown after supervisor crashes, profile credential
isolation, Caddy route generation and readiness, dashboard Host/Origin/token
checks, and offline/fake-tested secret synchronization.

CI runs Node 22 and 24 on macOS and Linux. Native project adoption checks cover
trusted HTTPS through ordinary macOS DNS, Next/Vite hot reload, theme/menu
interaction, same-origin iframe messages and isolated sibling/branch cookies.
Dashboard checks exercise start/stop and page QR updates at 390px and 1280px through
`https://dashboard.localhost:8443` with normal certificate verification.

A native Apple Silicon PostgreSQL/PostGIS stack was exercised with synthetic
fixtures, captured-email sign-in, shared secure cookies, device pairing and
failure cases. These are local integration checks, not third-party authentication
or payment verification. Phone trust and Tailscale split DNS require actual device
checks; desktop viewports and DNS overrides do not establish them.

Review package contents with `npm pack --dry-run` before publishing. Machine
manifests, private state, captures, logs and CA keys must never be distributed.
