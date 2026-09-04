# ImageGen production prompts

Tool: Codex built-in ImageGen. Date: 2026-09-04. Model identifier and seed were
not exposed by the tool. No API is used by the game. Inputs below are original
repository assets or outputs from these prompts.

## Ground floor

Style reference: `client/public/interiors/shop/shop-corner-goods-background.png`.

Create one original Kithlands game-ready inn ground-floor environment bitmap.
The provided shop image is STYLE REFERENCE ONLY: match its crisp pixel-informed
handpainted high three-quarter top-down orthographic JRPG camera, warm honey oak,
dark timber framing and natural stone, warm amber lights with muted teal textiles.
Do not copy the shop layout. New composition must be an exact 3:2 landscape
rectangle, full room filling canvas, no margin or UI. Runtime room 576x384 pixels
(18x12 32px game tiles), so place these zones proportionally and precisely: 32px
dark perimeter walls; open south door at x256..288 y352..384 centered slightly
left of center; broad warm wooden reception counter from x192 to352, y224 to256,
with ledger, bell, folded towels and keys, open walking floor directly behind it
y192..224 reserved for separate innkeeper sprite; unobstructed main walkway from
doorway north to counter; cosy hearth/fireplace against right-north wall in
x448..512 y32..96 with stacked firewood; two small windows in back wall at x128
and416; wooden stairs up along north-center, x288..352 y32..128, with opening at
x288..320 y96..128; a curtained guest bed alcove upper-left x64..128 y64..128;
small dining table x160..256 y160..192 with chairs below at x160 and256, simple
bowl/bread/mugs; reading rug on the lower left x96..160 y288..320, tiny floor-side
basket on far right. Keep clear navigable floor lanes along both sides of the
central furniture to reach the stairs and hearth, and no props along bottom
doorway approach. Rich inhabited warm traveler's inn, coherent modest furniture
scale, readable shapes, subtle lighting. No people, NPCs, animals, signs, letters,
text, grid lines, watermarks, copied game art or UI. A complete flat game room
background, not isometric diorama. Preserve floorplan proportions.

Final edit, using that draft as the target: Change ONLY the small brown treasure
chest at the foot of the upper-left bed into a neatly folded cream wool blanket
lying over the bed footboard. Remove the chest completely, exposing matching
floor/bed where necessary. Preserve every other pixel/composition element,
overall 1536x1024 dimensions, reception counter, stairway, floor, windows, hearth,
lighting, and wall coordinates. No other changes. No characters or text.

## Guest floor

Style reference: the first ground-floor draft.

Create a companion UPPER GUEST FLOOR bitmap for this original Kithlands inn.
Reference image is style reference, not a layout to preserve. Same beautifully
textured handpainted pixel-informed high top-down orthographic JRPG camera, amber
lighting, oak trim and stone perimeter, muted teal bedding. New exact 9:5
landscape rectangle, full room to image edges, NO black padding. Runtime
dimensions576x320, thin32px dark perimeter. Two guest alcoves: upper-left bed
x96..160 y32..96 with pillows at north, curtain partial division and bedside vase;
southeast bed x448..512 y224..288 pillows at north, with a tiny stool and folded
throw near right wall. Central shared reading table x160..256 y128..160 with book
and tea. Lower-central wooden stairs DOWN opening exactly x224..256 y192..224
with carved handrails down into darkness, unobstructed landing immediately above
and right. Clear loop walkways everywhere: open right corridor through x352..416
and horizontal corridor y96..128. Reserved empty stone floor at x448..480 y64..96
for separate interactive chest sprite (do NOT draw chest or any object there).
Reserved empty floor x352..384 y128..160 for separate guest NPC. Two small cool
blue back-wall windows x128 and384, amber sconces, linen shelving along left
border only, luggage represented by cloth travel bundles. Low partition at left
guest alcove; avoid dividing entire room with walls. No front exterior door:
enclosed south wall. Quiet inhabited upstairs room matching ground floor
architecture. No characters, no NPCs, no text, no markings, no grids, no UI, no
watermarks. Do NOT draw any chests anywhere. Keep furniture modest and clear paths
around all sides of table.

## Guest chest

One isolated original Kithlands inn guest coffer asset on genuinely transparent
background. A small closed honey-oak travel chest, dark iron bands, single brass
latch, subtly curved wooden lid. High three-quarter top-down orthographic JRPG
camera, see lid and front, consistent with handpainted crisp pixel-informed
fantasy inn. Clear chunky silhouette and readable broad forms at 32x32 runtime
scale. Muted warm wood, subtle teal fabric strap. Object occupies 85 percent of
square canvas, centered, bottom at 90 percent. No text, people, floor, scenery,
border, glow, sparkles or cast ground shadow. Transparent PNG game prop, closed lid.

Open-state edit using the closed chest as reference: Edit this original game prop
into its OPEN, EMPTY state: raise lid on back hinge, show dark empty interior.
Preserve identity, honey-oak wood, iron bands, teal fabric strip and clasp, camera
direction, perspective, bottom anchor at90%, square transparent PNG. Keep same
outer chest base size/position as much as possible; raise lid upward insidecanvas,
zoom out only enough to keep entirety. No treasure, glow, sparkle, floor or cast
ground shadow. Genuinely transparent background, no white/black background.

The open draft incorrectly painted a checkerboard. Final extraction prompt:
Remove the white/gray checkerboard behind this open empty wooden game chest.
Deliver TRUE TRANSPARENT PNG alpha channel, not a drawing of transparency. Keep
chest artwork unchanged. Nothing in background, no ground shadow. Clear true
transparency around the silhouette and in gaps between raised lid and chest.
Output actual transparent image.

## Normalization and review

ImageGen did not exactly follow every requested coordinate. The shared rows and
opaque foreground crops were fitted to the inspected runtime paintings, then
checked for reachable interactions and visible collision agreement. Runtime
background dimensions are exactly 576x384 and 576x320; chest images are 64x64 RGBA.
The accepted derivatives and actual game screenshots were inspected separately.
