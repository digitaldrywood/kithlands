# Readable contextual battle details

PR #339, branch `codex/battle-grounding-walk-lag`.

The existing picker kept choices below the battlefield, but its11px description was limited to28px even when the phone strip had unused room. The preceding reference journey captures show the problem: `client/tmp/reference-combat-journey-1793057322702/390-potion-targets.png` and `client/tmp/reference-combat-journey-1793057422200/800-potion-targets.png`.

The picker now uses14px text with1.4 line height. Description height grows with its content up to six lines, bounded by the actual strip height while reserving a44px choice row. Long lists and descriptions scroll independently. This preserves the existing lower command/message area and does not cover party status or enlarge over the battlefield. At610px the letterboxed desktop strip remains short, so long help still needs scrolling rather than shrinking the type.

Choice details are a named, focusable region in the existing Tab/Shift+Tab loop. Space, arrows, PageUp/PageDown and Home/End scroll help normally while focused; Enter does nothing there. Reading must not commit the previously selected action. Escape still backs out. Inspecting another choice resets description scrolling to the top. Pointer/touch choice activation and numeric shortcuts retain their behavior. No mechanics, content, combat amounts, animation assets or save format changed.

## Native acceptance

With isolated Vite3613/API8692 running, from `client/`:

```sh
VITE_PORT=3613 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/battle-context-choices.spec.js e2e/cinder-item-use.spec.js --output=tmp/battle-details-native-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

All11 native cases pass in2.8minutes. Four contextual cases at1440×900,610×837,800×600 and390×844 verify font size, nonoverlapping list/details bounds, containment within the command strip and separation from party status. Native Tab reaches details; Space/Enter preserve selection and the item menu; End reaches the bottom. The existing flow then completes targeting, Back/Escape, Rogue ability selection and a real server round. An additional phone case uses touch item targeting/back. Six Potion/Ether cases preserve actual one-item consumption, HP/MP restoration, effect contact at frame2, body/weapon visibility and grounded recovery at desktop/phone/reduced motion. These use controlled showcase/gesture fixtures and do not claim fresh-game acquisition or a human timing study.

Log: `client/tmp/battle-details-native-20261026.log`. Context captures: `client/tmp/battle-context-1793057825720/` (29PNG). Item captures: `client/tmp/cinder-item-use-1793057946217/` (30PNG). All59 images were opened and inspected through all ten contact pages, with original mappings in `client/tmp/battle-details-{context,items}-review-20261026/index.json`. The default-size item description is readable; phone help uses the otherwise spare strip space, and the short610px area has keyboard-accessible overflow. No changed panel obscures battlefield targets or party status.

870 client tests in100 files, production build and full formatting pass. Logs: `client/tmp/battle-details-{unit,build,format}-20261026.log`. `git diff --check` passes. The changed existing native specs remain registered in hosted combat CI and their artifact directories are already retained. No Go/shared change warrants a new balance or database result. The owner3609 tab/server/saves were not restarted or refreshed. In-app browser connection was unavailable, so repo-local Playwright supplied acceptance evidence.

The full goal remains active. Unscripted opening-session clarity/pacing, remaining terrain/art composition and broad integrated acceptance remain separate work; current-head hosted/general CI is still required.
