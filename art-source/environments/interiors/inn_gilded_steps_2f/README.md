# Riverlight Inn: two-floor authored slice

Partial progress on #271. Cadott already selected `inn_gilded_steps_2f` through its
stable destination seed; this work preserves that template ID, two floors,
entrance, stair links and `gilded_guest_chest` reward definition. It also improves
other inn instances that already select this template, without changing the
three-template registry or its selection order.

## Source and runtime

Original paintings were drafted with Codex built-in ImageGen on 2026-09-04.
The approved Corner Goods background was a style reference; no protected game
art was used. The full production prompts are preserved in `prompts.md`.

- `ground-source.png`: reception, hearth, dining table, guest alcove and stair.
- `guest-source.png`: upper guest alcoves, reading table and stair landing.
- `chest-closed-source.png` and `chest-open-source.png`: original transparent
  guest coffer states, drawn separately and inspected at runtime scale.
- `candidates/ground-with-decorative-chest.png`: rejected first draft. Its extra
  painted chest was replaced with a folded blanket so it would not promise a
  nonexistent interaction.
- `floor-0.tmj` and `floor-1.tmj`: Tiled maps with explicit ground, collision,
  interaction, NPC, spawn, foreground and atmosphere layers. Toggle the hidden
  guide layers in Tiled to inspect coordinates against the painting.

The runtime paintings are resampled with macOS `sips` to 576×384 and 576×320.
The chest assets are 64×64 RGBA, displayed at one 32-pixel room tile. Runtime
files live in `client/public/interiors/inn/`. They require no image service.

The existing shared interior JSON remains the gameplay source. Run
`python3 art-source/environments/interiors/inn_gilded_steps_2f/export-layouts.py`
from the repository root after changing its geometry to update the Tiled guides.
No gameplay collision is inferred from image colors. Backgrounds use a native
32-pixel tile footprint so foreground crop coordinates refer directly to their
pixels. Foreground regions contain only opaque furniture/trim and use the same
row depth ordering as actors; the original painting remains underneath.

## Acceptance

The authored room separates a welcoming reception from the quieter upper floor.
Wide routes connect the south entrance, service counter, hearth, guest and stair.
The innkeeper, traveler and guard retain the existing interaction identities;
shared dialogue supplies their text. The guest chest keeps its existing 180-gold
reward and is claimed once. Inn rest stays free, with HP/MP restored by Go.
Saved games retain their existing overworld resume behavior; chest flags and
rewards survive loading and revisiting the inn.

`client/e2e/cadott-inn.spec.js` exercises the real town doorway, both floors,
keyboard/touch dialogue, free rest, guest conversation, chest open/empty states,
save and walking out to town at 800×600, 1440×900 and 390×844. Unique screenshots
and before/rested/claimed/returned state records are written under
`client/tmp/cadott-inn-<run-id>/`. Visual acceptance is recorded in the PR after
opening those screenshots; automated success alone is not acceptance.
