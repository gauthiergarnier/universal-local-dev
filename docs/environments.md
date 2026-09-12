# User integration environments

The testing path is **agent feature branch → local integration → online staging**.
Agent previews run directly from each agent's worktree, including live edits. User
integration environments run isolated, committed snapshots of selected branches
across repositories. `local-test` is the standard branch; additional named
environments can select different branches and repository combinations.

Open **https://dashboard.localhost:8443**. “User integration environments” appears
above “Agent previews”. Choose **New environment**, select a registered repository
group, select its services and enter each branch. Names and ports are host-local;
URLs, cookies and disposable data remain separate for every environment.

An environment is a grouping and promotion stage. A **runtime profile** determines
which services run: `simulator-source` for the website/app/live simulator review
loop, `visual` for credential-free UI previews, or `integration` for explicitly
prepared local data/authentication. Online staging remains the place for real
external authentication/payment-provider checks.

## Establish branches

Create `local-test` once in each source repository from the committed baseline you
intend users to test. The launcher requires existing local branches; creating an
environment never guesses a baseline, changes the source checkout or merges an
agent's unfinished work. For example, from a repository with the chosen commit:

```sh
git branch local-test <review-baseline-commit>
```

The environment manager reads shared Git refs and creates its own detached runtime
clones below the private host state directory. It does not occupy `local-test` in
an IDE worktree or require an agent's worktree to remain open. Do development and
merges in normal worktrees; do not edit these managed runtime clones.

To deliver changes, use a dedicated integration worktree (your IDE's interface
when it manages worktrees), switch that worktree to `local-test`, and merge or
cherry-pick the intended feature commits there. Resolve conflicts and commit using
the repository's normal checks. Never switch another agent's checkout. Promotion
to `local-test` is intentional; the launcher never auto-merges feature branches.

If changes span repositories, **Pause updates**, advance all relevant branches,
then **Resume updates** or **Update now**. Every update captures one complete set
of branch tips before preparing the group. This avoids reviewing an intermediate
combination while the branches are being advanced one by one.

## Automatic local updates

While `local-dev dashboard` runs, the manager checks branch refs every three
seconds. It reads committed local `refs/heads/<branch>`; uncommitted edits and
remote-only pushes do not trigger an update. To consume pushed work, fetch and
fast-forward the corresponding local branch through your normal Git workflow.
No GitHub polling, remote merge, staging deployment or production action occurs.

For a changed group, the manager:

1. Captures all selected branch commits and checks ancestry and clean owned clones.
2. Stops only that environment through authenticated supervisor control.
3. Fetches and checks out exact commits in its isolated clones.
4. Installs dependencies from committed npm/pnpm lockfiles on first preparation or
   when dependency inputs change. Project dependency lifecycle scripts may run in
   these clones with a cleared development environment; their logs stay private.
5. Starts the selected native services, waits for readiness, and publishes routes.

The URL remains stable. There is a brief unavailable period during preparation
and startup; this is a coordinated restart, not a zero-downtime deployment.
A failed preparation/start is visible on the card and never publishes a partially
ready group. The last applied commit set remains in private environment state.
Fix the cause and choose **Update now**; failures do not loop dependency installs.
Dirty clones or rewritten branch history block an update without discarding edits.
The Next adapter recognizes and regenerates only Next’s exact generated
`next-env.d.ts` route-types import switch between build and dev. Other edits to
that file still block an update.
For an intentional incompatible baseline, create a separate named environment.

**Stop environment** preserves its configuration/data and prevents automatic
restarts. **Pause updates** keeps the current version running. Closing the browser
tab does not stop the dashboard server. Stopping the dashboard server pauses its
watcher while independently supervised environments continue running. Run the
standalone watcher instead if a dashboard server is not needed.

```sh
local-dev env-create --name local-test --manifest /absolute/group/.local-dev.json \
  --branch local-test --profile simulator-source
local-dev env-start --name local-test
local-dev env-list
local-dev urls --environment local-test
local-dev qr --environment local-test --service website --page /
local-dev env-pause --name local-test
local-dev env-update --name local-test
local-dev env-resume --name local-test
local-dev env-stop --name local-test
local-dev env-watch
```

`env-create` only saves configuration; `env-start` prepares and starts it. The UI's
**Create & start** combines these operations. `env-update` refreshes checkouts of a
stopped environment without starting it. `env-resume` enables automatic updates;
the dashboard or watcher must be running. Use environment controls rather than
raw `up/down` for managed clones so desired running state stays consistent.

CLI callers can use a private JSON plan with `env-create --plan PATH`:

```json
{
  "name": "checkout-review",
  "file": "/absolute/group/.local-dev.json",
  "profile": "visual",
  "services": ["website", "app"],
  "branches": {"website": "local-test", "app": "review/new-api"},
  "autoUpdate": true
}
```

The selected services inherit adapters, nonsecret configuration and declared
secret references from the group's manifest. Services must point at Git repository
roots. Up to twenty services can share an environment; create as many environments
as the host has available ports and resources. Existing environments are immutable
in composition: create another named one to compare a different combination.

For a data/auth runtime, explicitly run `data-up`, `migrate` and `fixtures` with
`--environment NAME` after preparing the environment via `env-update`. Then start
it. These operations are never implicit in branch updates. Schema-changing work
may need explicit local migration/reset; no deployed variables or vault contents
are changed. Use the consumer's documented reset procedure for disposable data.
