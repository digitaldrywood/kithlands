# Walk recheck — 2026-10-26

PR #339, branch `codex/battle-grounding-walk-lag`, parent `45656d6`. This is an audit of unchanged assets and playback, not a replacement or final art approval.

The mandatory geometry audit passed all twelve native 384×512 RGBA sheets: `client/tmp/walk-contract-20261026-latest.log`. On isolated API8694/Vite3615, the three required native Playwright specs passed 15/15 cases in `client/tmp/walk-audit-20261026-latest.log`: all cardinal sequences in World and Town for every class, real Space party cycling, and audit-party cycling at 800×600 and 390×844. The all-class sequence uses slowed sampling to observe frames. The independent normal-speed `walk-rendered-cadence.spec.js` passed all six combinations of three speeds and 60/20 FPS; `walk-visual-review.spec.js` passed its actual audit-scene Space cycling and walking/stopping capture, in `client/tmp/walk-visual-20261026-latest.log`.

`/sprites.html` was loaded and the walk gallery captured: `client/tmp/walk-gallery-grid-20261026.png`, split into 13 inspected portions at `client/tmp/walk-normal-review-20261026/gallery-01.png` through `gallery-13.png`. The visual-review run captured six east-facing postrender frames and a stopped screen for each class in `client/tmp/walk-visual-review-1793068983325/`; all 72 frames and 12 stopped captures were inspected in `client/tmp/walk-normal-review-20261026/frames-{1,2,3,4}.png` and `stopped-{1,2,3}.png`. Frames show stable character identities and no obvious cropping in this view. Mender, Cinder and Sage in particular have small visible stride changes under robes, which may read as gliding despite technically changing frames. Warrior and others also need live-motion aesthetic judgment rather than passing solely on geometry or frame count.

The Codex in-app browser backend was unavailable in this session. The tests used isolated Playwright Chromium and retained full audit-scene videos under `client/tmp/walk-audit-20261026-latest/`; those videos were not reviewed as live motion. The rendered-frame contact sheets are useful evidence but do not establish natural motion, all-direction visual quality, touch input quality or human approval. Do not mark the all-class visual gate complete on this basis. Keep the accepted atlas contract and existing hashes; investigate the robed walk poses with the controlled character production workflow before replacing any art. No owner session, server or save was touched.

Commands from `client/`, with `VITE_PORT=3615 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache"`:

```sh
npx playwright test --config=e2e/playwright.config.js e2e/walk-all-classes.spec.js e2e/world-space-cycle.spec.js e2e/world-walk-audit-party.spec.js --output=tmp/walk-audit-20261026-latest
npx playwright test --config=e2e/playwright.config.js e2e/walk-rendered-cadence.spec.js e2e/walk-visual-review.spec.js --output=tmp/walk-visual-20261026-latest
```

The gallery capture was made by a temporary Playwright spec and retained as `client/tmp/walk-gallery-probe-20261026.log`; the temporary spec was removed. No gameplay code or visual asset changed. CI run `40437515004` on `ae924ef` passed all hosted visual suites; `0f459fb` visual CI remained in progress at this check, and general CI stayed queued on the owner's requested self-hosted runner. Full current-head CI remains open.
