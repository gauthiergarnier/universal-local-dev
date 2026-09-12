# Secret providers and Coolify boundary

1Password is optional and recommended as an initial source of truth where already
available. Installing this tool does not migrate, rotate or read vault contents.
Use separate local/staging/production access, per-service items and deliberately
shared keys only. Reference templates are public; values are not.

Visual startup clears inherited secrets and keys discovered in dotenv files.
Integration injects only explicitly declared `op://` references through `op run`.
Derived loopback database addresses, public origins and cookie settings belong to
the stack. They cannot be replaced by shared references. `NEXT_PUBLIC_*` and
`VITE_*` cannot be private references. Use `secretVault` for a vault ending in
`-local` or `local-development`; the default is `example-local`.
No external credential is needed to use static/visual previews.

The provider boundary is `resolve(reference) -> exact string`. The included
1Password provider keeps values in memory. Alternative providers can implement
that method without changing the Coolify adapter. No new secret-server deployment
is required; self-hosted products need their own licensing/operational evaluation.

```sh
local-dev secrets-sync --plan sync.json --environment staging --uuid EXACT-UUID
```

The default dry run is offline and lists only key names/environment/resource identity;
it neither resolves credentials nor contacts Coolify. The example explicitly
specifies project/application/environment UUIDs, a bare HTTPS API origin, allowlisted key
names and literal/multiline/buildtime/runtime flags. Undeclared variables are never
deleted. Values are serialized as JSON without quote/newline rewriting.

An intentional `--apply` needs a separately supplied `COOLIFY_API_TOKEN`. Before
resolving anything, the adapter reads `/projects/<projectUUID>/<environmentUUID>` and verifies the
returned environment UUID/name and application membership. Missing metadata fails
closed. `secretVault` may name a vault ending in the exact selected environment. Then
it only PATCHes `/api/v1/applications/<uuid>/envs/bulk`; it cannot deploy/restart.
Production requires the exact resource again with `--confirm`, plus separately
scoped production credentials. Local development authorization is not production
write authorization. Errors and fake-tested dry-run summaries omit values.

[1Password op run](https://www.1password.dev/cli/secrets-environment-variables)
provides per-process injection. [Coolify's bulk env endpoint](https://coolify.io/docs/api/endpoints/applications/update-envs-by-application-uuid)
remains the deployment-time consumer; application boots do not depend on a live
1Password lookup. No live env sync has been performed as part of this implementation.

Identity lookup follows the official [project/environment controller](https://github.com/coollabsio/coolify/blob/main/app/Http/Controllers/Api/ProjectController.php).
