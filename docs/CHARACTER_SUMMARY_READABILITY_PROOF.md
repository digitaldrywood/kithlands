# Character summary readability

2026-10-26 · `codex/battle-grounding-walk-lag` · draft PR #339.

The previous phone summary used 9px combat labels and a 250px cap with a
nested scroll area. Grid stretching put excessive blank space between Vitals
and its resource bars. A native 390px reference fails before the change with
measured 9px text (`character-readability-before-1793064200.log`).

Primary summary stats, resource values and tabs now use at least 14 CSS pixels
at desktop/default/phone sizes. Vitals align at the top with bounded spacing.
Phone sections stack above the loadout in the main scroll area. Resource notes
and section headings use 12px, the magic explanation 13px. This is a scoped
summary improvement; equipment drawer metadata, secondary base/gear breakdowns,
spell-card text and shortcut badges retain their existing separate sizes.

The first after-run passed nine mechanical cases, but screenshot review found
the phone flex child still overflowed its panel into the loadout. That run is
retained (`character-readable-final-1793065100.log`); it is rejected as visual
acceptance. A first flex-only correction still failed the stronger containment check in
`character-readable-contained-1793065900.log` (eight pass, one fails).
Compact main/summary layout now uses ordinary document flow instead of a
constrained grid/flex row; the detail groups retain their own grid. The stronger
reference explicitly checks Condition containment and loadout ordering.

No Go rules, equipment values, shared content, saves or assets changed.

## Final acceptance and retained evidence

- `character-readable-flow-1793066600.log`: all four loadout cases pass (18.8s),
  including the stronger containment assertions, desktop/default/phone summary
  checks, real phone touch opening Weapon, recommendation/slot/socket paths and
  returning to the world menu.
- `character-flow-regressions-1793067000.log`: five further cases pass (54.3s).
  Saved builds retain preview/apply/overwrite/rename/missing-item/stale-state/
  party-transfer/pending/save/reload behavior at all three sizes. Real magic
  equipment still changes authoritative spell combat and survives save/load;
  simulated network failure still preserves focus and retry.
- Final 17 loadout PNGs inspected via `character-flow-review-1793067000.json`;
  all 27 build and nine effective-equipment PNGs inspected via
  `character-flow-regression-review-1793067500.json`. Phone summary/Condition
  also inspected at full size, not just in a montage. No clipping/overlap at
  the summary-to-loadout boundary. Existing lower equipment drawer can overlay
  the page while choosing gear; its own small metadata remains outside this slice.
- 838 client tests pass (`character-readable-client-1793064900.log`). Final
  production build and full formatting check pass in
  `character-readable-flow-{build,format}-1793066800.log`. Later edits are proof
  text only. Backend, simulator and data gates are unchanged for CSS/test work.
- The real owner adventure was saved and resumed from its newest manual save
  (Oct 26, 1:36:24 AM CDT), inspected on the actual local Character screen, then
  returned to World. `character-live-summary-1793067300.png` is inspected;
  `character-player-party-1793067300.txt` retains the unchanged party fields.
  All four remain level five at 132/153 XP; 495 gold, 14 potions, zero Ether and
  HP/MP match the earlier refresh. No equipment/purchase/craft mutations were
  tested on this account. API, database and localhost:3609 remain running.

This accepts the primary Character summary only. Portrait Wizard and victory
receipt typography, secondary equipment metadata/spell-card fonts, remaining
fallback staff art and broader menu/action choreography remain open.
