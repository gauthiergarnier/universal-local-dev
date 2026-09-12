# Universal Local Dev

Private HTTPS environments for local development across repositories.

Run independent feature previews, combine committed branches into named integration
environments, and review the exact revisions before promoting work to staging.
One CLI and dashboard manage the workflow for developers, Claude Code and Codex.

**macOS first · Node 22+ · MIT · no monorepo required**

## Two ways to test

| | Agent previews | User integration environments |
| --- | --- | --- |
| Source | An independent feature worktree | Selected committed branches across repositories |
| Updates | Live edits and native hot reload | Automatic coordinated updates from local branch tips |
| Purpose | Implement and check individual changes | Review a known combination of services |
| Isolation | Separate processes, ports and origins | Separate managed checkouts, dependencies, ports and origins |

The default integration branch is **`local-test`**. Create additional named
environments for different repository and branch combinations. Each environment
keeps a stable URL and records the commit set being tested.

```text
Feature worktrees → Local integration environments → Online staging
```

Advancing an integration branch is intentional. The launcher watches committed
local refs; it does not merge feature branches or promote work to online staging.

## What it provides

- A local dashboard with repository revisions, service links, start/stop,
  pause/resume and page QR codes.
- Stable HTTPS origins through Caddy's local CA, with dnsmasq and Tailscale split
  DNS for private access from other devices.
- Native development servers, hot reload and framework or command-based adapters.
- Shared lifecycle commands across repositories, with explicit manifests and
  authenticated process control.
- Optional isolated local data services and declared secret-provider references.
- An offline Coolify configuration-sync preview and a tested provider interface.
- One installable skill for Claude Code and Codex.

## Install

```sh
git clone https://github.com/gauthiergarnier/universal-local-dev.git
cd universal-local-dev
npm ci --ignore-scripts
npm install --global --prefix "$HOME/.local" . --ignore-scripts
export PATH="$HOME/.local/bin:$PATH"
local-dev version
```

Follow the [host setup guide](docs/setup.md) to install Caddy and dnsmasq, configure
a private namespace and trust the local CA. Package installation does not change
system DNS or trust settings. HTTPS uses port 8443 by default, allowing the proxy
to run without root.

## Open the dashboard

Start the host proxy and dashboard in separate terminals:

```sh
local-dev host-up
```

```sh
local-dev dashboard
```

Open **[https://dashboard.localhost:8443](https://dashboard.localhost:8443)**.
The dashboard stays on your computer and separates user integration environments
from agent previews. Service previews can be reached privately from other devices
once their DNS, network access and CA trust are configured.

## Run a feature preview

Install the project's dependencies using its lockfile, then configure its
[manifest and adapters](docs/manifests.md). The included static example is a small
starting point; run these commands from the launcher checkout:

```sh
cd examples/hello
local-dev setup --name hello
local-dev up
```

Keep `up` running in that terminal. In another terminal in the same directory:

```sh
local-dev urls
local-dev qr --service website --page /
local-dev down
```

Use an independent worktree for each active feature preview. Register an existing
manifest with `local-dev register --manifest PATH` to make it available in the
dashboard.

## Create an integration environment

Create `local-test` in each participating repository from the committed baseline
you want to review. In the dashboard, choose **New environment**, select a
registered repository group, select its services and choose a branch for each.
**Create & start** prepares isolated checkouts and their locked dependencies.

The equivalent CLI flow uses an existing group manifest:

```sh
local-dev env-create --name local-test \
  --manifest /path/to/group/.local-dev.json --branch local-test --profile visual
local-dev env-start --name local-test
local-dev urls --environment local-test
```

While the dashboard server or `local-dev env-watch` runs, the launcher checks local
branch tips every three seconds. An update captures the selected commits,
prepares the group and restarts its services at the same URLs. Updates briefly
interrupt that environment while services become ready.

Use **Pause updates** before advancing several repositories together, then
**Resume updates** when the intended combination is committed. **Stop environment**
keeps its configuration and prevents automatic restarts.

```sh
local-dev env-list
local-dev env-pause --name local-test
local-dev env-update --name local-test
local-dev env-resume --name local-test
local-dev env-stop --name local-test
```

Dirty managed checkouts, rewritten branch history and failed preparation block
updates with a visible error. Remote-only pushes require the normal fetch and
local branch-update workflow. See the [environment guide](docs/environments.md)
for profiles, recovery and optional local data setup.

## Claude Code and Codex

Install the same skill directory into the appropriate client location:

```sh
# Codex
mkdir -p ~/.codex/skills
cp -R skills/universal-local-dev ~/.codex/skills/

# Claude Code
mkdir -p ~/.claude/skills
cp -R skills/universal-local-dev ~/.claude/skills/
```

Invoke `$universal-local-dev` in Codex, or ask Claude Code to use the
`universal-local-dev` skill. The skill operates the installed CLI and covers
feature previews, named environments, diagnostics and private device access.
See [agent setup](docs/agents.md).

## Documentation

| Guide | Covers |
| --- | --- |
| [Host setup](docs/setup.md) | HTTPS, DNS, device trust and rollback |
| [Manifests and adapters](docs/manifests.md) | Repository configuration and native commands |
| [Integration environments](docs/environments.md) | Branch selection, automatic updates and lifecycle |
| [Runtime profiles](docs/integration.md) | Optional local data and project-provided fixtures |
| [Secrets](docs/secrets.md) | Provider references and configuration-sync boundaries |
| [Validation](docs/validation.md) | Tests, CI and device verification |
| [Contributing](CONTRIBUTING.md) | Development and contribution workflow |

## Scope and platform support

Machine configuration, environment files, logs and CA material stay in private
local state. Only the public CA certificate is transferred to devices; each device
requires its own trust setup. A desktop viewport check does not establish device
connectivity or trust.

Local startup and branch updates do not migrate credentials, reset databases,
change deployed variables or deploy online environments. Data preparation and
configuration writes are explicit operations. Secret synchronization defaults to
an offline, names-only preview.

The host installer targets macOS. Linux supports the generic CLI with manual
resolver, service and trust setup. Windows process groups and host installation
are not implemented. Optional container-backed data services require a local Unix
Docker socket. External identity providers may restrict local callback domains;
validate those integrations in an appropriately configured environment.

Run `npm test` for the launcher acceptance suite. CI covers Node 22 and 24 on macOS
and Linux. Licensed under [MIT](LICENSE).
