# Battle Character Animation Production Contract

Status: Warrior gold-slice candidate. Do not scale to other classes until the
Warrior has been accepted in the actual battle scene.

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
- Feet anchor: `(96, 184)` in every frame
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
  sword_attack_body.png
  weapons/<weapon-visual-id>.png
  sword_attack.json
```

Candidates stay under `client/tmp/` until identity, geometry, and motion gates
pass. Runtime assets are installed only from an accepted candidate.

## Acceptance Gate

- The helmet, blue plume, silver plate, gold trim, blue cape, proportions, and
  silhouette remain the same character in every frame.
- The entire head, cape, hands, and both feet remain visible.
- The body contains no sword, axe, staff, bow, shield, ground shadow, effect,
  text, or detached debris.
- Feet remain fixed to the common anchor and body scale does not pulse.
- The weapon grip stays attached to the authored hand socket.
- The weapon can pass behind and in front of the body without clipping.
- Attack motion reads at runtime speed and returns to the exact guard frame.
- Changing `weapon_visual_id` changes the held weapon without changing body
  identity or animation timing.

Required proof is a source contact sheet, an animation trace or GIF, and the
complete attack-and-return sequence in the real Systems Showcase battle.
