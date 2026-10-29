# Touch path around an interior keeper — 2026-10-26

A tap on walkable floor beyond a keeper in a normal quest interior did not move the party even though another route was available. The tap-to-walk A* searched tile walkability without checking NPC occupancy; Town's actual movement rejected the first step into the keeper. Before-change native reproduction at 390×844 left the party at (12,6) instead of reaching (14,6) across the keeper at (13,6): `client/tmp/touch-npc-before-20261026.log` and `client/tmp/touch-npc-route-1793075774978/before.png`.

Town now exposes the same occupancy check used by manual movement to the tap pathfinder, so paths avoid NPC tiles. Other scenes retain their existing collision behavior; the pathfinder remains an input aid and does not change server-owned game state. Tapping an occupied destination retains the existing single-step fallback. The 540px rerun exposed another issue: an invisible legacy touch-HUD reservation still blocked part of rooms using the current interior menu. The control-area test now excludes that legacy area when the actual interior menu is installed. The observed 540px failure before this second fix is in `client/tmp/touch-npc-final-20261026.log` (six cases passed, one failed).

Seven corrected actual-game cases pass in `client/tmp/touch-npc-corrected-20261026.log`: three normal-quest interiors at 375×667, 390×844 and 540×720 tap a floor tile on the opposite side of the keeper and reach it around the occupied tile; three existing interior flows cover touch floor movement, dialogue, menus and return; one world touch case covers D-pad, map tap and adventure entry. Setup travels by keyboard; the tested reroute uses an actual touchscreen tap. This is not a fully touch-only first-session playthrough. No debug state is mutated or rewards granted.

All 35 final screenshots were inspected on six contact sheets in `client/tmp/touch-npc-review-20261026/`, with originals indexed in `index.txt`. The target before/after captures are `client/tmp/touch-npc-route-1793076275900/{375,390,540}-{before,after}.png`; other captures are in `client/tmp/portrait-interior-1793076222159/` and `client/tmp/exploration-touch-1793076218380/`.

```sh
cd client
VITE_PORT=3615 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/touch-npc-route.spec.js e2e/exploration-touch.spec.js e2e/portrait-interior.spec.js --grep 'tap-to-walk routes|touch exploration|390 interior|375 interior|540 interior' --output=tmp/touch-npc-corrected-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

875 client tests, production build, formatting, workflow YAML and `git diff --check` pass; logs are `client/tmp/touch-npc-final-{unit,build,format}-20261026.log`. The initial format run failed only on the temporary probe, which was removed before the final gate. No Go/shared data or save logic changed. The new scenario is registered in hosted interiors CI; fresh remote results are required. The owner's services and saves were not touched.
