# Old Mill monster art

Five original static battle illustrations produced with the built-in OpenAI
image generator on 2026-09-04. The tool did not expose a model revision or seed.
The complete individual prompts are recorded in generation.json. No reference
art was used. There is no image service dependency at runtime.

Source PNGs remain under source/. export.py uses Pillow to normalize faint
generated alpha fringes, crop the occupied silhouette, resample to the authored
extent, and center it on a transparent square. Candidate PNGs and the contact
sheet remain under candidates/. export.json records source bounds, approved
canvas sizes, occupied bounds, and runtime destinations.

Regular creatures use 128×128 RGBA canvases; the Warden uses 192×192. All have
center origin (0.5, 0.5). The existing battle renderer fits each canvas to its
grid cell; deliberate occupied extents make bats smaller and the guardian
larger without changing shared battle layout. No ground shadow is baked in.
The game supplies a separate shadow. These are static enemy images, with the
existing battle hit/attack presentation; they are not walk or attack atlases.

The source, reduced candidates, and actual desktop/mobile battlefield were
inspected for complete silhouettes, transparent backgrounds, cropping, and
readability. Runtime copies are the five matching names under the monster
sprite directory. Source and candidate files are not loaded by the game.

Re-export by running export.py with a Python environment containing Pillow;
inspect candidates before copying approved files to runtime. The export is
deterministic and does not call an image model.
