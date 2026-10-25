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
- Remote walking suite passes all 24 checks. Fresh remote gameplay/interior suites must finish successfully before describing PR #339 as merge-ready.

## Next playable feature, after CI stability

One short meadow-to-Old-Mill loop: visible optional threat → useful resource/reward → crafted sidegrade → changed location. See `GAME_FEEL_NEXT_SLICE.md` for research, acceptance criteria, persistence and balancing requirements. This feature is not yet implemented.

## Subsequent work

- Meaningful enemy roles and server-owned intent previews, tied to the action actually resolved.
- Stronger action-specific body choreography for crits, melee weapons and class abilities.
- Distinct elemental spell motion and status feedback, using the verified release/contact/recovery contract.
- Original higher-quality enemy, effect and environment assets, installed only after an inspected playable slice.
- Expand accepted combat/art patterns to remaining classes after Warrior/Cinder acceptance.
- Consider additional professions only when gathering/crafting creates useful decisions rather than more collection chores.

Keep new content in shared data, mechanics in Go, and the client as presentation/input. Continue to verify real play, keyboard/touch, save/load, defeat/retreat, repeated visits and narrow screens.
