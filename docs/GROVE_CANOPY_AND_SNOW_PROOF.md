# Grove landmarks and snow transition

PR #339, branch `codex/battle-grounding-walk-lag`, follows `0d90844`.

## Findings and change

The pale cross near the natural grove is a real snow tile, not corrupted grass. The authoritative generated map contains tile16 at124,128 beside wilderness_1 in the Cadott seed24 fixture. Its cold encounter meaning comes from Go. Snow was absent from the shared meadow presentation palette, so it bypassed the meadow pixel-feathering path and used the old solid quadrant edge. The corrected native before test reports zero grass pixels in a sampled row of the adjacent grass tile; final rendering contains8 grass and8 frost pixels in the same row. A shared snow palette now enables the existing feathering renderer. No Go terrain IDs, heights, collision, encounter selection, resources or deadlines change.

This fixes the hard cross-shaped transition, not the underlying placement of an isolated snow pocket in a meadow. That wider biome-composition issue remains open. No palette change is presented as a complete landscape redesign.

Inspection also found that the natural-grove family still used flat two-tree symbols beside the detailed meadow props. Two original transparent grove/spring images now replace those family variants. The new paths are `client/public/sprites/world/landmarks/natural-grove-canopy.png` and `natural-spring-canopy.png`. Registry keys, variant IDs, selection hash,64×64 frame, origin, depth and interactions remain unchanged. Original files are retained; other landmark families are not replaced by this slice.

The built-in ImageGen tool generated the grove and edited that source into the matching spring. No CLI fallback, runtime generation or paid runtime dependency was added. The full prompts, original1312×1199 RGBA outputs, approved64×64 exports, normalization script and provenance are in `art-source/environments/grove-canopy/`. The model identifier was not exposed and is not invented in metadata. The visually inspected style reference was the existing meadow-props atlas; it was not passed as an image input. The spring edit used the generated grove as its image input.

Technical export crops transparent padding and fits the object within56×56 before placing it in the unchanged64×64 frame. Both alpha bounds are4,12–60,60. Lanczos export produced bright edge flecks and was rejected outside runtime. Nearest-neighbor export was inspected at64px and enlarged, then installed only after review. Re-running `normalize.sh` reproduces the approved pixel data exactly; PNG encoder timestamps can differ. Runtime PNGs match their archived approved files byte-for-byte. Source artwork does not affect the running game without the local static assets.

## Actual game proof

Final acceptance:13/13 cases pass in2.0minutes on isolated Vite3613/API8692, log `client/tmp/grove-environment-final-20261026.log`:

- Three new grove/snow cases at1440×900,800×600 and390×844 verify feathered pixels and exact map/resource preservation through redraw.
- Each explicitly renders both registered landmark textures in the real World scene, verifies decoded64×64 assets and captures them. These two-variant switches are controlled rendering fixtures, not changes to server state or ordinary variant-selection behavior. The scene is then redrawn normally.
- Three existing resource-habitat cases retain herb/wood/mineral/rare-mineral props, camera framing and canonical tile/resource records.
- Three existing landmark cases retain all five families, stable identity through native town travel and save/reload, and the phone's named touch entrance.
- Four existing world-walking/culling cases retain bounded visible terrain at1440,800,645 and390px, including zoom. These do not constitute a new all-twelve-class walk-art acceptance claim.

All60 final PNGs were opened and inspected on ten contact sheets, with exact source mappings in `client/tmp/grove-environment-review-20261026/index.json`:

- `client/tmp/grove-snow-fringe-1793054697274/`:12 PNGs and three zero-error audits, each with8/8 grass/frost pixels, both variant keys and unchanged canonical map/resources.
- `client/tmp/meadow-ground-1793054705711/`:30 habitat captures.
- `client/tmp/overworld-landmarks/proof-1793054722558/`:10 family/entrance/settlement/save-return captures.
- `client/tmp/grove-environment-final-20261026/`:8 walking/culling captures.

Before proof: `client/tmp/grove-snow-fringe-1793053950354/1440-grove.png`, opened and inspected; failing pixel assertion in `client/tmp/grove-snow-before-20261026.log`. Initial harness log `grove-snow-baseline-20261026.log` used an incorrect Container API and is not the reproduced product failure.

An intermediate six-case art run passed while the actual route still selected the old spring variant. Screenshot inspection exposed that coverage gap. The matching spring was then created and the test strengthened to cover both textures explicitly. Intermediate logs `grove-canopy-native-20261026.log` and `grove-canopy-final-20261026.log` are retained; only the final combined run above is current acceptance.

## Commands and gates

From the repository root:

```sh
make test
make validate-data
sh -n art-source/environments/grove-canopy/normalize.sh
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/walk-regression.yml")'
git diff --check
```

From `client/`:

```sh
VITE_PORT=3613 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/grove-snow-fringe.spec.js e2e/meadow-ground.spec.js e2e/world-terrain-visibility.spec.js e2e/overworld-landmarks.spec.js --output=tmp/grove-environment-final-20261026
npm test -- --run
npm run build
npx prettier --check --ignore-path .gitignore .
```

All870 client tests in100 files pass, including landmark asset contracts. Production build, full client formatting, Go tests, shared validation, YAML/diff and shell syntax checks pass. Logs: `client/tmp/grove-environment-{unit,build,format,data}-20261026.log` and `client/tmp/grove-canopy-go-20261026.log`. No simulator, new DB integration or new closed-page respawn result is claimed: this is presentation-only work. The new native spec/proof directory are retained in the existing walking CI suite without removing tests or weakening gates.

Owner sessions, services and saved data were not refreshed, reset or restarted. Current renderer assets are served by a fresh page on the isolated build; existing HMR-disabled pages need a normal reload. This does not refresh the owner's server-side startup catalog of equipment icons.

## Still open

Keep environment acceptance open: isolated snow/biome placement, macro terrain shapes, repeating canopy rows, authored path/landmark composition and the remaining flat overland landmark families need further work. The grove/spring family provides an inspected original-art reference, not approval of every map family. Integrated combat and the realistic first-fifteen-minute clarity/pacing playtest remain part of the full goal. No opening economy, new gathering outcomes or human navigation study is claimed here. Latest-head hosted CI still needs its own result; general CI retains the owner-selected self-hosted runner configuration.
