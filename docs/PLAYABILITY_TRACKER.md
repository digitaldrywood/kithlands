# Playability work tracker

Active branch: `codex/battle-grounding-walk-lag` · draft PR #339.
Updated 2026-10-25. This file records work; it does not schedule unattended runs.

## Verified locally

- Unified campaign/local-story journal and Old Mill return flow.
- Gatherable herbs, wood and minerals; habitat placement; saved respawn deadlines.
- Iron/Steel/Mythril crafting progression with purchased supplies and Old Mill's rare core.
- Crafting and Gem Workshop workbenches; canonical sword/gem icons across relevant screens.
- Keyboard navigation and shortcut hints; collapsed save history with latest adventure saves.
- Shared World/Town movement continuity, native walk atlases for all twelve classes.
- Warrior/Cinder grounding, animation contact cues, following shadows and spell release.
- Shaped fire projectiles, ember trails, dispersing contact cinders, tapered melee contact and miss distinction.
- Critical presentation currently differs through gold numbers, larger bounce, extra sparks, critical sound and optional shake; it uses the normal authored character attack poses. Separate critical body choreography remains future art work.

## Current slice: readability and CI

- Larger, outlined combat numbers; brighter elemental text; slower, smaller rise.
- Full-opacity hold before fading: regular numbers 1.2 seconds, crits 1.5 seconds.
- Explicit CRITICAL label; no flashing; reduced-motion text stays still.
- Action-message minimum reading time independent of battle animation speed.
- CI checksum corrected for the already approved Warrior image.
- Visual workflow pinned to supported Ubuntu 24.04.
- Interior proof corrected to await actual completed Town steps, retaining exact destination checks.
- Repeated field-magic keyboard proof corrected to await menu readiness and visible cursor selection; all four viewport flows pass locally.
- Remote run `40202414864` on `e2fd42c` passes all three visual suites. The subsequent documentation-head run `40203229574` passes walking/interiors but exposes an intermittent second-Cure keyboard failure at 800px (`field-magic-repeat.spec.js:142`). Investigate that input path; do not claim stable remote CI from one green run.
- Integration migration discovery now works with `GOFLAGS=-trimpath`: the helper locates the server module from the working directory. The regression fails before the fix and passes afterward with/without trimpath. Full `make test-e2e` passes against a separate disposable database, which teardown removed; the live save database remains available. See `INTEGRATION_MIGRATION_PROOF.md`.
- General CI run `40202414785` is queued for `[self-hosted, linux, personal]`; GitHub's repository runner API reports zero registered runners. Local checks cannot substitute for a completed remote gate. Preserve the existing runner configuration pending an infrastructure decision.
- Corrected the fifteen-minute walkthrough to include hardwood, current recipes and saved respawn timers. It still explicitly requires a timed normal fresh-player verification; the document is not proof of the complete loop.

## Current playable slice and remaining stability work

The Heron Pool detour now connects an optional visible threat → guarded smithing supplies → power/accuracy sword choice → a saved safe rest stop and changed room description. Its desktop/phone proof and exact limits are recorded in `HERON_PLAYABILITY_PROOF.md`. It reuses the normal party, inventory, journal, crafting and combat. See `GAME_FEEL_NEXT_SLICE.md` for the broader exploration/pacing follow-up; the complete fifteen-minute acceptance remains open.

### Audit of reusable mechanics

- `shared/dungeons/adventures.json` defines authored encounters, the mill's restoration, shortcut and payoff. The entrance bats still gate the mill doorway; the optional Heron Pool encounter can be declined and is not required for the main mill route.
- `server/api/game_dungeon_test.go` already exercises full-route persistence, shortcut return, reward replay rejection and defeat/flee recovery. Extend these mechanics rather than introduce another expedition inventory or journal.
- `server/api/game_encounter_pacing.go` owns saved travel-based encounter intervals; `shared/encounter_pacing.json` currently sets 60–100 weighted grass steps with 12 safe steps. Route pacing changes belong here and in shared data, not client random rolls.
- `client/e2e/gathering-crafting.spec.js` starts with `?noEncounters=1`. It verifies collection/crafting/equipment interactions, but does not establish ordinary travel pacing or an uninterrupted first-fifteen-minute experience.

### Remaining acceptance checklist

- [x] A normal fresh game presents a recognizable optional encounter and honest enemy/level information before engagement.
- [x] Winning connects to useful smithing supplies and a power/accuracy crafting choice; the cleared bank persists as a rest stop.
- [ ] Retreat, defeat, repeated visits, saving/loading and reward replay are verified for the new route.
- [ ] Enemy tactical roles and any intent preview match the actual server-resolved action, including interrupted or invalidated actions.
- [ ] Warrior/Cinder action-specific choreography covers critical attacks, defense, abilities, healing/status, victory and KO; other-class expansion follows reference acceptance.
- [ ] Inspect current melee and elemental spell anticipation/release/contact/recovery at normal and reduced motion, with readable action text and unobscured targets.
- [ ] Inspect resource habitat terrain and meadow landmarks on the actual quest route; check saved respawn deadlines after closing/reopening.
- [ ] Recheck locality Back/Cancel, one journal/menu, temporary notifications and scene transitions for stale overlays.
- [ ] Verify crafting, shops, inventory, equipment comparison and all gem operations with consistent icons and keyboard/touch input at desktop and phone sizes.
- [ ] Verify newest save selection and optional history with multiple snapshots of one adventure.
- [ ] Play and time a normal fresh route with encounters enabled, no debug grants, real starting money and levels; document what shopping/spell purchasing/leveling is actually reachable.
- [ ] Inspect unique screenshots and motion evidence; run required local gates and obtain passing relevant remote CI.

The active goal is the complete user-pasted request, not only this checklist. Existing local proof should be reused where valid; a check stays open when its remaining acceptance depends on the new connected route or final integrated verification.

## Subsequent work

- Meaningful enemy roles and server-owned intent previews, tied to the action actually resolved.
- Stronger action-specific body choreography for crits, melee weapons and class abilities.
- Distinct elemental spell motion and status feedback, using the verified release/contact/recovery contract.
- Original higher-quality enemy, effect and environment assets, installed only after an inspected playable slice.
- Expand accepted combat/art patterns to remaining classes after Warrior/Cinder acceptance.
- Consider additional professions only when gathering/crafting creates useful decisions rather than more collection chores.

Keep new content in shared data, mechanics in Go, and the client as presentation/input. Continue to verify real play, keyboard/touch, save/load, defeat/retreat, repeated visits and narrow screens.
