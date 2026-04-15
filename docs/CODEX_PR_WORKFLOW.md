# Codex PR Workflow

This doc describes the expected branch, commit, PR, review, merge, and cleanup
workflow for Kithlands.

## 1. Start From The Right Base

When beginning new work:

```sh
git fetch origin --prune
git worktree add -b fix/my-issue ../kithlands-my-issue origin/main
```

Rules:

- base from `origin/main`, not stale local `main`
- use a fresh worktree for isolated issue work
- do not continue work on a dirty superseded branch if a clean replacement is
  cheaper and safer

If an unattended worker is driving the branch, it should have one active issue
only and should not auto-pick the next issue after pushing a coherent chunk.

## 2. Commit In Small Coherent Chunks

Do not build a giant local pile.

Preferred pattern:

1. implement one coherent slice
2. validate that slice
3. commit it
4. push it

Examples of coherent chunks:

- Playwright bridge dependency
- client behavior change
- server endpoint + tests
- validation or proof harness

## 3. Push Early

Push after each coherent chunk:

```sh
git push -u origin <branch>
```

That keeps the branch recoverable and prevents lost work when multiple agents
or worktrees are active.

## 4. Open The PR When Scope Is Clean

Do not wait for perfection if the branch is already reviewable.

A good PR body should include:

- summary of the actual change
- what was intentionally left out
- exact validation commands
- linked issue (`Fixes #N` or `Closes #N`)

For OpenClaw-style execution, status updates should also include pushed commit
SHA, screenshot filenames, and either the PR URL or one precise blocker.

## 5. Review Expectations

- Every PR should get a Codex review before merge.
- Findings should be addressed on the PR branch, not patched straight into
  `main`.
- If a dirty or oversized PR is replaced by a clean one, close the old PR as
  superseded and say which PR replaced it.

## 6. CI And Merge

Before merging:

- local validation should be done
- required CI checks must be green
- required review policy must be satisfied

If `main` moves while the PR is open:

```sh
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Do not merge a branch that is only green against an old base.

## 7. After Merge

After the PR is merged:

```sh
git switch main
git fetch origin --prune
git reset --hard origin/main
```

Then remove the merged worktree and branch if they are clean.

## 8. Cleanup Rules

Safe to remove:

- merged feature branch
- merged issue worktree with no uncommitted changes
- generated `client/tmp/` and `client/test-results/`

Do not delete:

- a worktree that still contains uncommitted tracked-file edits you have not
  salvaged
- another active worker’s branch or loop state

If an old dirty branch contains follow-up work, salvage that work onto a fresh
branch from `origin/main` before deleting the old branch.
