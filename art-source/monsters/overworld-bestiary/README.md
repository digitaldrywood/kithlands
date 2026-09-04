# Overworld bestiary monster art

Four original static battle illustrations produced with the built-in OpenAI
image generator on 2026-09-04. The tool did not expose a model revision or
seed. The complete individual prompts are recorded in `generation.json`. No
reference art was used, and the game has no image-service dependency at
runtime.

Source PNGs remain under `source/`. `export.py` uses Pillow to discard the
generated semi-transparent backdrop fringe, crop the occupied silhouette,
resample it to the authored extent, and center it on a transparent square.
Candidates and the contact sheet remain under `candidates/`; `export.json`
records source bounds, approved canvas sizes, occupied bounds, and runtime
destinations.

All four creatures use 256x256 RGBA canvases and center origin (0.5, 0.5).
They are static enemy images with the existing battle hit/attack presentation,
not walk or attack atlases. No ground shadow is baked in; the game renders its
own shadow.

The sources and reduced candidates were inspected for complete silhouettes,
transparent backgrounds, clipping, and readability. Runtime copies are the
matching names under `client/public/sprites/monsters/`. Source and candidate
files are never loaded by the game.

Re-export by running `export.py` with Pillow installed, then inspect the
candidates and regenerated runtime files. Export is deterministic and never
calls an image model.
