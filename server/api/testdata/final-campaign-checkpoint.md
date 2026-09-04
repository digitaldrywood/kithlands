# Final campaign checkpoint provenance

`final-campaign-checkpoint.json` is an unchanged gameplay snapshot from the
ordinary-action readiness campaign documented in
`docs/proofs/readiness/20260904-1788535559978-summary.json`.

Source: isolated local database `kithlands_575`, save
`ccecde9a-45fc-4cc2-9304-f2ff47864580`, named
`Readiness checkpoint 1788536995787`, at current quest 23 of 24. Q12 is active
and unfinished. All four members are level 20, promoted, and rested. This is
before the final quest's XP/gold reward. The original first-tier spells,
equipment instances, inventory, quest history, and RNG seed are preserved.

Only gameplay payloads and locality graph were exported. User/session records,
auth tokens, account email, timestamps, and unrelated save metadata are absent.
Browser tests import these payloads into new test-owned user/save/locality rows
in the current worktree database. This is a resumed natural checkpoint, not a
new uninterrupted campaign proof. Loss is produced by ordinary Defend rounds;
retry and victory use normal arrival and combat actions. No debug endpoint,
quest warp, forced win, or party-stat modification is used for browser proof.

The Go balance sample varies combat RNG seeds 1..50 against this same party.
The broader campaign simulator measures first-attempt outcomes; it does not
simulate the player's equipment/shopping preparation after a finale defeat.
