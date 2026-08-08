# Tooling And Model Strategy

Reviewed: 2026-08-08

## Default No-Subscription Stack

| Need | Default | Why |
| --- | --- | --- |
| Browser runtime | Phaser 3 | Already integrated; supports spritesheets and Tiled JSON. |
| Map authoring | Tiled | Free and open source; terrain sets, templates, object layers, Automapping, JSON export. |
| Sprite cleanup and animation | Pixelorama | Free and open source; layers, animation tags, onion skinning, tilemaps, spritesheet import/export. |
| Painting and constrained edits | Krita | Free and open source; suitable for masks, paintover, and frame repair. |
| Deterministic pose/angle source | Blender | Free and open source; rigs, orthographic cameras, transparent frame rendering, scripting. |
| Optional local generation | ComfyUI | Local node workflow; pose, depth, line-art, and reference conditioning can be saved and repeated. |
| Runtime and visual QA | Vitest + Playwright + image audits | Existing repo stack; deterministic and reviewable. |

Do not require a hosted art service to build, run, or validate the game.

## What Paid Sprite Services Get Right

PixelLab's public API separates work that this repo previously collapsed into a
single prompt:

1. create and persist a character identity;
2. generate explicit four- or eight-direction rotations;
3. animate an existing character, not a new character per frame;
4. drive motion with skeleton templates or keypoints;
5. use a fixed direction, camera view, seed, palette, and transparent output;
6. interpolate or edit a subset of frames;
7. export rotations, animation frames, and metadata together;
8. generate terrain tiles and map objects as different asset types.

Reproduce that decomposition locally. Do not imitate the API by generating a
large grid and cropping whatever appears in each cell.

## Image Model Use

Use general image models for concept exploration, identity sheets, environment
paintovers, object variants, and tightly masked frame repair. They are not the
authority for sheet geometry or animation timing.

When already available:

- OpenAI GPT Image 2 supports high-fidelity reference input and image editing.
- Gemini 3.1 Flash Image and Gemini 3 Pro Image support multiple references and
  high-resolution iterative generation.
- Local ComfyUI workflows can use pose, line art, depth, normals, and reference
  conditioning without per-call service charges, but require local model setup
  and enough hardware.

Save the prompt, model identifier, reference paths, mask paths, seed when
available, and output path with every candidate. Model output must remain
replaceable; runtime code may not call an image model.

## Deterministic Character Option

For motion that must not drift, use a reusable 2D or 3D rig as the pose source:

1. fit the approved character design to a fixed skeleton;
2. author the walk and attack once with planted-foot constraints;
3. render eight orthographic directions to transparent frames;
4. apply the approved pixel treatment and palette;
5. retouch silhouettes and class-specific equipment in Pixelorama;
6. export the canonical sheet and metadata.

This is more setup than prompting, but it guarantees direction, body scale,
head position, stride phase, and frame count. Reuse the rig for every class.

## Packaging Direction

Keep the game browser-first. A later Steam/macOS build can package the same web
client with Electron after browser behavior is stable. A later mobile build can
use Capacitor to wrap the same web app for iOS and Android. Do not add either
wrapper until responsive layout, touch input, pause/resume, and save behavior
pass in the browser. Keep game actions independent of raw keyboard keys so
touch and controller bindings can be added without changing gameplay code.

## Primary Sources

- OpenAI GPT Image 2: https://developers.openai.com/api/docs/models/gpt-image-2
- Gemini image generation: https://ai.google.dev/gemini-api/docs/image-generation
- PixelLab API: https://www.pixellab.ai/pixellab-api
- PixelLab API reference: https://api.pixellab.ai/v2/docs
- PixelLab skeleton animation: https://www.pixellab.ai/docs/tools/animate-with-skeleton
- Pixelorama manual: https://pixelorama.org/introduction/
- Pixelorama animation export: https://pixelorama.org/user_manual/save_and_export/
- Pixelorama tilemaps: https://pixelorama.org/user_manual/tilemaps/
- Tiled JSON export: https://doc.mapeditor.org/en/stable/manual/export-generic/
- Tiled templates: https://doc.mapeditor.org/en/stable/manual/using-templates/
- Tiled Automapping: https://doc.mapeditor.org/en/latest/manual/automapping/
- Phaser Tiled JSON loader: https://docs.phaser.io/api-documentation/class/loader-loaderplugin
- ComfyUI preprocessors: https://docs.comfy.org/tutorials/utility/preprocessors
- Blender transparent film: https://docs.blender.org/manual/en/latest/render/cycles/render_settings/film.html
- Electron application packaging: https://www.electronjs.org/docs/latest/tutorial/application-distribution
- Capacitor documentation: https://capacitorjs.com/docs
