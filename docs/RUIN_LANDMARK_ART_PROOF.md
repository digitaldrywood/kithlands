# Ruined arch landmark

PR #339, branch `codex/battle-grounding-walk-lag`, follows `8db8f25`.

The `dungeon-ruins` overland variant used a flat, blocky arch while the nearby approved grove has detailed pixel art. An original weathered stone arch now replaces that variant via `shared/overworld_landmarks.json`. Its texture key, stable variant selection, 64×64 frame, origin, depth, interaction, map and save data are unchanged. The original file remains in place. This is one landmark variant, not acceptance of every landmark or full landscape composition; the cave and other flat families remain.

Built-in image generation used the former ruin marker as a purpose reference and the approved grove as a style reference. The original transparent output, exact prompt, generation metadata, nearest-neighbor normalization and approved export are in `art-source/environments/ruined-arch/`. The model identifier was not exposed. `sh normalize.sh` reproduces approved pixel data exactly (ImageMagick absolute error 0); alpha bounds are (4,12)–(60,60), with zero near-key green opaque pixels. No runtime generation or paid dependency is introduced.

Actual-game checks on isolated Vite3615/API8694:

```sh
cd client
VITE_PORT=3615 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/ruin-landmark-art.spec.js e2e/overworld-landmarks.spec.js --max-failures=1 --output=tmp/ruin-art-final-20261026
```

All six cases pass in `client/tmp/ruin-art-final-20261026.log`: three render the naturally selected `wilderness_2` ruins variant and its named nearby prompt at 1440×900, 800×600 and 390×844; three retain the existing five-family, badge, town round-trip, native phone entrance and save/reload checks. The ruin camera setup uses the test bridge; it does not assert a normal journey or entry to the ruin. The first art test attempted to enter immediately after artificial repositioning, but the authoritative travel checkpoint rejected that setup; the failed log is `client/tmp/ruin-art-candidate-20261026.log`. No entry assertion was removed from an existing test. This is a visual marker change and no interaction behavior was modified.

All six final ruin screenshots in `client/tmp/ruin-landmark-art-1793070803227/` and ten landmark/round-trip screenshots in `client/tmp/overworld-landmarks/proof-1793070792181/` were inspected; the latter are mapped in `client/tmp/ruin-art-review-20261026/index.txt`. The arch is readable at game scale and shares the grove palette. At the exact interaction position the player partially covers the opening; the adjacent clear view shows the entrance, and the existing named prompt remains visible. This placement limitation and broader authored environment work remain open.

`cd client && npm test -- --run` passed 874 tests; `npm run build` and full Prettier check passed. `make test`, `make validate-data`, `sh -n art-source/environments/ruined-arch/normalize.sh`, YAML parse and `git diff --check` passed. Logs are `client/tmp/ruin-art-{unit,build,format,go,data}-20261026.log`. The new spec is included in the existing hosted walking/environment suite. No mechanics, balance, database or walk-atlas change; no new simulation is claimed. Owner server/session/saves were not restarted or changed. Fresh hosted CI is pending.
