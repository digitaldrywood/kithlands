# Sunforged Equipment Prompt Record

Generated with the Codex built-in ImageGen tool on 2026-08-08. The accepted
runtime files are under `client/public/sprites/items/midlevel/`. Source
candidates and the inspected contact sheet are retained locally under
`client/tmp/sunforged-showcase-20260808/`.

## Shared prompt

```text
Use case: stylized-concept
Asset type: Kithlands game UI equipment icon
Style/medium: hand-painted classic 16-bit-era JRPG inventory icon with crisp modern polish; original fantasy design
Composition/framing: one centered isolated object, three-quarter view, strong silhouette, generous padding, readable at 64x64
Color palette: luminous white-gold metal, deep cobalt blue accents, restrained warm amber-orange rune details
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for local background removal
Constraints: include clearly visible EMPTY circular gem socket receptacles built into the object; the sockets are dark and unfilled, not glowing; no inserted gems; background must be one uniform #00ff00 color with no shadows, gradients, texture, reflections, floor plane, or lighting variation; crisp edges; do not use #00ff00 anywhere in the object; no cast shadow; no contact shadow; no text; no border; no logo; no watermark.
```

## Item subjects

- Oathblade: a one-handed knight sword with an elegant white-gold blade, cobalt grip, sunburst guard, and two visible empty sockets in the guard and blade base.
- Aegis: a compact knight shield with a sunburst face, cobalt enamel, and two visible empty sockets aligned vertically in the shield center.
- Greathelm: a closed knight greathelm with cobalt plume and one prominent empty socket centered above the visor.
- Mantle: a matched pair of ornate shoulder pauldrons joined by a small cobalt mantle panel, with one visible empty socket in each pauldron.
- Cuirass: an ornate knight breastplate and short plated fauld, with two prominent empty socket receptacles across the upper chest.
- Gauntlets: a matched pair of articulated knight gauntlets with one visible empty socket set into the back of each hand.
- Warbelt: a broad cobalt-and-white-gold knight warbelt with a sun clasp and two visible empty sockets in the belt fittings.
- Greaves: a matched pair of ornate plate greaves for the lower legs, with one visible empty socket in each knee plate.
- Sabatons: a matched pair of ornate knight sabatons and armored boots, each with a visible empty socket at the ankle or instep; clearly footwear and not greaves.
- Pendant: a white-gold sun medallion pendant hanging from a short deep-cobalt cord, with one prominent empty circular gem socket in the medallion center.
- Signet: a chunky white-gold signet ring with cobalt enamel details and one prominent empty circular gem socket set into the ring face.

## Processing

The repo chroma-removal script used border sampling, a soft matte, thresholds
12/220, and despill. Accepted candidates were trimmed, fit inside a 58px box,
and centered on transparent 64×64 PNG canvases. All accepted images have fully
transparent corner pixels.
