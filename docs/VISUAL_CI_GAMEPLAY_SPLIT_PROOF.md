# Visual CI gameplay workload split

Branch `codex/battle-grounding-walk-lag`, draft PR #339. This changes CI scheduling only.

Hosted visual run40393142531 at da931cf exhausted the gameplay job's30minute budget. Browser installation ran from20:10:16 to20:25:10UTC (14m54s); native testing then ran until20:39:58, when the job was cancelled. The log records57 passing cases of64, no test failures, and an unfinished remainder. Ten other matrix suites passed. The protected summary correctly failed; this is not a passing gameplay acceptance. Source log: `client/tmp/ci-gameplay-timeout-40393142531.log`.

The existing21 gameplay spec files are now divided into12 exploration/gameplay files and9 shop/art files, with an independent matrix job for each. Test discovery resolves29 and35 cases respectively, preserving all64. A Counter comparison across the entire workflow confirms the exact multiset of all90 current spec registrations is unchanged, including the newly registered menu navigation spec from ed91f6b. No checks were removed, skipped or weakened. All-suite required summary, fail-fast:false and the existing per-job timeouts remain intact. General CI's owner-requested self-hosted labels are untouched.

Validation from the active worktree:

```sh
ruby -e 'require "yaml"; YAML.parse_file(".github/workflows/walk-regression.yml"); puts "workflow syntax OK"'
git diff --check
```

Both pass. The spec multiset/distribution audit is `client/tmp/ci-suite-split-1793090200.json`. Each distributed command was also resolved with `VITE_PORT=3609 npx playwright test --config=e2e/playwright.config.js --list` followed by its exact workflow spec list (from `client/`). Logs: `client/tmp/ci-gameplay-list-1793090200.log` and `client/tmp/ci-shops-list-1793090200.log`. No game source changed in this chunk; existing native evidence is retained. Remote acceptance requires the new twelve-suite run to pass. Parent4e96332 full eleven-suite run40388617174 remains green.
