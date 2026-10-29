# Worn meadow path edges

PR #339, branch `codex/battle-grounding-walk-lag`, parent `4e96332`.
This improves the road surface boundary. It does not close the broader authored
landscape, canopy, landmark or first-visit pacing acceptance requirements.

## Visible change

The meadow used solid rectangular dirt masks. `meadowPath.js` now paints a
connected dirt core, rounded junction/end geometry and a narrow broken grass
fringe into cached terrain textures. The existing eight stable ground variants
also vary path pixels; palette and neighboring non-path surfaces are unchanged.
`shared/field_presentation.json` selects the `worn` presentation style.

Pixel coverage keeps the palette crisp instead of blurring it. Straight paths,
turns, ends and branches remain connected; shared diagonal quarters fill the
inside of broad two-by-two roads without grass pinholes. Bridges retain the
existing bridge renderer. This is code-native canvas terrain art, not generated
bitmap replacement. Texture creation happens on map construction/redraw, not in
the walk update. The native check verifies road texture identity across redraws.

Go's map, collision, encounter areas, gathering sites and respawn deadlines stay
unchanged. No position, save, resource identity or mechanics migration. Existing
walk, battle, town, landmark and dungeon images are untouched.

Source inspection and actual-game side-by-side:
`client/tmp/meadow-path-review-1793085200/path-before-after.png`.
Initial path tests: continuous centers/edge joins across every orthogonal mask,
bounded fringe, no holes in a full shared road block. Three new meaningful tests;
869 total client tests across100files pass.

## Native verification and inspected proof

Owner API8689/Vite3609 remain healthy; no service restart, owner-browser change
or save reset. Direct Playwright keeps the wrapper from stopping occupied ports.
From `client/`, prefix commands with:

```sh
VITE_PORT=3609 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache"
```

Final commands:

```sh
npx playwright test --config=e2e/playwright.config.js e2e/meadow-ground.spec.js e2e/overworld-landmarks.spec.js --output=tmp/meadow-path-final-native-1793084800
FIRST_SESSION_WIDTH=390 npx playwright test --config=e2e/playwright.config.js e2e/public-trails.spec.js e2e/first-session-route.spec.js --output=tmp/meadow-path-route-1793084600
```

All10 pass: three meadow habitat/cached-redraw cases at1440/800/390; three existing
landmark classification, town round-trip, save/reload and phone entrance cases;
three normal public-road routes with herbs, crafting, shop approach and saved
absolute harvest deadlines; one normal fresh phone party with real starting
money/levels, encounters, spell purchase, optional Heron encounter/supplies,
crafted blade, gems, mill bats, save/history and reload. No debug grants or disabled
encounters in that fresh-route case. Its93.635second automation duration is not a
human first-visit estimate or proof of fifteen-minute pacing. All party members
remain level1 after that two-fight detour; the existing campaign alternative is
in `FIRST_FIFTEEN_MINUTES.md`.

All85 final PNGs and ten baseline PNGs inspected, with source map in
`client/tmp/meadow-path-review-1793085200/index.json` and native01–16 review pages:

- Before: `client/tmp/meadow-ground-1793043928400/` (10PNG).
- Final habitats: `client/tmp/meadow-ground-1793044754424/` (30PNG).
- Landmarks/entry/reload: `client/tmp/overworld-landmarks/proof-1793044773062/` (10PNG).
- Public roads/harvest/craft/reload: `client/tmp/public-trails-1793044798376/` (21PNG).
- Normal opening: `client/tmp/first-session-390-1793044703538/` (24PNG), including
  milestones/requests showing authoritative economy, party and saved progress.

Road edges read as worn dirt against grass. Wide intersections remain filled;
resource habitats/props, foreground reveal, named entrance controls, town artwork,
Old Mill progress and player framing remain intact. Canonical map/resource JSON
compares exactly before/after the habitat inspection/redraw. Public-route tests
also compare the actual wide-road join pixel to its expected dirt surface.

## Rejected landmark experiment

An original watermill marker was generated with built-in image_gen and a pose
reference. Source and normalized candidate were inspected. Native placement exposed
that Old Mill's trail is bound to the town world node; replacing that marker
misrepresented Town Hall. The actual approach scene already has authored mill
entrance art. All marker registry/renderer/test changes were removed before this
commit. No generated image or new landmark mapping is shipped.

Unapproved candidate/source guide/raw image/exact prompt and generator metadata:
`client/tmp/old-mill-landmark-candidate-1793083600/metadata.json`, `raw.png`,
`source-pose-guide.svg`, `old-mill.png`, `source-review.png`, `rejection.txt`.
This candidate is not approved for runtime or treated as completion of landmark
composition. Broader world composition and the abrupt pale ground patch visible
near the grove still need a terrain-aware authoring pass, not extra decorative
stamps or a misleading entrance icon.

## Local gates and remote status

All pass:

```sh
cd client && npm test
cd client && npm run build
cd client && npx prettier --check --ignore-path .gitignore .
make test
make validate-data
git diff --check
```

Logs under `client/tmp/`: `meadow-path-{unit,build,format,go,data}-1793084600.log`,
`meadow-path-final-format-1793085000.log`,
`meadow-path-final-native-1793084800.log`, `meadow-path-route-1793084600.log`.
No mechanics, progression, quest, transport or balance change; no new simulator
required. Unchanged backend full-race/vet/build/lint proof is in
`CINDER_MELEE_POSE_PROOF.md`. No walk atlas or movement code changed, so this is
not a new all-class walk approval; existing all-class hosted walking gate passes
on parent4e96332. Parent hosted run40388617174 has ten suites green with
adventure-recovery still active at this audit. General CI remains queued on the
owner-selected self-hosted labels; the repository has zero registered runners.
This new chunk requires its own remote gates.
