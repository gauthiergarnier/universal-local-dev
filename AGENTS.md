# Agent guidance

This is the canonical universal local-development launcher. Consumers contain thin
version-checked entry points; never maintain copied launcher implementations.
Read README.md and the task-relevant docs before changing host/process behavior.

Use Node 22+ and npm ci. Run npm test for code changes. Loopback/process tests are
real tests, not mocked PID assertions. Keep native app runtimes and build outputs
in their explicit worktrees. Do not edit another agent's checkout or stop its preview.

Changes to process ownership, route registration, profile isolation, secret
injection or env sync need behavioral tests. Preserve the atomic host registry,
Caddy ownership/storage checks, private Unix control sockets and guardian cleanup.
Never use a persisted PID alone as permission to kill a process.

State, machine paths, logs, .env files and CA material are private and ignored.
Public fixtures use synthetic identities and op:// references only. Review the
staged public diff before pushing. Do not publish local validation artifacts that
contain personal paths, tailnet addresses, login tokens or private service UUIDs.

setup/up do not authorize remote credential migrations, live env sync, deployment
or global Tailscale Serve resets. Keep the names-only sync dry run offline. Preserve
literal/multiline values and build/runtime flags. Never delete undeclared env keys.
Use only explicitly authorized providers/resources for apply operations.

The dashboard listens on loopback and verifies Host, Origin and its session token.
Do not expose its process-control API through the preview proxy. Keep UI free of
credential values and raw registry control tokens. Avoid external UI dependencies.

SKILL.md is maintained under skills/universal-local-dev; it works for Codex and
Claude Code. Keep it self-contained and validate its frontmatter after changes.
Report automated tests, actual host setup and human phone steps separately.
