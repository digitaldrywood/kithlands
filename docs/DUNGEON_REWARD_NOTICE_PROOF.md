# Adventure reward notices — 2026-10-27

PR #339, branch `codex/battle-grounding-walk-lag`. The Heron Pool cache reward remained on the map indefinitely: the seeded phone reproduction in `client/tmp/dungeon-reward-before-20261027.log` still found it visible after more than 18 seconds. This obscured the adventure after the player had read the reward.

Treasure and successful direct adventure-save notices now hold for 4.5–12 seconds according to word count, then fade over 400 ms. Reduced-motion users get the same reading hold followed by immediate dismissal. Story hints and errors remain until another action replaces them. Replacing a notice or rebuilding/shutting down the scene cancels its timer and fade, so an old callback cannot dismiss a later message. The server remains authoritative; this changes presentation only.

## Verification

The seeded, database-backed native route enters the Old Mill, travels to Heron Pool, wins the optional encounter and opens the actual supply cache. Seven cases passed in `client/tmp/dungeon-reward-final-20261027.log`: reward receipt and dismissal at 1440×900, 390×844 touch and 800×600 reduced motion; route discovery at all three sizes; and the guided touch opening through the mill, crafting, campaign quest, level-up and save/Continue. This is a guided seeded route, not proof of unassisted fifteen-minute pacing.

The initial and cleared screenshots for all three sizes in `client/tmp/dungeon-reward-notice-1793080829097/` were inspected together in `client/tmp/dungeon-reward-review-20261027.png`. The notice appears above the action buttons and the map is clear after dismissal. A second run also opens the fishing satchel and then the carved-heron clue while the reward timer is active; the clue stays fully visible beyond the maximum reward hold. Its desktop screenshot `client/tmp/dungeon-reward-notice-1793107397317/1440-clue.png` was inspected. The first phone baseline is `client/tmp/dungeon-reward-notice-1793080669937/390-notice.png`. The notice is still bottom-centered over part of the map during its reading hold; this change does not claim a complete redesign of all feedback.

The final lifecycle rerun passed all three viewport cases (`client/tmp/dungeon-reward-lifecycle-20261027.log`); its six receipt/cleared screenshots were inspected in `client/tmp/dungeon-reward-lifecycle-review-20261027.png`.

Client unit tests: 875 passed in 100 files (`client/tmp/dungeon-reward-unit-20261027.log`). Production build and formatting passed (`client/tmp/dungeon-reward-build-20261027.log`, `client/tmp/dungeon-reward-format-final-20261027.log`). The workflow YAML parses and `git diff --check` passes. No backend or shared data changed; no balance simulation is claimed. Hosted visual CI for the preceding commit `304ca3e` completed successfully; this change requires its own CI result. The existing gameplay CI suite includes the new regression and uploads its screenshots.

The tests used an isolated server and database. The owner's local server, open tab and saves were not reset or restarted. Broader environment, battle, all-class movement and unassisted opening acceptance remain open in the playability tracker.
