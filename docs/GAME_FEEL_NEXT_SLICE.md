# Make the next fifteen minutes worth playing

Research and implementation follow-up, 2026-10-25. Branch `codex/battle-grounding-walk-lag`, PR #339. No separate assigned issue.

## Findings and decisions

The problem is a weak relationship between activities, not a shortage of menus or random rolls. A player needs to see something worth pursuing, decide whether to pursue it, overcome a specific obstacle, and use its reward soon afterward. Adding gathering professions before that loop works risks adding more chores.

- ArenaNet's [Dynamic Events](https://www.guildwars2.com/en/the-game/dynamic-events/) describes stories that respond to player actions. Apply that at small scale: a visible local problem, an optional intervention, and an outcome that changes the next visit. We do not need a multiplayer event service.
- Riot's [Visual Effects](https://www.riotgames.com/en/artedu/visual-effects) balances satisfaction, cohesion, and clarity. [Clarity in League](https://www.leagueoflegends.com/en-au/news/dev/clarity-in-league/) emphasizes importance hierarchy and a projectile silhouette that communicates travel direction. Apply this as distinct anticipation/release/travel/contact/recovery, quieter minor actions, and restrained stronger effects for major actions.
- Mike Stout's [Enemy Attacks and Telegraphing](https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing) explains readable attack preparation. In this turn-based game, use authored tells and eventually server-declared intent; don't add a fake warning that implies the player can dodge during playback.

These are design recommendations derived from the sources, not claims that copying an MMO or adding more particles automatically makes Kithlands fun.

## First implemented slice

Fireball's existing Cinder cast now has a shaped, directional three-tone flame, a pulsing core, a short fading ember trail, and bounded dispersing contact cinders. The actor's accepted body atlas, attachment emission point, release cue, damage-on-arrival contract, and recovery remain intact. Melee contact uses a tapered slash with short sparks; misses produce no contact slash. Reduced-motion playback retains the effect identity without travelling trails or radial melee particles. These effects are deterministic Phaser graphics, work in Canvas/WebGL, and require no image service at runtime.

This is a feedback pass, not a combat rules or exploration pacing overhaul. It does not change enemy behavior, gathering yields, crafting requirements, encounter rate, damage or progression.

## Next playable slice: meadow to Old Mill

Build and validate one complete short route before adding classes or professions:

1. A visible threat near a useful route offers an optional battle. Show its identity and relative danger before engagement; retain quieter travel on previously cleared paths. Replace some blind interruptions rather than increasing encounter frequency.
2. Clearing it gives access to a recognizable rich resource patch or a useful crafting component. The patch has a saved cooldown, finite reward, and honest source label.
3. A town recipe turns that reward into a meaningful sidegrade: e.g. precision versus power, with an immediate comparison and a suitable next fight. Avoid requiring many arbitrary materials or a second currency.
4. Returning to the area shows the result: a usable crossing, a travelling vendor, or a changed inhabitant. The quest journal records it through the existing system.
5. The next enemy asks a different tactical question: an enemy charging a heavy attack, a healer supporting allies, or an elemental weakness. Any intent preview must come from Go and match the action actually resolved.

Acceptance: a new player can recognize the opportunity, choose it, win or retreat, use the reward, and understand the result in roughly 10–15 minutes without debug grants. Persist the event outcome, reward claim and resource deadline in saves. Balance/simulate the actual server rules and test retreat, defeat, repeat visits, save/load and mobile input.

## Art production after the combat slice

Use reference-conditioned image generation for original effect textures, enemy identities, props and controlled concept variants. Use a pose guide/rig and frame-by-frame cleanup for new motion. Do not regenerate all character sheets from one prompt. Keep candidates outside runtime and compare in the actual scene before installation. Preserve the accepted character anchors and attach replaceable weapons/effects as separate layers. The already installed Warrior/Cinder bodies are the initial reference slice; a general art upgrade or other-class expansion needs its own acceptance.

## Evaluation

Track whether playtesters deliberately choose an optional encounter, craft and equip something useful, and can explain why they took a route. Count unavoidable interruptions and repeated menu visits. Review a full recording, not only still images. A longer session alone does not prove the loop became enjoyable.

## Technical follow-up and proof

The local game was restored using its existing saved PostgreSQL cluster at `client/tmp/battle-proof/pgdata` on port 54706, API 8689 and Vite 3609. No game database was reset. The client and API were confirmed reachable, including `/health` returning `{"status":"ok"}`.

Two independent CI blockers were fixed and pushed separately:

- `a4a658d`: `docs/walk-assets.sha256` now records the previously accepted Warrior PNG installed by `6862222`. No walk pixels changed. `shasum -a 256 -c docs/walk-assets.sha256` and the six-column/eight-row audit pass for all twelve classes.
- `e89848d`: pin visual workflow jobs to Ubuntu 24.04. The new ubuntu-latest image resolved to Ubuntu 26.04, rejected by the installed Playwright Chromium installer. This failure happened before any game tests. New remote jobs pass installation and proceed to test execution; final CI conclusions are separate from local proof.

Validation commands:

- `cd client && npm test -- --run`
- `cd client && npm run build`
- `cd client && npx prettier --check --ignore-path .gitignore .`
- `cd client && npx vitest run src/scenes/battle_effects.test.js src/scenes/battle_contact_fx.test.js src/scenes/battle_action_playback.test.js`
- With the normal worktree environment and `.envrc.local` sourced, run Chromium with worktree-local HOME, XDG_CONFIG_HOME, XDG_CACHE_HOME and PLAYWRIGHT_BROWSERS_PATH exactly as in `scripts/run_playwright_local.sh`: `cd client && npx playwright test --config=e2e/playwright.config.js e2e/battle-vfx-gold-slices.spec.js e2e/battle-grounding.spec.js`
- Focused contact flow: same environment, `npx playwright test --config=e2e/playwright.config.js e2e/combat-contact-polish.spec.js`.

The already running API/Vite were reused rather than having the wrapper kill the user's local play session. In-app browser connection was attempted and unavailable, so proof used isolated Chromium against the actual game/server.

All five grounding tests pass: desktop, portrait, reduced motion, slow and fast. Fireball and Blaze pass the actual authoritative spell flow. The broader suite exposed an existing healing assertion race: it waited for HP to change relative to an impact screenshot, which can already show the result. The helper now compares with the pre-action HP. A leftover variable reference introduced while correcting that assertion was fixed before the final rerun. This changes the test's observation point, not the game's healing logic.

The contact proof uses an authoritative attack round, captures actual post-render melee frames, checks recovered transient cleanup, then invokes a visual-only miss without mutating HP and verifies there is no slash. All three viewport/motion cases pass. Inspected unique proof: `client/tmp/combat-contact-1792937698862/{1440,390,800}-melee-{0,1,2}.png` and recovered screenshots. Full spell release/travel/impact/result captures and JSON traces are stored in each test's unique Playwright output directory.

No server gameplay rules or shared balance values changed in this feedback pass, so there is no claim of rebalanced combat or increased exploration variety. Build retains the pre-existing large-chunk warning. The new research and next-loop proposal do not constitute implementation of that future loop.

Final local results: 775 client tests across 90 files, production build and full client formatting check pass. Six spell gold-slice cases pass on the final helper: Fireball, all-enemy Blaze, Cure, all-party Heala, Mute fallback, and reduced-motion Fireball. Inspected final spell release/travel/impact/result screenshots and traces with run suffix `1792937745527` under `client/test-results/`. Normal fire remains directional and localized; reduced motion keeps contact legible with no travel. The separate contact flow passes all three cases, and all five grounding cases passed without runtime changes afterward. No all-green remote CI claim: the newly unblocked interior suite reports a failure while the overall visual run is still active, so its final log must be reviewed separately.
