# Meadow production

Tool: built-in `image_gen`. Generated originals and SHA-256 hashes are recorded
in `metadata.json`; originals remain under `client/tmp/warrior-polish/generated/`.

## Prompt specifications

Battle clearing: a full-bleed pixel-art JRPG meadow, open grassy floor for actors,
warm diagonal worn path, distant oak at upper left, a small ruin at upper right,
distant hills and sky, foreground flowers. Protect the central playfield; no
characters, baked HUD, labels or black bands. The new frame replaces the old
meadow crop and fills the battle playfield.

Prop strip: six separated transparent pixel-art objects in a consistent meadow
palette: mature oak, sapling, white/gold flower patch, lavender flower patch,
grass tuft and shrub. No floor, baked shadows, grid or labels. Normalize the
objects with a common scale into six 96x96 cells, retaining size relationships.

## Runtime composition

The meadow uses cached low-contrast native terrain variations, a data-authored
Tiled object vignette, sparse deterministic plants and tall foliage on existing
tree terrain. Depth follows feet; overlapping canopies fade; offscreen props
are culled. The player has a separate shadow following its feet. Existing
authoritative collision and movement rules continue to govern traversal.

The normalized prop source is `props.png`; runtime files and geometry are in
`metadata.json`. Data lives in `shared/field_presentation.json`. Actual desktop
and portrait proof is recorded in `docs/WARRIOR_MEADOW_BATTLE_PROOF.md`.
