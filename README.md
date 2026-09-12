# Universal Local Dev

One launcher for native development servers across projects, branches and agents.
Run independent worktrees behind private HTTPS, open the same URL on your phone,
and keep processes, cookies and disposable data scoped to their stack.

**macOS first · Node 22+ · MIT · no monorepo required**

- A local dashboard separating agent previews from named user integration environments.
- Coordinated branch updates across repositories, with `local-test` before online staging.
- Stable private URLs, branch/commit identity, start/stop, pause/resume and page QR codes.
- Caddy local CA, dnsmasq and Tailscale split DNS, with explicit trust and rollback.
- Native Next.js, Node and Vite hot reload; loopback application backends.
- A generic manifest plus Next.js, Node, Vite and static adapters.
- Credential-free visual previews; explicit local integration injection via `op run`.
- An offline, names-only Coolify sync dry run and fake-tested provider boundary.
- A shared **SKILL.md** for Claude Code and Codex users.

## Quick start

```sh
git clone https://github.com/gauthiergarnier/universal-local-dev.git
cd universal-local-dev
npm ci --ignore-scripts
npm install --global --prefix "$HOME/.local" . --ignore-scripts
export PATH="$HOME/.local/bin:$PATH"
local-dev version
npm test
```

Follow [host setup](docs/setup.md) to install Caddy/dnsmasq, configure your private
namespace and trust the local CA. No system service, remote variable or DNS setting
is changed by package installation. HTTPS defaults to port 8443 so Caddy runs
without root. The dashboard itself stays on loopback.

Try the included static example, or configure a real project:

```sh
cd examples/hello
local-dev setup --name hello
local-dev host-up                       # one host owner, separate terminal
local-dev up                           # native stack, separate terminal
local-dev dashboard                    # https://dashboard.localhost:8443
local-dev urls
local-dev qr --service website --page /
local-dev down
```

Use [manifests and adapters](docs/manifests.md) for Next, Node, Vite or an arbitrary
argv command. [Integration profiles](docs/integration.md) explain isolated data,
project-provided fixtures and captured local email. Native commands remain escape hatches.

Use [user integration environments](docs/environments.md) to align committed branches
across repositories. Create as many named environments as needed from the dashboard;
`local-test` is the default branch. Updates run automatically while the dashboard or
`env-watch` is running.

## Agents

Install `skills/universal-local-dev` into `~/.codex/skills/` for Codex or
`~/.claude/skills/` for Claude Code. The same folder works for both. Invoke
`$universal-local-dev` in Codex, or ask Claude to use the universal-local-dev skill.
Read [agent setup](docs/agents.md). The skill operates the installed CLI; it never
copies launcher code, silently migrates credentials or claims desktop emulation
is a real phone test.

## Project structure

| Path | Purpose |
| --- | --- |
| `src/cli.mjs` | Shared command interface |
| `src/core.mjs`, `registry.mjs`, `supervisor.mjs` | Manifest validation and owned lifecycle |
| `src/host.mjs`, `system-setup.mjs` | Dedicated Caddy/DNS configuration and rollback |
| `src/environments.mjs` | Named integration environments and branch update watcher |
| `src/dashboard*` | Local UI and authenticated loopback API |
| `src/adapters.mjs`, `environment.mjs`, `integration.mjs` | Native adapters and isolated profiles |
| `src/secrets-sync.mjs` | Replaceable secret provider and redacted Coolify adapter |
| `templates/` | Portable manifests and reference-only secret examples |
| `test/` | Registry, process, environment and sync acceptance tests |
| `skills/universal-local-dev/` | Claude/Codex skill |

## Boundaries

No production deploys, vault migrations, secret rotations or remote env writes
happen during setup/up. Phone trust and tailnet admin-console changes are explicit
human steps. Caddy CA private keys never leave the host state directory. Do not use
Funnel for these previews. Google OAuth does not accept arbitrary `.test` callback
domains; app-specific captured magic links are the local integration path.

The initial host installer targets macOS. Linux can use the generic CLI with
manual resolver/service/trust setup. Windows process groups and host setup are not
implemented. Caddy reloads retain streaming connections for a five-minute grace
period; long-lived clients may then reconnect. Integration images require a local
Unix Docker socket; PostGIS builds natively for Apple Silicon and x86 from
official PostgreSQL and PGDG packages on the first explicit `data-up`.

See [validation](docs/validation.md), [secrets](docs/secrets.md) and
[contributing](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
