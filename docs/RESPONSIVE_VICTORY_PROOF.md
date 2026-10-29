# Responsive battle receipts

2026-10-26 · `codex/battle-grounding-walk-lag` · draft PR #339.

The canvas receipt scaled a 1600px portrait layout down to the phone, making
16–20px game text roughly 8–10 CSS pixels. Raising a few fonts would retain
fixed columns and overlapping long names/level badges. The result receipt now
uses the existing responsive viewport-dialog boundary. Its body scrolls while
header and Continue remain available. Primary facts use 16px, secondary text
14px, names 18px; text wraps instead of reducing font size. Desktop reward
cards form three columns; phone reward rows stack. Portraits use existing
canonical character art. No new art, content, server rules or dependencies.

The old canvas victory implementation is replaced rather than retained as a
second renderer. Ordinary defeat/recovery flows remain separate and unchanged.
XP values and split rewards still derive from Go's before/after thresholds and
KO flags. The tally animates those supplied segments only; Continue never waits
for the animation timer. Space finishes an incomplete tally, then can continue;
Enter/Escape or clicking Continue finishes and returns immediately. Reduced
motion uses final bars without tweening. A defeated member retains previously
earned XP and receives no new-award animation. Level-up labels remain visible.

Earned equipment still requires its server-owned loot review first. The receipt
is inert and hidden from accessibility while loot is on top. Only the top modal
owns captured keyboard input. Resolving loot focuses Continue; leaving the
receipt restores the next scene's normal input and removes its DOM/locks.
The native loot reference now asserts the receipt owns input after Equip,
then uses native Enter and checks World input/keyboard enabled with no locks.
This replaces the obsolete canvas-era expectation of unlocked Battle input
while a responsive receipt is open; exact-instance, timeout/retry, stale-state,
keep/equip and displaced-item checks remain intact.

## Validation and inspected evidence

- Initial client run: 836 pass, two old canvas-geometry XP tests fail because
  Node has no DOM. Those tests now exercise the actual extracted XP progress
  state at 150/300 and 225/300, requiring retained fractional fill and zero
  award segments for defeated members. Full client gate returns to 838 passing.
- Initial native six-case run: three HUD/presentation cases pass; three loot
  cases fail only at the old input-ownership expectation. The corrected native
  receipt/loot run passes seven cases in 25.3s.
- New receipt references use a real server-resolved showcase reward and actual
  keyboard/touch continuation. A separately labelled presentation-only stress
  fixture derives from that result and supplies long names, KO retention and
  a threshold crossing. It does not claim those conditions came from that
  battle or establish natural level-up pacing. Four screen sizes include
  375×667, plus a separate reduced-motion phone case. Checks include 14px
  minimum text, Tab/focus, containment, no horizontal overflow, paused tally
  clock, retained 0.5 KO fill, completed 5/80 XP fill and native exit.
- The first combined run passes 33/34; its reduced-motion case was actually
  running with the media preference off. The diagnostic assertion reproduces
  that mismatch. Receipt tests now explicitly emulate and assert the effective
  preference; all five motion/reduced cases pass with unchanged timeouts.
- The first normal opening replay exposed a second-battle stale handle. A pointer
  audit records the click at `(0,0)`, with no live Continue button at click time;
  the real receipt appeared later. Battle had retained its old ready flag and
  detached receipt reference. `victory-stale-before-1793074400.log` reproduces
  ready=true and position=(0,0) at the next encounter. Init/shutdown now reset
  result state, and the bridge rejects disconnected/non-rendered controls.
  The native-combat helper retains pointer audit details on failure, rather than
  suppressing the failure or replacing real input with a direct scene exit.
- `victory-responsive-reentry-1793074600.log`: eight cases pass (29.6s), including
  all three loot sizes and all five consecutive-battle cases. Screenshot review
  found the showcase's automatic Character panel covering the next-battle shot;
  the final fixture closes it and requires the actual command prompt.
- `victory-responsive-natural-tally-1793076200.log`: all five final receipt cases
  pass (33.0s). Normal bars reach the exact Go XP ratios naturally; initial,
  intermediate and completed captures are retained. Stress fixtures still cover
  stalled clocks, Space-to-finish, KO retention and long labels. Native
  Enter/Escape/touch exit and the real next-battle prompt are verified.
- `victory-responsive-gathering-1793071200.log`: all seven cases pass (7.5m),
  preserving real gathering, potion/refine/sword, equip/socket, deadlines,
  save/load, potion battle use and Old Mill return checks at four sizes.
  The paused-clock assertion now observes the connected DOM receipt, and its
  XP checks still compare against the actual server response.
- `victory-responsive-opening-final-1793074600.log`: normal phone route passes
  in 89.509s, with encounters enabled, real purchases/spells/crafting/socketing,
  two battles, native pointer Continue and save/reload. No grants or forced
  rounds. It remains level one at 24 XP; this is not human-paced first-visit
  or natural-level-up acceptance.
- Final 34 receipt/animation/reentry images plus all 24 normal-route images were
  inspected via `victory-counted-final-review-1793076800.json`. All 63 gathering
  captures were inspected via `victory-gathering-review-1793072900.json`.
  Earlier 87 workshop/loot/HUD/result captures were inspected via
  `victory-responsive-review-1793071800.json`. The final eight loot captures in
  `post-battle-loot-1792998827400/` were inspected as well (review pages 4–5 in
  `victory-reentry-review-1793075000.json`); filenames saying victory-receipt
  in that legacy loot spec show equipment decisions, not XP animation.
- 838 client tests, production build and full Prettier pass in
  `victory-responsive-reentry-{client,build,format}-1793074700.log`.
  Later edits are test fixture/diagnostic/proof changes. No Go/shared changes;
  backend/simulator gates remain those recorded for earlier gameplay chunks.
- Owner newest save (Oct 26, 2:20:11 AM CDT) resumed on the final client. Before/
  after visible party fields match exactly in `victory-final-player-before-1793076500.txt`
  and `victory-final-player-after-1793077200.txt`; the inspected
  `victory-final-player-world-1793077200.png` shows World ready to play.
  All four level five, 132/153 XP each, 495 gold, 14 potions, zero Ether, HP/MP
  unchanged. API/database stayed running; no battle/craft/equipment mutations
  were tested on the owner's account.

The workflow retains all prior 56 visual specs and adds the three-case battle
HUD reference and five-case responsive receipt file to combat. Existing eight
suite budgets and protected all-suite success are preserved; current head needs
fresh hosted CI. General CI remains on the owner-selected self-hosted labels.

The broader goal remains active: portrait Wizard/secondary equipment metadata,
remaining staff art, environment cohesion, remaining action choreography and
human first-visit fifteen-minute pacing still need their own acceptance.
