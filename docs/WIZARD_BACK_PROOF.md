# Locality Wizard Back control

Browser comment 1 requested an exit from the initial town/address form.
Work continues on `codex/battle-grounding-walk-lag`, PR #339.

The initial form and its lookup spinner now show Back. Back returns to Title;
Escape does the same on the first step, including with the address input focused.
Later steps retain their existing previous-step navigation. A per-search token
is invalidated on exit/shutdown, so a late geocode or map-preview response cannot
change the newly reopened wizard or touch destroyed UI.

Commands run in the attached worktree:

```sh
cd client && npm test
cd client && npm run build
npx prettier --check client/src/scenes/wizard.js client/e2e/wizard-back.spec.js
./scripts/run_playwright_local.sh e2e/wizard-back.spec.js \
  e2e/wizard-start.spec.js --output=tmp/wizard-back-results
git diff --check
```

750 client tests, production build, formatting and eight actual-game wizard
checks passed. The browser tests use real pointer coordinates for Back and
Find, and actual keyboard Escape while the DOM input has focus. Delayed
geocode and preview cases test leaving, reopening and releasing the old
response. The existing successful creation flow and lookup error recovery
also pass. No gameplay/balance or backend changes were needed.

Inspected screenshots are unique to this run under
`client/tmp/wizard-back-1791757645734/`: `desktop-wizard.png`,
`desktop-title.png`, `portrait-wizard.png`, `portrait-title.png`,
`comment-wizard.png`, `comment-title.png`, `geocode-search.png`, and
`preview-search.png`. The comment viewport is 793x837; desktop is 1440x900;
portrait is 390x844. Back is visible alongside Find & Continue without overlap;
the input and slider disappear on return to Title. Browser log:
`client/tmp/wizard-back-browser.log`. Unit/build logs:
`client/tmp/wizard-back-unit.log`, `client/tmp/wizard-back-build.log`.
