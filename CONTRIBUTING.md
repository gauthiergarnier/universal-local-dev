# Contributing

Install Node 22+ and run `npm ci --ignore-scripts`, then `npm test`.
Keep the generic lifecycle independent of app frameworks. Extend adapters instead
of forking the launcher. Bump the manifest or CLI version for incompatible changes
and update consumers deliberately.

Use disposable temporary directories/ports for tests. Test startup failures,
crashes and shutdown against real processes; leave unrelated listeners alive.
Run the local dashboard and inspect desktop/mobile widths for UI changes.
Host-level DNS/trust and real-phone checks require a configured machine and are
reported separately from unit/process tests. Never add credentials, CA state,
private screenshots or user-specific manifests to fixtures or issue reports.
