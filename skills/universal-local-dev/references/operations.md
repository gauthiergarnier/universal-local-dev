# Operating the shared launcher

Run `local-dev help` for the installed version's interface. Install dependencies
once per explicit worktree using its lockfile, then create ignored `.local-dev.json`
with setup or a portable manifest. Commands from any adopted repo:

```
local-dev setup --name task --app /absolute/isolated/app --simulator /absolute/isolated/simulator
local-dev doctor
local-dev up
local-dev status
local-dev urls
local-dev qr --service website --page /support
local-dev down
```

Use `--manifest PATH` to operate an already registered stack. Use `register` to
add it to `dashboard`. `up` is foreground; Ctrl+C stops its own groups. Native
worktrees/ports cannot be shared by active stacks. `status` labels stale owners;
`recover` verifies supervisor unreachability and free ports before route removal.
Never remove an ambiguous lock without stopping writers and confirming its owner.

Profiles: visual serves UI/static references with cleared credentials;
simulator-source runs Vite on the website's exact `/simulator/` origin; integration
runs native apps with explicitly created local PostGIS/Redis, fixtures and captured
email. `data-up`, `migrate`, `fixtures`, `data-down`, and confirmed `data-reset` are
separate commands. Each consumer supplies its own fixture/email scripts.
Integration contexts must use a local Unix Docker socket; do not use shared DB URLs.

One host runs `host-up` using persistent Caddy CA state. `host-setup` prepares exact
macOS install/rollback files. Review them before system changes; use the user's
existing authorization and normal protected-tool approval, not repeated blanket
permission questions. sudo/trust dialogs and Tailscale console changes may require
the human. Default proxy port 8443 avoids running application/proxy code as root.

DNS binds loopback and the explicit tailnet IP; split DNS covers only this host's
namespace. Answers point to the host's tailnet IP. Keep intended-user/device grants
for TCP 8443 and TCP/UDP 53 narrow, and check existing broad grants. Keep Funnel off.
If the macOS Tailscale variant cannot bind its IP, diagnose/use a supported variant;
never silently expose all interfaces.

Phone: privately transfer only the public root.crt. iOS requires installing the
profile and enabling full CA trust; Android uses CA installation settings. Connect
Tailscale and scan the same desktop URL. The host must stay awake. Check actual
DNS/HTTPS and interaction on the phone. Google does not accept arbitrary .test
OAuth callbacks; do not promise external auth without provider validation.

Secret references are optional op:// templates, never plaintext. Visual ignores
them; integration injects them through op run. Environment addresses/public flags
are normal config. API sync dry runs are names-only and offline; deployments are
separate. For details use the public project's docs/setup.md, docs/manifests.md and
docs/secrets.md, matching the installed version.
