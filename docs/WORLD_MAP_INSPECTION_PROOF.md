# Named places and visible map destinations

PR #339, branch `codex/battle-grounding-walk-lag`.

## UI-only opening audit

A separate1280×900 browser profile used a new account through the normal title screen and Quick start. Decisions came from screenshots, accessible menus, visible prompts and ordinary held arrow keys/Enter. No test bridge, game-state inspection, seeded route helper, grant, forced encounter or direct game action was used in this manual portion. In-app browser connection was unavailable; locally installed Playwright controlled its own profile. Owner3609 and saved adventures were untouched.

The audit opened the party menu, journal and world map, entered Town Hall, walked around the garden, reached the General Store entrance and talked to its merchant. It exposed anonymous map dots with names far below the overview. An adventure badge also obscured the gold campaign destination at the same entrance. These are the problems fixed in this slice.

It also took trial and error to align the character with the shop entrance and reach the merchant across the counter. Screenshots show the character at roof height before the entrance prompt activates, and apparently clear floor did not give a direct approach to the merchant. These are presentation/collision-alignment findings for investigation, not a proven new collision-code defect. Very short keypresses can miss a polled movement frame, which also affected this agent's attempts. The shared accepted walk atlas was not changed.

This manual attempt stopped at the merchant's second dialogue line. A30-second tool wait expected the shop dialog too early and reset its controller; the final recorded frame still shows the ordinary dialogue and Enter prompt. Zero page errors had been observed before that interruption. A process check then found no remaining browser for that profile. This is an interrupted agent UI audit, not a game freeze, completed purchase, full fifteen-minute route, or new-human timing estimate.

Original27 PNGs and retained video: `client/tmp/ui-opening-1793058275138/`. All27 images were opened and inspected on all five contact pages, mapped by `client/tmp/ui-opening-review-20261026/index.json`. Before map: `06-map.png`; ambiguous shop approach: `15-shop-step.png`, `17-shop-ready.png`; final video frame: `28-before-control-timeout.png`. The video is `video/page@dbb0eb4fef5274a818c75f512fa2002a.webm`; extract its terminal frame with `ffmpeg -sseof -0.5 -i <video> -frames:v 1 <unique-output>.png`.

## Change

The map opens with the tracked destination selected and named. A native44px place selector can inspect any existing mapped location. The header reports its compass direction from the party, while a white ring and clamped canvas label identify the corresponding dot. The gold destination ring is drawn above adventure badges. Inspecting another place does not change journal tracking or move the party; reopening restores the destination selection.

The full overview fits the current body height, including800×600, using a ResizeObserver and contained aspect ratio. The observer disconnects on close/shutdown. Adventure cards remain below the overview, reachable through Find adventures. Names, target identity, terrain and coordinates still come from current game/scene data; only map presentation changed. Compass direction is geographic orientation, not a promised walkable straight route.

## Native acceptance

From `client/`, with isolated Vite3613/API8692 already live:

```sh
VITE_PORT=3613 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/world-map-place-inspection.spec.js e2e/adventure-map-navigation.spec.js --output=tmp/map-place-final-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

All six cases pass in1.8minutes: named-place inspection at1440×900,800×600 and390×844; existing route navigation to both adventures and retreat at1440,645 and390. Inspection checks compare the entire game state before/after, verify the destination reappears on reopening, preserve native field keys without world movement, and require the full map within the body. Phone menu actions use taps; native select changes use Playwright's selection API, so this is not a claim of selecting an OS dropdown solely with taps. Route regression uses keyboard/pointer/touch as already authored, encounters disabled, normal server travel and entrance actions; it does not establish encounter pacing.

Log: `client/tmp/map-place-final-20261026.log`. Inspection originals/audits: `client/tmp/world-map-inspection-1793059631770/` (12PNG). Route captures: `client/tmp/map-place-final-20261026/` (24PNG). All36 final images inspected on six contact pages, mapped by `client/tmp/map-place-final-review-20261026/index.json`. Initial selection review revealed the800px map clipping below the footer; that candidate was rejected and the fit requirement added. Earlier logs retain harness mistakes: spawn points were read from the wrong object, phone labels do not include the printed W shortcut, and a wrapping native label required the combobox's actual accessible name. Tests were corrected without changing destination or travel mechanics.

870 client tests/100 files, build and full formatting pass. Logs `client/tmp/map-place-final-{unit,build,format}-20261026.log`. Workflow YAML parses and diff whitespace checks pass. The new inspection spec/artifacts are registered in hosted gameplay CI. No backend/shared mechanics changed, so no new balance simulation or DB-integration result is claimed. Parent67dd2ae hosted run40421487578 passes all12 suites and protected summary; new-head CI is required. General CI stays on the owner's requested self-hosted setup.

## Remaining acceptance

Complete the uninterrupted UI-only exploration/shop/battle/crafting route after resolving entrance/approach clarity. Keep resource habitat/macro terrain and broad reference battle acceptance open. This change closes the map-identification defect; it does not close the full goal or establish a human fifteen-minute completion time.
