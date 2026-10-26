# Gathering prop source and normalization

Original Kithlands art generated with the built-in `image_gen` tool on
2026-10-26. The tool did not expose a model identifier or seed. No hosted art
service is used by the game. The four selected full-resolution RGBA sources
are retained in `source/`; generated candidates stayed under `client/tmp/`
until visual inspection. These are individual static objects, not character
atlases or animation sheets.

Runtime files: `client/public/environment/resources/`. Presentation keys and
paths live in `shared/field_presentation.json`. Every runtime prop is RGBA,
64x48 pixels, bottom-center anchored; content bounds preserve aspect ratio.
Point sampling keeps the pixel treatment crisp. A 60% alpha threshold removes
the model's diffuse exterior halo and makes the solid body opaque. The initial
iron draft and its cleanup attempt retained a halo, so neither unnormalized
image was installed. Source artwork is not overwritten.

| Material | Runtime PNG |
| --- | --- |
| Meadow herb | `client/public/environment/resources/meadow-herbs.png` |
| Hardwood | `client/public/environment/resources/fallen-hardwood.png` |
| Ember iron ore | `client/public/environment/resources/iron-outcrop.png` |
| Mythril ore | `client/public/environment/resources/mythril-outcrop.png` |

Reproduce candidates (requires ImageMagick for offline asset production only):

```bash
bash docs/art/gathering/normalize.sh
```

Inspect the candidate files before copying into the runtime directory. No
normalizer or image model is required to build or play Kithlands.

## Prompts

All calls requested `transparent_background: true`. The first three requests
were separate generations. Iron cleanup and Mythril used the iron source as an
explicit edit target. Original prompts follow verbatim.

### Iron draft

Use case: stylized-concept. Asset type: one original pixel-art resource prop for the Kithlands top-down JRPG, a low iron-ore outcrop on truly transparent background. Subject: ONE compact naturally weathered cluster of three grey slate boulders emerging from the ground, rusty copper-orange iron veins running through fractured stone, a few gravel pieces at the feet. Grounded three-quarter top-down RPG camera, front face and top face visible; no isometric diamond or platform. Warm daylight from upper left. Restrained olive-grey stone palette, warm orange veins and dark crisp outlines; deliberate pixel clusters and hand-painted pixel-art texture matching a detailed 64px RPG character, sharp edges, no blur, no glossy mobile-game style. Silhouette broad and low, wider than tall; visual anchor at bottom center. Full isolated object, generous transparent margin, no landscape, no grass tile, no text, no symbols, no sparkle, no magical glow, no shadow outside the footprint. Designed to be downsampled to a 56x44 game prop and remain clearly recognizable as ore. Create the object only, not a spritesheet or icon badge.

### Iron cleanup — selected source

Edit target: this iron ore prop. Preserve the exact rock silhouette, top-down viewpoint, orange mineral veins and pixel-art stone detail. Remove ALL diffuse warm halo and ALL background haze/shadow outside the actual solid rock/gravel silhouette; make that entire surrounding area genuinely alpha zero. The rocks themselves must be fully opaque, crisp pixel-art edges with no translucent body. Remove tiny detached gravel far from the footprint. No glow or sparkles; the veins are mineral, not light sources. Keep generous clear transparent margins around the one intact complete object. This is a game sprite cutout, not a backlit illustration. No additional objects, no labels, no platform.

### Meadow herbs

Use case: stylized-concept. Asset type: original gathering resource prop for Kithlands, a top-down pixel-art RPG. ONE isolated compact clump of harvestable meadow herbs, full plant visible with transparent background and generous clear margins. Three broad sage-green leafy stems form a lush low rosette, a few small cream-white flowers above, pale stems, roots emerging from a tiny dark earth footprint. Three-quarter top-down RPG camera, upper-left daylight. Detailed hand-painted pixel-art with crisp dark olive outlines and restrained natural greens; deliberate pixel clusters, no blur. Wide low silhouette roughly 1.2 times wider than tall. Must remain recognizable as medicinal herbs at 42x34 pixels. No icon border, no labels, no grass tile or scenery, no halo, no glow, no sparkle, no shadow outside the plant footprint, no illustration background. Object only, not a spritesheet.

### Fallen hardwood

Use case: stylized-concept. Asset type: original gathering resource prop for Kithlands, a top-down pixel-art RPG. ONE isolated naturally fallen short hardwood trunk, full object visible with truly transparent background and clear margins. A heavy weathered oak log lying diagonally across ground, rough dark brown bark with olive moss along upper side, a broken branch stub and broken end showing pale golden wood and believable growth rings. No axe, no saw, no lumber pile, no tree canopy. Three-quarter top-down RPG camera, upper-left daylight. Detailed hand-painted pixel-art with crisp dark outlines, deliberate pixel clusters, earthy restrained browns and olive moss; no smooth vector shading, no blur. Wide low silhouette about 1.7 times wider than tall. Designed to remain recognizable at 54x34 pixels. No icon border, no labels, no ground tile, no grass border, no scenery, no halo, no glow, no sparkle, no shadow outside the footprint. Object only, not a spritesheet.

### Mythril variant

Use case: precise-object-edit. Edit target: the isolated iron ore rock cluster. Change ONLY the rusty orange mineral veins to pale icy blue and silver mythril veins. Keep the original slate rock structure, same silhouette and pixel-art rendering, same full object framing and top-down RPG camera. Veins are nonluminous minerals; no sparkle, no light emission. Truly transparent background, no haze or glow around silhouette, no additional objects, no labels. This is the rare mineral counterpart to the same game resource prop.

## Acceptance limits

Native route and viewport evidence is in `docs/GATHERING_RESOURCE_ART_PROOF.md`.
The server still owns availability, quantities, habitats and absolute respawn
deadlines. Depleted nodes retain the existing small rubble/cut-stem/bark marks;
they do not render the full harvestable prop. Full authored forest composition,
stronger path hierarchy and broader environment approval remain separate work.
