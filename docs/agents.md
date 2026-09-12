# Claude Code and Codex

The same `skills/universal-local-dev` directory works for both clients:

```sh
cp -R skills/universal-local-dev ~/.codex/skills/universal-local-dev
# or
cp -R skills/universal-local-dev ~/.claude/skills/universal-local-dev
```

Create the parent directory if needed. If a destination already exists, review it
before updating rather than merging divergent copies. Keep the installed CLI on
PATH. The skill discovers it through `local-dev version` and does not embed a
personal checkout path. Its reference guide is self-contained in the skill folder.

Example request: “Use universal-local-dev to start an isolated preview of this
worktree, show its branch/commit URLs and verify hot reload.” For Codex the explicit
skill spelling is `$universal-local-dev`; Claude can discover it by name/context.

Repository contributors should read AGENTS.md. Adopting projects should designate
the same launcher in their README, AGENTS.md and CLAUDE.md and keep native commands
as escape hatches. Do not equate agent permission to run a local preview with
permission to publish secrets, modify remote envs or reconfigure tailnet-wide DNS.
