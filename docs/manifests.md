# Manifests and adapters

The ignored `.local-dev.json` is version 1. Portable templates are under `templates/`.
Each manifest declares project/task names and services with explicit worktree paths,
DNS host labels, loopback ports, readiness paths, optional dependency names/profiles,
normal env config and private `op://` references. Paths are resolved against the
manifest directory and canonicalized before identity/ownership checks.

```json
{
  "version": 1,
  "project": "example",
  "name": "feature",
  "services": [{
    "name": "website", "adapter": "command", "path": ".", "host": "", "port": 15000,
    "command": ["npm", "run", "dev", "--", "--host", "{host}", "--port", "{port}"],
    "readiness": "/", "profiles": ["visual"], "env": {}, "secrets": {}
  }]
}
```

Commands are argv arrays, not shell strings. `{host}` is 127.0.0.1, `{port}` is the
internal port, `{origin}` is the public HTTPS origin. The command adapter must
honor that bind contract. Do not insert shell operators; write a project script
for a multi-step native command. No dependency install or build runs automatically.

Built-in adapters: `marketing` runs installed Next dev; `app` serves public pins in
visual mode and native Node watch in integration; `simulator` runs installed Vite
under `/simulator/`; `static` serves public files with realpath containment;
`command` runs explicit argv. `publicDir` must remain inside the chosen worktree.
`host: ""` selects the stack root; `host: "app"` selects its app sibling.

Profiles are `visual`, `integration` and `simulator-source`. `dependsOn` references
service names included in the selected profile; missing dependencies/cycles fail.
Explicit auxiliary `databasePort` and `redisPort` are required for integration.
`dockerContext` must resolve to a local Unix socket. Data setup/reset/migration are
explicit commands. Consumers provide their own native migration/fixture tools.

Two active native servers may not share a worktree/build directory. Ports and
hostnames are checked against the host registry and actual listeners. A stack ID
uses project + canonical worktree path; a separate namespace distinguishes hosts
on one tailnet. Use isolated worktrees to compare branches and signed-in states.

For a consumer repo, keep a tiny entry point that checks `local-dev version` against
its required version and forwards CLI args. `templates/consumer.mjs` is a reusable
example. Add local command aliases to its package scripts and link this guide from
README, AGENTS.md and CLAUDE.md. Keep paths/state/secrets ignored.

Project-specific environment names belong in each service's `envAliases` mapping
(destination name to existing derived name), not in the shared launcher. Private
values cannot be aliased into public build inputs. `cookiePrefix` can retain a
consumer's existing local session contract; the default is `local`. `parity` may
list two or more `{ "service": "name", "path": "public/assets.json" } references
for exact JSON asset checks. Omit it when no project asset comparison is needed.
