# Cave landmark art — 2026-10-26

The original cave marker was a flat arch. An original mossy outcrop with a dark opening replaces its image through `shared/overworld_landmarks.json`. Its stable variant ID, texture key, 64×64 frame, node and interaction rules remain unchanged; a 12px presentation offset applies to marker and attached badges. The former file is retained. Built-in image generation produced the transparent source, with exact prompt, references and reproducible nearest-neighbor/alpha-threshold export documented in `art-source/environments/cave-outcrop/`. Normalization matched the installed PNG with absolute error 0. The generated source had a translucent halo; the threshold removes it.

The natural seeded starter chooses the ruined-arch variant, so the visual test temporarily changes the client-side node ID of that existing marker to a stable cave-selecting ID, redraws the actual World scene and uses the test bridge to approach it. It does not mutate the server or prove a normal cave entry. At desktop, default and phone sizes the actual catalog picks the cave texture and offset and the named prompt appears. The player still overlaps the opening's lower portion on the tested approach; other approaches and broader map composition remain open. The early temporary comparison manually shifted an already offset ruin marker another 12px; that double-offset image is not the accepted catalog result.

`client/tmp/cave-art-final-20261026.log` records six passed native cases: three cave fixture renders plus the existing three family/badge, town round-trip, touch prompt and save/reload regressions. Final postrender cave checks pass 3/3 in `client/tmp/cave-art-render-final-20261026.log`; final captures `client/tmp/cave-landmark-art-1793073940959/{1440,800,390}-approach.png` were opened individually. The ten family/town/save captures from `client/tmp/overworld-landmarks/proof-1793073863702/` were inspected as `client/tmp/cave-art-review-20261026/landmarks.png`, indexed in `index.txt`. `client/tmp/cave-art-offset-probe-20261026.log` covers the earlier controlled comparison only.

Commands from `client/`:

```sh
VITE_PORT=3615 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/cave-landmark-art.spec.js e2e/overworld-landmarks.spec.js --output=tmp/cave-art-final-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

875 client tests, build, formatting, `make test`, `make validate-data`, workflow YAML and `git diff --check` passed. Logs: `client/tmp/cave-art-{unit,build,format,go,data}-20261026.log`. No combat/progression pacing changed, so no new balance simulation is claimed. The hosted visual suite includes the new fixture; current-head hosted CI is still required. The isolated server was used; the owner's server and saves were not touched.

## Hosted test timeout follow-up

Hosted run `40448107200`, walking job `122004100031`, failed all three new cave cases at `page.screenshot` after the default 30-second test budget; 37 other cases passed. The job log is `client/tmp/ci-cave-walking-20261026.log`. The postrender wait previously passed `resolve` directly to Phaser, causing the event's renderer argument to become the Playwright evaluation result. The callback now resolves without returning that renderer. The existing postrender wait, marker/offset/prompt assertions and screenshots remain. This explains the observed local reduction from 18–19 seconds per cave case to 1.9–2.6 seconds; the remote result is not yet established.

The corrected isolated run `client/tmp/cave-ci-fix-20261026.log` passes all six cave and landmark cases in 18 seconds. The three final approach captures `client/tmp/cave-landmark-art-1793075205018/{1440,800,390}-approach.png` were opened individually; the ten family/town/save captures were inspected at `client/tmp/cave-ci-review-20261026/landmarks.png`, with originals indexed in `index.txt`. Client unit/build/format logs: `client/tmp/cave-ci-fix-{unit,build,format}-20261026.log`. This is a test-only repair; it does not change the asset or gameplay. Fresh hosted CI remains required.
