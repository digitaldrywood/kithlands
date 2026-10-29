# Workshop keyboard navigation and menu integration audit

2026-10-26 · `codex/battle-grounding-walk-lag` · draft PR #339.

## Changes

Workshop mode buttons now support Left/Right; gem and recipe choices support
all four arrows and Home/End. Choices follow the actual one-column desktop or
two-column phone grid, retaining focus at missing/outer cells. Browsing moves visible focus, including scrolling a
choice into view, without changing the selection, gold or inventory. Enter or
Space selects; a separate confirmation performs the server-owned change.
Native inputs/selects retain their editing keys. Existing Tab/Shift+Tab,
shortcuts, Escape, pending-operation locks and touch controls remain covered.
Arrow handling is opt-in to marked groups; this is not a claim that every
other game menu has passed an arrow-key acceptance gate.

A new desktop/phone reference failed before the fix when ArrowRight could not
focus Transmute. It now navigates both groups, verifies no spending while
browsing, selects with Enter, transmutes through the real Go API and returns
with Escape. Native select arrows, pending focus containment and no duplicate
spending are also covered by the retained workshop suite.

## Stronger fixtures

The custom-world helper previously used SceneManager.start without stopping
the Wizard. Its old keyboard handler remained active and Escape could reopen
the title underneath a workshop fixture. A dedicated assertion reproduced
Wizard still active. Custom creation now replaces active scenes before starting
World, matching the normal wizard handoff. All 23 workshop cases pass after
this correction; replacement/recovery screenshots now show the correct world
underneath. This corrects development-test setup, not production game rules.

The late-response test previously ended while its route.fetch callback was
still running. It now waits for a completed real server response, withholds
that response, changes game, releases it and waits for the interceptor to
finish. The assertions still require no old menu or inventory mutation in the
new game; no error-suppression or ignored route failures were added.

The setup-flow browser test mocked location search but accidentally left world
creation dependent on live Overpass. It now verifies the exact OSM coordinates,
OSM flag and party names submitted once by the client, then creates a
corresponding deterministic locality through the real Go endpoint. Server OSM
import and outage behavior remain separately covered in `server/api/osm_test.go`.
This browser test does not establish external Overpass availability.

## Verified scope

- `gem-workshop.spec.js`: 23 cases pass in 2.0m. Includes five screen sizes,
  native keyboard and phone touch, socketing, replacement, paid recovery,
  blocked recovery, transmutation/discovery, same-stat deltas, stale quotes,
  timeout reconciliation, large catalogs, late-response isolation, exact
  instance identity and save/reload. Advanced inventory scenarios use explicit
  debug fixtures; they do not prove natural first-fifteen-minute availability.
- `wizard-back.spec.js`: eight cases pass, including desktop keyboard and real
  phone-touch Cancel from party creation to search, then Back to Title, with
  zero game creation requests; pending search responses cannot reopen old UI.
- `wizard-start.spec.js`: two cases pass in 7.8s with unchanged timeout.
- Workshop-only client gate: 834 tests in 97 files passed. With the receipt repair,
  the final client gate passes 838 tests; production build and Prettier pass.
- Workflow YAML parses. All 47 prior visual specs are retained, with nine
  additional menu/setup/loot specs split between dedicated menus and crafting
  suites (eight suites total). The 30-minute
  budget and protected all-suite success requirement are unchanged.

The first broader audit passed 23 of 25 cases. It exposed the external-OSM
setup dependency above and a desktop gathering-route victory wait. The latter
was subsequently reproduced and repaired: an isolated untraced desktop reference passed;
traced attempts failed during trace export and retained incomplete ZIPs.
The gathering driver now waits for actual commands/results across scene
restarts and handles earned loot before Continue, retaining existing reward,
XP, equipment and persistence assertions. The sequential 50-case run still
failed its 800px result wait; a retained screenshot exposed the missing Continue
button on a fully drawn receipt. `VICTORY_RECEIPT_PROOF.md` records the controlled
paused-clock reproduction and runtime repair, plus the ordinary per-member XP
label correction. This was not resolved by hiding the test failure.

## Inspected evidence

Ignored evidence paths are under `client/tmp/`:

- `gem-final-scenes-1793052400.log`: final 23 cases.
- `gem-discovery-1792992319394/`: all 49 images inspected, with manifest
  `gem-review-final-1793053600.json` and nine review pages.
- `gem-keyboard-before-1793048700.log`: both arrow-navigation failures.
- `gem-fixture-before-1793051600.log`: active-Wizard regression before fix.
- `gem-acceptance-1793047900.log`: original unawaited-interceptor failure.
- `wizard-cancel-final-1793054000.log`: eight passing Back/Cancel cases.
- `wizard-back-1792992766083/` and `wizard-start-final-1793052200/`: all 17
  captures inspected via `wizard-menu-review-1793054800.json`.
- The earlier crafting/equipment audit's 52 captures were inspected using
  `menu-review-1793049600.json`. They establish mechanical continuity, not
  blanket visual approval: phone character stats and wizard text remain too
  small, and the Arcane Staff loadout can fall back to a letter icon.
- `gem-client-final-1793052900.log`, `gem-build-final-1793052900.log` and
  `gem-format-final-1793052900.log`: final client gates.

The prior public-trail head `34ab998` passes all six hosted visual suites and
protected summary in run `40272728412`. This menu chunk needs a fresh hosted
gate. General CI remains self-hosted. No Go, shared content, balance, save or
persistent player-state change is included, so new simulator/backend gates are
not warranted for this slice. Local API, database and owner play session stay
available; the owner account was not used for testing these mutations.

## Still open

Phone character-summary readability, tiny portrait wizard controls, remaining
fallback item art, broader menu/arrow acceptance, natural human first-visit
pacing, the pale grove terrain patch and remaining Warrior/Cinder choreography
stay on the full goal. Working menu mechanics do not close those requirements.

## Final local follow-through

The combined 53-case command passes 52; the one failure used the old loot
fixture's late timeout setup. Setting the unchanged one-second limit before
opening the dialog gives three passing loot cases, with all retry and inventory
assertions retained. See `VICTORY_RECEIPT_PROOF.md` for exact logs and limits.
All four gathering viewports and 23 final grid-navigation workshop cases pass.
The 20 changed-state captures in `receipt-menu-review-1793062700.json` were
inspected. The normal phone opening replay passes in 95.466s; all 24 captures
in `phone-receipt-route-1793063000.json` were inspected. Phone Character and
victory typography remain visibly undersized and explicitly open.

Final runtime gates: `menus-receipt-client-1793060400.log` (838 tests),
`menus-receipt-build-1793060400.log` and
`menus-receipt-format-check-1793060400.log`. No runtime edits followed these gates.

The owner session was saved, refreshed and resumed from the newest manual save
(Oct 26, 1:26:51 AM CDT). Before/after AX text fields match: all four level five,
132/153 XP each, 495 gold, 14 potions, zero Ether, unchanged HP/MP.
`receipt-player-before-1793063300.txt`, `receipt-player-after-1793063600.txt` and
inspected `receipt-player-world-1793063600.png` retain proof. World is ready to play
at localhost:3609; API/database were not restarted or reset.
