# Development proof-artifact watcher isolation

While diagnosing the world-shop regression, Vite logged `page reload` events
for HTML files in Playwright's trace-output directories. Vite emits a
`vite:beforeFullReload` notification for these files. Its client then filters
HTML notifications by the active page path; a notification alone does **not**
prove that the main game reloaded. The earlier trace teardown timeout's cause
remains unconfirmed.

The development watcher now ignores `tmp/`, `test-results/` and
`playwright-report/` paths, excluding proof artifacts from HMR processing.
Runtime source files remain watched.

`e2e/dev-artifact-isolation.spec.js` creates an HTML proof file, opens a normal
fresh game, observes the real Vite hot-client event, then rewrites the HTML.
After the watcher/debounce window it requires no reload notification, no main
frame navigation and the same World game ID. A screenshot records the retained
game. This exercises the actual dev server rather than matching configuration
strings.

The baseline used a temporary copied Vite configuration with only the new
watch block removed, on port 3611. This isolated reproduction did not modify
the running player's configuration. The corrected test **fails** against that
baseline with the artifact path in the received reload-event array, and
**passes** against the running port 3609 configuration.

From `client/` with the sourced worktree environment and local browser/profile
variables:

```sh
VITE_PORT=3611 npx playwright test --config=e2e/playwright.config.js e2e/dev-artifact-isolation.spec.js --output=tmp/dev-artifact-signals-before-1792968000
npx playwright test --config=e2e/playwright.config.js e2e/dev-artifact-isolation.spec.js --output=tmp/dev-artifact-signals-after-1792968000
npm run build
npx prettier --check --ignore-path .gitignore .
```

The corrected regression passes in 4.1 seconds; build and formatting pass. The
first absence-of-navigation-only probe passed even on the baseline, so it was
strengthened to observe the actual HMR notification. No gameplay assertions
were removed. The user's adventure was saved before Vite's configuration
restart and resumed afterward. The temporary baseline server was stopped.
