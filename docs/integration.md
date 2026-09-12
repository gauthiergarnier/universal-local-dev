# Local integration profiles

Visual mode starts native UI/static previews without private service credentials.
Integration mode runs native services with explicit local/test references, a
per-stack PostgreSQL/PostGIS database and Redis. `simulator-source` runs a Vite
service beneath the website's same-origin `/simulator/` path, including HMR.

Install a local Docker runtime, set its Unix-socket context in `dockerContext`,
then explicitly run `local-dev data-up --profile integration`. The first data-up
builds a native image from official PostgreSQL and PGDG PostGIS packages. Normal
`up` never builds, migrates or resets data. Database and Redis ports bind loopback.

`data-down` preserves the data volume. `data-reset` requires the exact stack ID
with `--confirm` and deletes only that stack's disposable volume. No remote Docker
context or remote database is accepted.

The Next.js consumer supplies `scripts/local-fixtures.mjs` for the explicit
`migrate`/`fixtures` commands and `scripts/local-email-preview.mjs` for template
rendering. Other projects may invoke their own native tools. Seed synthetic data;
do not import production identities or add an authentication bypass.

Use derived HTTPS origins, exact cookie domains and credentialed CORS when testing
sibling services. Captured local mail belongs in the private runtime directory;
never expose login tokens in the dashboard. Actual external providers need their
own callback support and explicit test credentials. Local fixture tests do not
prove third-party OAuth, payments or real-phone trust.
