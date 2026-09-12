# Named user integration environments

Keep agent feature previews separate from user testing. `local-test` is the default
local branch in each repository, seeded from an explicitly chosen committed
baseline. New environments require existing branches and a registered group
manifest. The dashboard can select a subset of that group's repositories and a
branch for each. Different named environments can test different combinations.

Commands: `local-dev env-create --name NAME --manifest PATH --branch local-test
--profile simulator-source`; then `env-start --name NAME`. The dashboard's
Create & start combines both. Use `env-list`, `urls --environment NAME`,
`env-pause`, `env-resume`, `env-update`, and `env-stop --name NAME`.

The dashboard server or standalone `env-watch` polls local branch refs every three
seconds. No remote polling or implicit branch merges occur. If consuming remote
work, fetch and advance the local tracking branch through normal Git workflow.
For coordinated multi-repo changes, pause, intentionally advance each branch in
normal dedicated worktrees, then resume. Respect the user's existing authorization
for that promotion and never switch another agent's checkout.

The manager captures exact commits, stops its own group, updates isolated clones,
installs locked dependencies on first use or changed dependency inputs, then starts
all services before publishing routes. URLs are stable but updates briefly take
services offline. Dependency scripts run only in the managed clones. Source
worktrees and uncommitted edits are never synchronized or overwritten.

Dirty managed clones, divergent history and preparation/readiness failures are
visible errors. Preserve unexpected edits and inspect private logs before an
explicit retry. Never force-reset to clear an error. A new named environment is
appropriate for a deliberately different baseline. Stop disables automatic
restarts; pause freezes the currently running version. Closing the dashboard
server stops its watcher, not existing stacks.

An environment is a repository grouping; a runtime profile is a separate choice.
Use simulator-source for website/app/live simulator review, visual for UI, and
integration only for explicit local data/auth. Prepare data via data-up, migrate,
fixtures with --environment NAME before starting that runtime. Never auto-reset or
migrate data on a branch update. Online staging remains the next intentional step
for external auth/payment tests; local setup does not deploy it.
