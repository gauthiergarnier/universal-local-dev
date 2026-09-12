# Host setup and rollback

Use Node 22+, `npm ci --ignore-scripts`, and a user-owned global install from the
README. Install Caddy and dnsmasq on macOS with `brew install caddy dnsmasq`.
The package does not run Homebrew services or change system settings on install.

## Configure one host

From your project's worktree, run:

```sh
local-dev setup --name task --namespace developer-device \
  --tailnet-ip 100.64.10.20 --https-port 8443
local-dev host-setup
```

Replace the example IP with the host's actual Tailscale IPv4. `--domain dev.test`
is the default base domain.
A developer/device namespace prevents tailnet DNS collisions. The stack hostname
also includes a project/worktree hash. Never reuse another developer's namespace.
Without `--tailnet-ip`, setup is desktop-only and DNS answers loopback.

The host state directory defaults to `~/.local/state/local-dev`.
`LOCAL_DEV_STATE` can select another **short** private directory before setup;
all consumers must use it consistently. Keep it outside repos/backups shared with
others. It holds the persistent CA private key, registry and local supervisor
sockets. Setup is idempotent and refuses to overwrite an existing stack manifest.

The generated system directory contains reviewed inputs and `install.sh` plus
`rollback.sh`. Installation requires interactive macOS administration:

```sh
sudo sh "$HOME/.local/state/local-dev/system/install.sh"
local-dev host-up
```

The installer adds only its dedicated dnsmasq config, namespace-scoped
`/etc/resolver` file and `dev.local.dns` launchd service. It validates the
config, refuses pre-existing differing files and preserves generated input copies
for rollback verification. Re-running identical setup is safe. It does not modify
Homebrew's global Caddy/dnsmasq files, global DNS, resolv.conf or Tailscale settings.
Run `host-up` in one long-lived terminal: Caddy's admin socket, autosave and storage
are scoped to this owner. HTTPS defaults to unprivileged port 8443. Application
backends stay on loopback; Caddy and dnsmasq bind loopback and the exact tailnet IP.
Never work around a failed tailnet bind by opening all interfaces.

## Desktop and phone trust

Start a stack with `local-dev up`. Caddy uses `tls internal`. Install its **public**
root certificate in your login keychain:

```sh
security add-trusted-cert -r trustRoot \
  -k "$HOME/Library/Keychains/login.keychain-db" \
  "$HOME/.local/state/local-dev/ca/pki/authorities/local/root.crt"
```

Approve the OS prompt yourself. Firefox can need a separate Authorities import.
Do not export `root.key`, intermediate keys or the entire CA directory. Never use
`curl -k` or a browser certificate-error bypass as the normal workflow.

In the Tailscale admin console, configure a restricted/split nameserver using the
host's tailnet IP and **only** `<developer-device>.dev.test`. Keep global DNS and
other developers' namespaces intact. Restrict grants to intended users/devices and
the development host's TCP 8443 and TCP/UDP 53. Check existing broad grants, because
a narrower new grant does not override them. Keep Funnel off. Do not reset Serve.

The resolver serves only that private namespace and has no upstream recursion.
Remote answers are the host's tailnet IP, never phone loopback. Inspect:

```sh
dig @127.0.0.1 <stack-hostname> A
dig @<tailnet-ip> <stack-hostname> A
dscacheutil -q host -a name <stack-hostname>
local-dev doctor
local-dev check
```

Use `dscacheutil` to exercise macOS scoped DNS; plain `dig name` may not follow
macOS resolver selection. Test an unrelated domain directly against dnsmasq: it
must not forward arbitrary queries. Tailscale must be connected and the host awake.
When Tailscale is off, a private-IP installation is unavailable; it does not fall
back to a public site. The same printed HTTPS URL works on desktop and phone.

Privately transfer only `root.crt` to the phone. On iOS: install the downloaded
profile under General → VPN & Device Management, then enable full trust under
General → About → Certificate Trust Settings. On Android: install a CA certificate
through security/credential settings; menus and browser trust behavior vary.
Connect the phone to Tailscale and scan `local-dev qr`. Verify actual page loading,
secure HTTPS, navigation and hot reload on the device. A desktop mobile viewport
or explicit DNS mapping does not prove phone DNS or trust.

The tested macOS standalone app uses a system extension and allows a private-IP
listener. Other Network Extension variants can differ. The CLI for the standalone
app is `/Applications/Tailscale.app/Contents/MacOS/Tailscale`; do not confuse it
with a separately installed `tailscaled` daemon. If private-IP binding is unsupported,
use a supported variant or a dedicated Linux tailnet resolver/proxy. No automatic
variant switch or firewall weakening is implemented.

## Dashboard and lifecycle

`local-dev dashboard` opens a local control service at `https://dashboard.localhost:8443`.
Open that URL yourself. The dashboard shows registered worktrees, actual Git
identities, profiles, links and page QR codes. Start/stop controls operate only
registered manifests. The API requires its session token, the exact dashboard Host and
same-origin JSON mutations. Caddy serves `dashboard.localhost` with the local CA,
restricting this control route to requests originating on the development host.
The underlying API binds only loopback; its diagnostic URL is `http://127.0.0.1:19440`.
The `.localhost` browser domain works before the app namespace resolver is installed.
The dashboard can close while independently supervised stacks remain running.

Use `setup` or `register --manifest PATH` to add existing manifests. `up` never
installs, builds, vendors, migrates, resets or deploys. `down` sends an authenticated
request to the live owner; no stale PID can authorize a kill. A guardian stops
native process groups if their supervisor crashes. On stale state, start the host,
then `recover`; it refuses live owners or busy ports. Ambiguous registry/host-owner
locks require stopping all owners/mutations and inspecting the recorded owner and
terminal before manually removing only the confirmed stale lock directory.

Caddy validates and reloads routes atomically. Streaming requests receive a
five-minute close delay on reload; long-lived WebSockets may reconnect after that
grace period. App backends stay up across unrelated stack changes.

## Upgrade and uninstall

Stop affected stacks, install the chosen version and update consumer pins together.
Keep the CA directory and namespace across upgrades. Machine paths, .env files,
logs and `.local-dev.json` remain ignored.

For rollback: stop each owned stack, stop `host-up`, then run the prepared
`sudo sh <state>/system/rollback.sh`. It removes only byte-matching owned files and
retains changed files. Remove only the corresponding split nameserver/grants from
Tailscale manually. Remove the public CA trust on each device before deleting CA
private state. Uninstall the package with
`npm uninstall -g --prefix "$HOME/.local" @gauthiergarnier/universal-local-dev`.
Do not remove another user's Docker VM, default context, certificates or routes.

Automated OS installation currently supports macOS. Linux may use the CLI and
configs with manually installed dnsmasq/systemd/CA trust. Windows process-group
semantics are not implemented.

References: [Caddy local HTTPS](https://caddyserver.com/docs/automatic-https#local-https),
[Caddy WebSockets](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[dnsmasq](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html),
[Tailscale DNS](https://tailscale.com/docs/reference/dns-in-tailscale),
[macOS variants](https://tailscale.com/docs/concepts/macos-variants).
