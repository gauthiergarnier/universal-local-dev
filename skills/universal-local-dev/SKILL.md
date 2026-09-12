---
name: universal-local-dev
description: Run and diagnose isolated local project/worktree stacks with the universal-local-dev CLI, private HTTPS previews, native hot reload, local dashboard, named branch-tracking integration environments and phone QR access. Use for local stack setup/lifecycle or adopting a project into this workflow, not production deployment.
---

Use the installed `local-dev` CLI.
First run `local-dev version`; if missing, follow the package's documented install
from https://github.com/gauthiergarnier/universal-local-dev. Do not copy its launcher
implementation into consumers or hard-code a personal checkout path.

Read [operations](references/operations.md) for the requested setup, lifecycle or
recovery path. Pair projects through explicit worktree paths in ignored version 1
manifests. When an IDE manages worktrees, use its worktree interface if available.
Do not switch another agent's branch or stop its preview to free a port.

Default to the credential-free visual profile. Use integration only for requested
local data/auth work and declared local/test references. Native runtimes keep hot
reload; no install/build/harvest/vendoring/migration is part of normal up. Report
actual service path, branch, commit, profile and URL so the user can identify it.

Distinguish agent previews from user integration environments. Keep agent work on
feature worktrees; named user environments track committed local branches, normally
`local-test`, using managed runtime clones. Do not edit those clones or auto-merge
features. Pause updates when intentionally advancing several repositories together.
Use `env-*` controls for managed environments. Read [integration environments](references/environments.md)
for creation, automatic updates, recovery and promotion before online staging.

Host ownership, atomic registration, process identity, callback origins and secret
boundaries are load-bearing. Down uses the authenticated supervisor. Never replace
it with a PID-file kill, wildcard bind, global Serve reset or fabricated identity
headers. The dashboard stays loopback-only. Register only the chosen manifest.

User authorization for a preview does not migrate vaults, rotate keys, write remote
Coolify envs or deploy. Coolify sync defaults to an offline names-only dry run;
apply needs explicit scope for the exact environment/resource. Never print secret
values or publish captured login links, machine configs or CA private keys.

Separate automated checks, host setup actually performed and real phone checks in
results. A desktop mobile viewport or DNS override does not establish phone trust.
Supply exact pending OS/tailnet steps when human authentication is needed, while
continuing independent implementation and tests. Respect user decisions and avoid
re-asking for actions already authorized.
