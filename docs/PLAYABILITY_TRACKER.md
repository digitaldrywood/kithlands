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
- Warrior critical strikes now add a heavier anticipation, lean and longer recovery using the approved body atlas, selected from Go's critical result. Desktop, portrait and reduced-motion real battle proof verifies contact, shadow following, recovery and separated critical/defeat labels. Other classes retain their existing physical attack. See `WARRIOR_CRITICAL_STRIKE_PROOF.md`.
- Defend now provides real round-long physical protection, including against faster attackers, with visible D/Tab/Enter/touch input, preserved Repeat plans and server-confirmed GUARD feedback. Duplicate member actions are rejected before spending resources. Phone commands use a full-width three-column layout; the nine-command fixture has 46.8px touch targets, clear meters and contextual menus above party status. See `DEFEND_COMBAT_PROOF.md` for inspected real-game evidence and limits.

## Current slice: the real opening route

- The fixed canvas shop has been replaced with one responsive viewport dialog. Desktop has stock/preview columns; phones have full-width selection/details and fixed actions. Equipment comparisons, server-owned spell eligibility, authored spell descriptions, supply confirmation, pending-request protection, stale-stock recovery and readable receipts are verified with real purchases. Reusable purchases keep their selection with refreshed offer IDs. Lower evade penalties now show as improvements, and redundant zero-value cards no longer hide phone deltas. All 18 final shop/opening native cases, 789 client tests, build and formatting pass. Two authored Old Mill combat/crafting/save routes also pass; their advanced crafting still uses a level fixture. Inspected final phone/desktop captures and retained evidence are in `RESPONSIVE_SHOP_PROOF.md`. The shop slice needs its own remote run; natural first-fifteen-minute acceptance remains next.

- Historical run `40213425092` verified Defend, walking and interiors but exposed a test mistake: the last phone-only submenu boundary assumed desktop status was also below commands. Corrected the assertion to require command-region containment and rectangle non-overlap in both arrangements. All five native-game viewport/touch cases pass with inspected proof in `client/tmp/battle-context-1792948200314/`; the corrected `1811ed7` visual gate is green below.

- Hosted visual run `40216083856` passes gameplay, walking, interiors and the protected summary on `1811ed7`. Tactical head `fadb0be` also passes all visual suites and the protected summary in run `40217905803`. Opening-flow head `ae261a1` passes all visual suites and the protected summary in run `40224987112`. General self-hosted CI remains queued.

- A normal native-input opening audit exposed three concrete problems: the first shop only sold spells already granted at creation; the settlement trail control was not refreshed after a completed step; and the same native Attack event could affect a later party member. New Cinder/Mender spell lists leave real purchases available, existing spellbooks survive loading, the client regressions have before/after cases, and merchant requests are serialized to prevent a dialogue being left under a shop. See `OPENING_ROUTE_RECOVERY_PROOF.md`. All seven combined native checks, 788 client tests, full Go race/lint/data/balance gates and 60 campaign simulations pass. That audit also identified tiny phone shop text/hit targets; the responsive shop slice above resolves that regression. Full timed exploration/crafting/gems/leveling acceptance remains open.

- First authored enemy role: Bramblehogs prepare before two Focus-enhanced attacks. The same Go planner drives ordinary and legacy turns plus balance simulation; conditional intent is projected from its exact pattern. The lower command area shows readable plans. Three native tactical cases and eleven combined menu/Heron/prompt cases pass with inspected captures. Full Go race tests pass (API 491.220 seconds), full lint is clean, and all 60 campaign simulation runs pass their assertions; see `ENEMY_TACTICS_PROOF.md`. Other enemy roles remain open.

- The pre-tactics baseline at `1811ed7` has 785 client tests, build and formatting. Profiling reduced initial resource placement from 7.993ms to 1.587ms and allocated bytes by 78.75%, with identical seeded resource/terrain fingerprints. Full ordinary Go tests, data validation, balance smoke and **full race testing** pass; the API race package completes in 519.330 seconds without changing its 600-second timeout or seed coverage. See `GATHERING_SEARCH_PERFORMANCE_PROOF.md`. The separate bounded asset-serving repair clears both G703 findings; full lint reports zero issues. See `ASSET_SERVING_PROOF.md` for registered-image and dashboard allowlist coverage.

- Development dependency patches update Vite 6.4.3 → 6.4.5 and Vitest 4.1.11 → 4.1.12 within the existing ranges. `npm audit --audit-level=moderate` reports zero vulnerabilities; all 778 client tests, build, formatting and six repeated-Cure/Heron real-game viewport flows pass. The running Vite server was restarted on port 3609; API and saves were retained.

- Larger, outlined combat numbers; brighter elemental text; slower, smaller rise.
- Full-opacity hold before fading: regular numbers 1.2 seconds, crits 1.5 seconds.
- Explicit CRITICAL label; no flashing; reduced-motion text stays still.
- Action-message minimum reading time independent of battle animation speed.
- CI checksum corrected for the already approved Warrior image.
- Visual workflow pinned to supported Ubuntu 24.04.
- Interior proof corrected to await actual completed Town steps, retaining exact destination checks.
- The retained failing CI trace diagnosed repeated delivery of the same native ArrowUp event by Phaser. Field magic now handles each native event once while preserving distinct presses. The new event-replay regression fails before the fix and passes afterward; all four viewport flows and five throttled repeats pass locally. Remote run `40209842181` on `e217cba` passes gameplay, walking, interiors and the protected summary, including the Cure regression and Warrior critical proof. See `FIELD_MAGIC_INPUT_DIAGNOSTICS.md` for diagnosis and local evidence.
- Historical visual failures led to the retained Cure trace in run `40207076015`. The corrected head `e217cba` is green in run `40209842181`. Further gameplay changes still need their own gate; general self-hosted CI remains pending.
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
- [x] Profile initial gathering-route generation and complete full Go race/lint gates without reducing seed coverage or suppressing unreviewed findings.
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
- Further action-specific body choreography for melee weapons and class abilities; Warrior's critical variation is verified, other identities still require their own acceptance.
- Distinct elemental spell motion and status feedback, using the verified release/contact/recovery contract.
- Original higher-quality enemy, effect and environment assets, installed only after an inspected playable slice.
- Expand accepted combat/art patterns to remaining classes after Warrior/Cinder acceptance.
- Consider additional professions only when gathering/crafting creates useful decisions rather than more collection chores.

Keep new content in shared data, mechanics in Go, and the client as presentation/input. Continue to verify real play, keyboard/touch, save/load, defeat/retreat, repeated visits and narrow screens.
