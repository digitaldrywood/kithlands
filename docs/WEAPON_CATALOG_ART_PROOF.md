# Complete weapon icon catalog

Branch `codex/battle-grounding-walk-lag`; draft PR #339. Adds33 explicit weapon icons and preserves the13 previously approved icons: all46 weapon definitions now resolve canonical local art.

## Art and content scope

Original64x64 SVG artwork extends the established outlined item system. Distinct silhouettes cover swords, daggers, single/double axes, bows, clubs/hammers and staff heads. Material palettes, grips, facets and restrained rune/crown/eye details distinguish later equipment without using letter placeholders. Wooden Staff is straight; Oak Staff is a crook. Mountainvoice uses a mountain mark rather than implying lightning damage.

The deterministic source builder and per-item art profiles are retained in `art-source/items/weapon-catalog/`. Candidates stayed in `client/tmp/weapon-catalog-candidates-1793094700` for review before installation. Three galleries show all33 at128/64/32/24px on dark/light backgrounds. Separate final Wooden Staff and Mountainvoice views were inspected. Geometry review caught four axe heads touching the top edge; their composition was translated down before final native acceptance, and `final-axe-review.png` was inspected. All33 final rasterizations are64x64 with transparency and no edge clipping (`geometry.json`). Runtime SVGs exactly match the deterministic candidates.

`client/tmp/weapon-catalog-content-delta-1793098700.json` records that removing only the33 added `icon_key` fields makes shared content identical to the previous head. Stats, costs, classes, levels, elements, recipes, drop rates and merchant tiers are unchanged. The server's existing item projection resolves art from the canonical equipment base, including rolled instances; no client fallback-name lookup or game rule was introduced.

This chunk changes UI icons, not held world/battle sprites. None of these33 weapons has a crafting recipe. Existing Iron/Steel/Mythril recipe art and six gem icons remain unchanged and retain their prior native acceptance. Armor/accessory fallbacks remain separate work.

## Actual-game verification

The owner's API8689/Vite3609 session was preserved. Since the API loads content at startup, a separate managed API8691/Vite3612 was started with current shared data and the already built compatible server binary, using the existing database and disposable test accounts. Debug fixtures are enabled only on this test process. An initial test-process configuration omitted the debug setting and stopped at fixture setup; the failure is retained, not counted as art acceptance. The old audit API reproduces the missing first weapon image in `weapon-catalog-before-1793095400.log`.

Final native command from `client/`:

```sh
VITE_PORT=3612 PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/ms-playwright" XDG_CONFIG_HOME="$PWD/tmp/xdg-config" XDG_CACHE_HOME="$PWD/tmp/xdg-cache" npx playwright test --config=e2e/playwright.config.js e2e/weapon-catalog-art.spec.js --output=tmp/weapon-catalog-final-1793097500
```

**3/3 pass** at1440x900,800x600 and touch390x844, in3.5minutes. Each case grants33 individual equipment instances through Go, browses each actual owned row, previews and equips it on an allowed party member, waits for the real equip response and verifies the equipped icon decodes at64x64 with the exact shared key. That is99 real equips. Each then enters a real server-owned settlement shop, interacts with its proprietor and checks all11 newly illustrated weapons actually offered by that merchant. Native stock paging and nine preview checks use the same canonical assets; higher-tier weapons are not falsely added to stock. Clean shop exit and zero browser/asset HTTP errors are required.

These are advanced visual fixtures (party level25 and Go item grants), not earned-progression or affordability proof. The first phone run exposed the four-person rapid-tap guard bug; `DIALOG_INPUT_PRIORITY_PROOF.md` records its separate fix and retained two-person behavior. The final art test asserts the actual character identity after every transition, rather than trusting its local index.

All70 final native PNGs were inspected across12 contact pages mapped by `client/tmp/weapon-catalog-review-1793098300/index.json`. Source directory `client/tmp/weapon-catalog-art-1793050768696` contains33 actual owned-row captures plus equipped/stock/preview screens. Three audit JSONs each record33 equipped instance identities,11 offered items and zero errors. The six source review images above were also inspected. Native silhouettes remain recognizable at compact row size and agree with equipped/shop previews.

## Validation

- `make test`:pass (`client/tmp/weapon-catalog-go-1793096300.log`).
- `make validate-data`:pass (`client/tmp/weapon-catalog-data-1793096300.log`).
- `cd client && npm test`:870 tests/100files pass, including a new whole-catalog contract requiring every weapon's explicit key and real local asset (`client/tmp/dialog-input-unit-1793097900.log`).
- `cd client && npm run build`:pass (`dialog-input-build-1793097900.log`).
- `cd client && npx prettier --check --ignore-path .gitignore .`:pass (`dialog-input-format-1793097900.log`).
- Workflow YAML parse and `git diff --check`:pass. The new native spec/artifacts are registered in the hosted shops suite; no checks were dropped.

Only icon metadata changed in shared data, so no combat/progression simulator is warranted. The current owner process still has its startup catalog; it was not restarted or falsely described as having loaded the new definitions. The separate3612 build proves the new icons in the actual game. A later safe backend restart is needed for the owner's3609 process to load this catalog. Full goal acceptance, including the newest remote CI and integrated combat/environment/pacing work, remains open.
