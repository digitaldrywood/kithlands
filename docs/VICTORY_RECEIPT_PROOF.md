# Victory receipt navigation and individual XP

2026-10-26 · `codex/battle-grounding-walk-lag` · draft PR #339.

## Reproduced problems

The final 50-case menu run passed 49 cases and failed the default-viewport
crafting/battle route. Its retained snapshot shows `phase: quest_complete`,
`animating: false`, a fully rendered victory receipt and
`victoryContinueShown: false`, with no Continue button after the wait. The game
had resolved the reward but navigation depended on a later Phaser tally timer.
No timeout was increased and no inventory, progression or reward assertion was
removed. An isolated pass did not close the problem; the combined failure is
retained in `client/tmp/menus-final-native-1793056200.log` and
`client/tmp/gathering-1792993448236/800-command-failure.{png,json}`.

A controlled native regression now pauses only the presentation clock after
the actual victory receipt is drawn. The same real gather/craft/equip/save/load/
battle path fails before the repair with the clock paused, victory resolved and
no Continue. See `victory-clock-before-1793059200.log` and
`gathering-1792994468454/800-command-failure.json`. This establishes the timer
coupling; it does not claim to identify every cause of slow frame delivery.

The same receipt showed +24 XP for every character while each stored character
had received six. Go correctly divides the 24-point battle pool among the four
living party members. Ordinary rows incorrectly used the pooled log summary;
only finale rows used the authoritative before/after progression segments.

## Result

Once the result screen is drawn, its navigation is available. XP bars can tally
without gating the exit. Clicking Continue or pressing Enter snaps the remaining
tally before returning, with a one-shot handoff. Space skips an unfinished tally;
a subsequent Space continues. Natural completion also finalizes the tally.
Earned equipment still goes through its existing authoritative loot review
before Continue appears; the exit does not discard or bypass a pending drop.

Each character's XP label now comes from server-supplied before/after XP and
crossed-level thresholds, for ordinary battles and finales. Defeated members
receive the existing explicit no-XP label. Older snapshots lacking metadata
show "XP updated" rather than inventing an individual reward from the pool.
The ordinary headline still shows the shared pool; server rewards, XP formulas,
inventory and save behavior are unchanged.

## Validation

- Four focused XP tests cover a 24-point/four-member split, crossed thresholds,
  defeated-member exclusion, missing legacy metadata and level-cap changes.
- Full client gate: 838 tests pass; production build passes.
- The controlled 800px native reference fails before and passes after, 1.7m.
  It keeps the clock paused while verifying individual XP labels and Continue,
  then returns to the real Old Mill story through native Enter.
- `gathering-1792994638778/800-victory.png` inspected: the headline says +24,
  each row says +6 and XP 6/70, and Continue is present despite the paused clock.
- The new fixture removes its postupdate observer and restores the clock on
  scene shutdown. Its combat, material, equipment, deadline, potion-use and XP
  checks remain intact. It is fault injection, not normal animation evidence.
- Combined native run `menus-receipt-native-1793060400.log`: 52 of 53 pass.
  Its only failure used the old loot timeout fixture, which set its one-second
  request limit after the dialog had already captured the default. The corrected
  fixture sets the same limit before construction; all three loot viewport cases
  pass in `loot-final-1793062200.log` (12.7s), including timeout/retry and stale
  comparison recovery. The combined command itself remains a recorded failure.
- All four gathering viewport routes pass with the presentation clock paused.
  The eight victory/return captures plus four keyboard and eight loot captures
  were inspected via `receipt-menu-review-1793062700.json`. Loot files named
  victory-receipt still show the equipment decision, not a completed XP tally.
- Normal phone opening route passes in 95.466s with encounters enabled and real
  purchases, gathering, crafting, socketing, two battles and save/reload:
  `receipt-first-session-390-1793062200.log`. All 24 PNGs in
  `first-session-390-1792995560497/` inspected via
  `phone-receipt-route-1793063000.json`. No debug grants or forced rounds.
  This is normal gameplay continuity, not a timed human first-visit assessment;
  the party remains level one at 24 XP. The controlled receipt captures do not
  establish natural tally animation quality.

The broader goal remains active. This repairs result handoff and reward text;
it does not establish complete combat choreography or final UI typography.
