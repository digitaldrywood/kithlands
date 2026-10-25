# Battle Character Animation Production Contract

Status: Warrior sword gold slice approved in the actual battle scene. Use this
contract for the remaining classes and equipment animation sets.

Battle characters use a separate contract from the approved 64x64 eight-way
walk sheets. The battle contract prioritizes a readable full body, expressive
attacks, and equipment that can change without regenerating the character.

## Gold-Slice Contract

- Character: Warrior
- Facing: three-quarter left, toward the enemy party
- Action: one-handed sword attack
- Frame cell: 192x192 RGBA PNG
- Body atlas: 1152x192, six 192x192 cells
- Origin: bottom center
- Container registration: bottom center at `(96, 184)` in every frame; posed
  feet may lift above that baseline during a strike
- Runtime height: approximately 112 CSS/game pixels
- Background: transparent
- Shadow: rendered separately by Phaser
- Weapon: a separate attachment, never painted into the body atlas

The six body poses are:

1. `guard` -- readable idle combat stance
2. `anticipate` -- weight shifts away from the target
3. `raise` -- weapon hand rises into the strike
4. `impact` -- body commits toward the target
5. `follow_through` -- momentum continues past contact
6. `recover` -- returns toward the same guard silhouette

## Equipment Slots

The Phaser battle character owns synchronized visual slots:

1. `weapon_back`
2. `body`
3. `weapon_front`
4. `off_hand`
5. `effects`

A weapon is one reusable image with a grip pivot. Per-frame metadata supplies
the hand socket, angle, scale, and whether the weapon is behind or in front of
the body. Item data selects the weapon visual; character animation selects the
motion. Equipment appearance must never be inferred from tier glow alone.

## Source And Candidate Layout

```text
art-source/characters/warrior/
  guides/sword-attack-frame-00.svg ... frame-05.svg
  battle/sword-attack/metadata.json

client/tmp/warrior-battle-gold/
  generated/       # raw model output
  extracted/       # chroma-removed frame candidates
  proof/           # contact sheets, traces, and in-game captures

client/public/sprites/battle/warrior/
  sword-attack-body.png

client/public/sprites/battle/weapons/
  <weapon-visual-id>.png

client/src/sprites/battleCharacterSprite.js
  # current runtime hand sockets, frame timing, and layer depth
```

Candidates stay under `client/tmp/` until identity, geometry, and motion gates
pass. Runtime assets are installed only from an accepted candidate.

## Acceptance Gate

- The helmet, blue plume, silver plate, gold trim, blue cape, proportions, and
  silhouette remain the same character in every frame.
- The entire head, cape, hands, and both feet remain visible.
- The body contains no sword, axe, staff, bow, shield, ground shadow, effect,
  text, or detached debris.
- Every frame uses the common container anchor and body scale does not pulse;
  an individual foot may lift naturally during a committed strike.
- The weapon grip stays attached to the authored hand socket.
- The weapon can pass behind and in front of the body without clipping.
- Attack motion reads at runtime speed and returns to the exact guard frame.
- Changing `weapon_visual_id` changes the held weapon without changing body
  identity or animation timing.

Required proof is a source contact sheet, an animation trace or GIF, and the
complete attack-and-return sequence in the real Systems Showcase battle. The
Warrior sword set passed this gate on 2026-08-08.

## Mender Staff-Cast Approved Gold Slice

The second gold slice is intentionally limited to Mender's staff-cast action.
It was visually approved in the real Systems Showcase battle on 2026-08-08
and is recorded as `approved_runtime`. Its body-only frames and item-driven
staff attachment are the production template for subsequent classes; class
identity and action-specific pose work still require their own acceptance.

- Facing: three-quarter left
- Action: restorative staff cast
- Body poses: `idle_guard`, `invoke`, `gather`, `release`, `sustain`, `recover`
- Body atlas: `client/public/sprites/battle/mender/staff-cast-body.png`
- Equipment: `war_staff` selected through shared item `visual_id` and
  `animation_set` metadata
- Staff layer: `client/public/sprites/battle/weapons/war-staff.png`
- Grip: one consistent authored hand; the staff stays behind the body so the
  visible glove reads as the grip
- Runtime entry points: Mender's real spell anticipation and the debug-only
  `cast_class_ability` audit state

This candidate passed an inspected six-frame trace, an attack-and-return GIF,
the real Systems Showcase cast, a real simultaneous all-party healing effect,
and explicit visual approval before its metadata became `approved_runtime`.

## Shared Battle-Character Manifest

`shared/battle_characters.json` is the production registry for all twelve
runtime identities. It records the required state vocabulary, body atlases,
frame timing, and per-equipment attachment sockets. Go loads and validates the
manifest with the rest of game data; Phaser imports that same content and uses
one generic compositor instead of class-specific rendering branches.

The manifest also defines shared presentation-only `state_recipes` for
unarmed, weapon, and caster choreography. Each profile names its recipe with
`state_recipe`. Loading expands only missing states from that identity's own
default-state atlas frames and attachment sockets; an explicitly authored
identity state always wins. Recipes therefore standardize timing, body motion,
attachment visibility, reset behavior, and the persistent KO pose without
sharing or recoloring a class body.

The same composition contract now carries optional authoritative shield visual
metadata from `EquipmentSlots.ShieldID`. `off_hand_assets` registers reusable
shield images separately from weapon images, and a profile may synchronize a
`shield` socket alongside its weapon socket. A class without authored shield
sockets keeps its approved body/weapon presentation and omits only the pending
shield layer; shield absorb and equip rules remain unchanged in Go.

An identity may remain `production_pending` with no installed states. An
installed state must declare an equipment-free body atlas and named attachment
sockets. Weapon images are registered separately by `visual_id`, and the
equipped item selects the attachment through its shared `animation_set`.

### Complete Battle-State Contract

An identity marked structurally complete must expose the required states in
catalog order, either as an explicit identity state or through its declared
presentation recipe:

1. `idle_guard`
2. `physical_attack`
3. `cast_class_ability`
4. `defend`
5. `hit_reaction`
6. `item_use`
7. `victory`
8. `ko_defeated`

Frame-level body transforms (`x`, `y`, and `angle`) are presentation-only and
remain inside the combatant container. Runtime applies the same transform to
equipment sockets so the weapon does not drift away from the body. A frame may
use `visible: false` to hide an attachment during an item-use pose.

Transient states return to `idle_guard`. Only `ko_defeated` may set
`hold_last_frame`; the held terminal pose survives until an explicit reset or
scene transition. Damage, defeat, item consumption, and victory remain
server-authoritative.

Required contract and browser checks for a complete identity include:

```bash
python3 skills/kithlands-visual-production/scripts/audit_battle_character_sheets.py \
  --require-complete
cd client && npm test -- --run src/data/battleCharacters.test.js \
  src/sprites/battleCharacterSprite.test.js
cd .. && ./scripts/run_playwright_local.sh e2e/all-class-battle-states.spec.js
```

The audit defaults to every registered identity. Inspect unique current-run
screenshots for every effective state, the persistent KO pose in desktop and
portrait viewports, and the layered character in a real fresh-game encounter.
Structural completion and passing automation do not replace class-by-class
visual acceptance.

### Cinder Staff Cast

Cinder's first installed slice uses six body-only poses—idle, coil, gather,
release, sustain, and recover—with the same shared War Staff attachment used by
Mender. The body preserves Cinder's shadowed face, cyan eyes, crooked violet
hat, gold-trimmed purple robes, and red-violet clasp; it does not reuse or
recolor Mender's body. Its aggregate-review status is `approved_runtime`.

### Brawler Unarmed Strike

Brawler's first installed slice is a six-pose straight punch: idle guard,
coil, step, impact, follow-through, and recover. It preserves the accepted bald
martial-artist identity, broad muscular proportions, orange gi, rope belt, and
white hand-and-foot wraps. The atlas is body-and-clothing only: `unarmed` is an
explicit equipment mode with no weapon attachment, not a weapon painted into
the body. Its aggregate-review status is `approved_runtime`.

### Rogue Shadow-Blade Slash

Rogue's first installed slice uses six body-only dagger poses: idle guard,
coil, step, impact, follow-through, and recover. The accepted green pointed
hood, long cloak, charcoal leather armor, crossed belts, and utility pouches
remain the identity anchors. The portrait blade is not present in the atlas;
`shadow_blade` now selects a separate curved dagger through shared item visual
metadata and per-frame `dagger` hand sockets. Its aggregate-review status is
`approved_runtime`.

### Wayfarer Staff Inspire

Wayfarer's first installed slice is the six-pose all-party Inspire rally:
idle guard, prepare, raise, rally, share, and recover. The accepted friendly
chestnut-haired face, feathered travel hat, brown cape, blue tunic, red sash,
stocky proportions, backpack, and bedroll remain identity anchors. The pack is
permanent identity gear; the staff is not in the atlas and uses the shared War
Staff item attachment. Its aggregate-review status is `approved_runtime`.

### Knight Sword-and-Shield Defend

Knight's first installed slice is a six-pose defensive brace: idle guard,
brace, raise, peak guard, absorb, and recover. The accepted fully enclosed
ivory-silver great helm, closed gold-trim visor, dark eye slit, blue gems,
white tabard, long cape, and noble full plate remain distinct from Warrior's
body. Both hands are empty in the atlas: the Mythril Sword and Steel Shield
are independent item-driven runtime layers with per-frame `sword` and `shield`
sockets. Its aggregate-review status is `approved_runtime`.

### Champion Unarmed Palm Burst

Champion's first installed slice is a six-pose two-hand palm burst: idle
guard, coil, step, double-palm impact, follow-through, and recover. It keeps
the accepted stern tan face, dark hair, long red headband tails, scarred bare
chest, dark teal one-shoulder wrap, red-brown sash, loose trousers, bracers,
and wrapped boots. The silhouette and two-hand action remain distinct from
Brawler's bald orange-gi straight punch. `unarmed` has no attachment, and the
portrait's fist flame is reserved for runtime effects rather than baked into
the body atlas. Its aggregate-review status is `approved_runtime`.

### Shadow Dagger Veil Strike

Shadow's first installed slice is a six-pose low veil strike: idle guard,
crouch, cloak windup, low dash, peak slash, and recover. The accepted pale
shadowed face, narrow magenta eyes, fitted violet hood and high scarf, black
segmented armor, violet seams, and wing-like layered cape remain permanent
identity anchors. Its horizontal dash and cape sweep differ from Rogue's
upright slash. The body contains no dagger; shared `shadow_blade` item metadata
selects the runtime layer and the portrait's second blade is not baked into
the atlas. Its aggregate-review status is `approved_runtime`.

### Sage Staff Sanctuary

Sage's first installed slice is a six-pose all-party Sanctuary blessing: idle
guard, prepare, raise blessing, project blessing, peak Sanctuary, and recover.
The accepted dignified elderly face, long white hair and beard, circular gold
halo, ivory gold-filigree robes, silver-lavender mantle, blue gems, and layered
gold chains distinguish the promoted healer from Mender. The halo is permanent
class regalia, while the body contains no staff or spell effect. Shared
`war_staff` metadata selects the equipment layer and the audit supplies the
all-allies effect. Its aggregate-review status is `approved_runtime`.

### Pyromancer Staff Inferno

Pyromancer's first installed slice is a six-pose Inferno invocation: idle
guard, coil, raise staff, peak invocation, release, and recover. The accepted
faceless black-void crimson hood, permanent curved orange-gold horn ornament,
layered red and magenta robes, black mantle and gloves, dense gold flame
filigree, and split coat tails distinguish it from Cinder. The body contains
no staff, crystal, dagger, fire, or flame ribbon; shared `war_staff` metadata
selects the equipment layer and the audit supplies the all-enemies fire
effect. Its aggregate-review status is `approved_runtime`.

### Wanderer Staff Waystar

Wanderer's first installed slice is a six-pose Waystar invocation: idle guard,
prepare, raise the free hand, point toward the horizon, peak Waystar, and
recover. The accepted short golden-blond hair, layered brown explorer leathers,
silver shoulder and knee guards, and asymmetric white/silver and indigo/night
cape keep the promoted traveler distinct from Wayfarer. The cape is permanent
identity clothing, but the body contains no staff, sidearm, star, spell, or
effect. Shared `war_staff` metadata selects the equipment layer, with the grip
authored in the image-right hand. Its aggregate-review status is
`approved_runtime`.

## Ground registration and effect cues

The runtime container position is the character's feet, using `feet_anchor`
(currently `[96, 184]`) from `shared/battle_characters.json`. Body images and
held attachments subtract the same offset from their centered atlas coordinates.
Formation lanes, floor shadows, movement destinations, and acting rings use this
feet position; target effects use the body center.

Attack and cast states declare `cue_frame` as an authored atlas frame ID. The
renderer reaches that pose before handing the authoritative server result to
scene effects, and holds it through impact before playing recovery. Movement
advances alongside the same authored frame durations. Reduced motion must retain
the cue even when other poses are skipped. Recipe expansion and server content
validation preserve and validate the cue against the actual frame sequence.

### Optional Warrior critical strike

`optional_states` declares identity-specific presentation states without making
them a requirement for every class or expanding them through shared recipes.
Warrior now authors `critical_attack` using the same approved six body images,
hand sockets and frame-3 contact cue as its sword attack. Longer anticipation
and recovery plus a modest shared body/attachment lean distinguish the strike.
The authoritative action's `crit` flag selects it; other identities retain their
normal physical attack until their own critical choreography is accepted.

Normal and reduced-motion playback must both retain contact, following shadows
and a return home. Critical damage and defeat text must remain separate. The
actual server-resolved three-round proof, inspected frame sequences, exact
commands and current limits are in `WARRIOR_CRITICAL_STRIKE_PROOF.md`.
