# Codex And OpenClaw Workflow

This doc is for unattended or semi-attended agent execution, especially
OpenClaw. It defines how work should be started, tracked, proved, and stopped.

## 1. Control Plane

Use Slack DM as the control plane.

Do:

- explicitly start issue work
- explicitly redirect the active issue
- explicitly ask for status

Do not:

- let heartbeat pick the next issue
- let heartbeat continue stale work automatically
- let heartbeat own long-running browser or stack sessions

## 2. One Issue At A Time

The worker should read the assigned issue and repo-local `AGENTS.md` first, then
work only that issue until one of these happens:

1. a commit is pushed
2. a PR is opened or updated
3. one precise blocker is hit

Do not auto-pick a new issue at the end of a chunk unless the control plane
explicitly says to do so.

## 3. Startup Prompt Pattern

Recommended Slack DM prompt:

```text
Start Kithlands issue #165.
Read the repo-local AGENTS.md and the issue first.
Work only this issue until you either:
1. push a commit,
2. open/update a PR,
3. or hit one precise blocker.
Derive ports from scripts/worktree-env.sh.
Use managed background processes, not shell backgrounding.
Run targeted tests, simulator/browser proof when relevant, and attach screenshots from ~/.openclaw/workspace/tmp.
After each coherent chunk, commit and push.
Report back with: issue number, branch, commit SHA, tests run, screenshot filenames, and PR URL or blocker.
```

## 4. State File

Use one state file only:

- `.openclaw/workspace/memory/projects.md`

Required fields:

- active issue
- active branch
- active worktree path
- derived `PORT`, `VITE_PORT`, `DB_NAME`
- current blocker
- last proof produced
- next step

Template:

- [`.openclaw/workspace/memory/projects.md`](../.openclaw/workspace/memory/projects.md)

## 5. Process Rules

### Long-Lived Services

If the agent runtime supports managed background processes:

- run the server as its own managed process
- run the client as its own managed process
- monitor them explicitly

Do not use shell backgrounding as the unattended process model.

For humans or local manual work, `make play` is fine. It now records detached
server/client PIDs and logs under `tmp/runtime/` and `make stop` only stops
those verified worktree-local processes. For OpenClaw-style automation,
managed processes are still preferred.

### Ports

Always derive ports from:

```sh
source scripts/worktree-env.sh
```

Never hardcode `8080` or `3000` for unattended worktrees.

## 6. Priority Rubric

Use this priority order:

1. active PR review comments
2. merge-conflicted PRs
3. current active issue
4. bugs / regressions
5. audits / cleanup
6. features, oldest first

## 7. Proof Requirements

Every update from the worker should include:

- issue number
- branch
- pushed commit SHA
- exact commands run
- exact targeted tests run
- simulator command if gameplay changed
- browser or Playwright proof if UI changed
- screenshot filenames
- PR URL or blocker

### Screenshot Rules

- use unique filenames per run
- do not recycle static names as evidence of progress
- copy proof screenshots into `~/.openclaw/workspace/tmp/` before attaching

Suggested format:

```text
issue-165-2026-04-15T14-22-10-town-layout-proof.png
issue-165-2026-04-15T14-24-03-battle-proof.png
```

## 8. Stop Conditions

The worker should stop and report when:

- a commit was pushed
- a PR was opened or updated
- one precise blocker exists
- the task requires a policy decision or scope change

It should not drift into unrelated issues after that point.

## 9. Heartbeat Policy

Keep heartbeat disabled for this repo until the issue workflow is stable.

If unattended behavior is reintroduced later, the safe version is:

- one isolated cron job
- every 60-90 minutes
- resume only the active issue from `projects.md`
- never choose a new issue
- only post status, proof, or one blocker
