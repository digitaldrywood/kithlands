#!/usr/bin/env python3
"""Generate pre-rendered battle backgrounds via the Gemini image API.

Outputs 800x600 PNG scenes (plus a 1600x1200 @2x copy) under
client/public/backgrounds/<motif>/<motif>_<n>.png. Scenes are fully painted
frames (no magenta chromakey) intended to sit behind the FF6-style battle HUD.

Usage:
    GEMINI_API_KEY=... python3 scripts/generate_battle_backgrounds.py \\
        [--motif MOTIF] [--variants N] [--force]

Motifs: plains forest dunes mountains snow marsh shore interior
Default: every motif that is missing at least one committed variant.
"""

import argparse
import base64
import json
import os
import subprocess
import sys

Image = None
io_module = None


def _ensure_pil():
    global Image, io_module
    if Image is not None:
        return
    try:
        from PIL import Image as _Img
        import io as _io
        Image = _Img
        io_module = _io
    except ImportError:
        sys.path.insert(0, "/tmp/kith-venv/lib/python3.12/site-packages")
        try:
            from PIL import Image as _Img
            import io as _io
            Image = _Img
            io_module = _io
        except ImportError:
            print("ERROR: Pillow not installed. Run: pip install Pillow")
            sys.exit(1)


def _load_api_key():
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        return key
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    envrc_local = os.path.join(os.path.dirname(__file__), "..", ".envrc.local")
    if os.path.exists(envrc_local):
        with open(envrc_local) as f:
            for line in f:
                line = line.strip()
                if "GEMINI_API_KEY=" in line:
                    _, _, rhs = line.partition("GEMINI_API_KEY=")
                    return rhs.strip().strip('"').strip("'")
    return ""


API_KEY = _load_api_key()
MODEL = "gemini-2.5-flash-image"
BASE_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/"
    f"{MODEL}:generateContent?key={API_KEY}"
)
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public")
BG_DIR = os.path.join(PUBLIC_DIR, "backgrounds")

TARGET_W = 800
TARGET_H = 600

STYLE_SUFFIX = (
    "Final Fantasy Pixel Remaster battle background, 800x600 at 4:3, cinematic "
    "painted scene. "
    "CRITICAL LAYOUT CONSTRAINTS (follow these exactly): "
    "(1) The LEFT THIRD of the frame — roughly x=80 to 430, y=100 to 320 — "
    "must stay compositionally OPEN. Only sky, distant haze, or atmospheric "
    "depth here. NO foreground trees, pillars, statues, mountains, or any "
    "tall vertical subject. Combatants will stand in this zone. "
    "(2) The RIGHT THIRD of the frame — roughly x=460 to 720, y=100 to 320 — "
    "must also stay compositionally OPEN, same rule. Combatants stand there "
    "too. A subject centered in either of these zones will clutter the scene. "
    "(3) The BOTTOM 130 PX (y=470 to 600) will be fully covered by a solid "
    "UI panel — treat that entire band as throwaway filler. "
    "(4) Place the painting's FOCAL SUBJECT (a tree, pillar, distant peak, "
    "statue, lantern, etc.) in ONE of three safe bands: the upper sky "
    "(y=0 to 100), the mid-distance above the UI strip (y=320 to 470), or a "
    "narrow central hint between the combatants (x=430 to 460). Never inside "
    "the combatant zones. "
    "(5) The horizon line should sit in y=320 to 470 so it reads below the "
    "combatants' feet and above the UI strip. "
    "(6) Any distant treeline, mountain ridge, or far-off building row must "
    "render as a LOW SILHOUETTE BAND entirely inside y=320 to 470. NO tree "
    "trunks, pine spires, or vertical structures rising up from the treeline "
    "into the combatant zones. If the biome naturally has trees, render them "
    "as a distant dark silhouette only — treat individual trunks and "
    "spires above y=320 as forbidden. "
    "(7) HEIGHT CAP ON THE FOCAL SUBJECT: the focal subject MUST fit "
    "entirely between y=370 and y=470 (that is, no taller than ~100 px on "
    "an 800x600 canvas). This means small scale only — a low boulder, a "
    "short shrub, a distant lantern at ground level, a small altar, a "
    "bridge silhouette. ABSOLUTELY NO tall towers, spires, obelisks, "
    "pillars, dead trees, brazier columns, or any monument rising up into "
    "the y=100-320 combatant zones. If you are tempted to draw a tall "
    "central object, draw it smaller or omit it entirely — a great painted "
    "scene with no hero subject is better than one with a subject that "
    "occludes the combatants. "
    "Atmospheric perspective, vivid but not cartoonish colors. No characters, "
    "no UI, no text, no borders, no watermarks."
)

# Each motif maps to a list of per-variant subject descriptors. Number of
# entries = variant count. Index + 1 becomes the filename suffix.
MOTIF_PROMPTS = {
    "plains": [
        "Open grassland under a warm afternoon sky. The entire mid-band "
        "(y=320-470) is an empty flat grass plain with no trees, no "
        "buildings, no focal subject at all. Upper sky has soft cumulus "
        "clouds. Left and right thirds are open grass and sky.",
        "Wildflower meadow at late spring dusk. A tiny distant windmill "
        "silhouette sits dead-center on the far horizon between where the "
        "combatants will stand. Left and right of the frame are empty gently "
        "rolling grass — no trees, no buildings. Upper sky golden and soft.",
        "Dry plains at sunset. Low mesas as a thin silhouette along the far "
        "horizon (y=320-470). Foreground is short pale grass and dirt with "
        "nothing tall. Upper sky is warm ochre, lilac, and rose.",
    ],
    "forest": [
        "Forest clearing at golden hour. A dense distant treeline forms a "
        "silhouette band along the far mid-ground (y=320-470). The left and "
        "right thirds of the frame are clear forest floor — grass, ferns, "
        "scattered leaves — with NO tree trunks rising into them. Upper half "
        "is pale sky with soft sun rays filtering through the distant canopy.",
        "Pine forest clearing at twilight under a full moon. Distant pine "
        "silhouettes as a LOW silhouette band at y=320-400 only — never "
        "rising above y=320. The full moon sits in the upper sky high above "
        "the combatant zones (y=0-80). Foreground (y=400-470) is open mossy "
        "ground with bioluminescent hints. NO focal subject in the middle of "
        "the frame — just open ground with a soft atmospheric glow.",
        "Mossy forest clearing at dawn. A warm god-ray beam comes down from "
        "the upper-center sky. Distant canopy silhouette forms a band along "
        "the far horizon. Foreground is a clear mossy forest floor; left "
        "and right thirds are open — no tree trunks, no ferns tall enough to "
        "crowd the combatants.",
        "Autumn forest clearing at dawn. Distant band of red and amber "
        "birches along the far horizon (y=320-470). Foreground is an open "
        "leaf-strewn clearing with low scattered leaves only. Sky is soft "
        "rose-gold. No vertical trunks in the left or right thirds.",
    ],
    "dunes": [
        "Rolling desert dunes at high noon. The left and right thirds of the "
        "frame are smooth empty sand, no dunes rising tall into them. A "
        "single distant dune crest and small caravan silhouette sit on the "
        "far horizon. Upper sky is hazy turquoise fading to pale.",
        "Desert oasis at dusk. A small distant palm silhouette and reflective "
        "pool sit dead-center on the far horizon. Left and right thirds are "
        "empty smooth sand. Upper sky is violet fading to orange.",
        "Open desert at sunset. Layered sandstone silhouette along the far "
        "horizon (y=320-470). Foreground is flat empty sand, no formations "
        "in the left or right thirds. Upper sky is warm copper and deep rose.",
    ],
    "mountains": [
        "Mountain pass viewed from a plateau. Jagged snow-capped peaks form a "
        "distant silhouette along the far horizon (y=320-470). Left and "
        "right thirds of the frame are open stone plateau, no tall rocks or "
        "pines in them. Upper sky is cold blue with thin clouds.",
        "Alpine valley overlook. The far peaks sit along the horizon as a "
        "distant silhouette. Foreground is open stone with a few very low "
        "scattered rocks. Left and right thirds are empty. Upper sky has "
        "wisps of cloud catching afternoon light.",
        "Mountain plateau at sunrise. Warm pink and gold peaks form the far "
        "horizon silhouette. Foreground is open rocky ground, left and right "
        "thirds empty. Upper sky has cold blue shadow fading to warm gold.",
    ],
    "snow": [
        "Wide snowfield at midday. Distant dark evergreens along the far "
        "horizon as a thin silhouette. Left and right thirds are smooth "
        "empty snow, no pines in them. Upper sky is crisp blue with soft "
        "lavender shadows on the snow.",
        "Snowy plain at dusk. A far-distant treeline of snow-laden pines "
        "along the horizon, warm amber light glowing from behind. Foreground "
        "is open snow. Left and right thirds are empty. Upper sky cool blue "
        "fading to warm peach near the treeline.",
        "Frozen lakeshore. Cracked ice in the foreground. Distant mountains "
        "form a pale silhouette along the far horizon. Left and right "
        "thirds are open ice and snow. Upper sky overcast pale grey with a "
        "hint of pink.",
    ],
    "marsh": [
        "Swamp clearing at dawn. Distant cypress silhouettes form a treeline "
        "along the far horizon. Foreground is open shallow water reflecting "
        "the sky. Left and right thirds are empty water, no cypress trunks "
        "in them. Upper sky is amber mist.",
        "Reed marsh at late afternoon. A winding channel of water runs "
        "across the mid-ground, reflecting a pale sky. Distant reed-line on "
        "the horizon. Left and right thirds are open water with only very "
        "short foreground reeds. Upper sky is warm gold and green.",
        "Bog at dusk. Distant gnarled dead trees form a silhouette band "
        "along the far horizon. Foreground is shallow dark water with "
        "faint green firefly spores. Left and right thirds are empty water, "
        "no vertical trunks in them. Upper sky deep teal and violet.",
    ],
    "shore": [
        "Sandy beach at golden hour. Open wet sand foreground reflecting the "
        "sky. Distant palm silhouette and horizon line along the far band. "
        "Left and right thirds are empty sand. Upper sky coral and amber.",
        "Riverbank on a bright summer afternoon. The river runs horizontally "
        "across the mid-ground, reflecting a pale sky. Distant green hills "
        "silhouette on the far horizon. Foreground is open pebble bank; "
        "left and right thirds are empty. Upper sky pale blue with soft cloud.",
        "Stone arched bridge at dusk, bridge silhouette centered on the far "
        "horizon over a wide slow river. Foreground is open riverbank. "
        "Left and right thirds are empty. Upper sky lavender with warm "
        "lantern glow reflecting on the water.",
    ],
    # Interior variants are ordered to match INTERIOR_VARIANT_BY_BUILDING in
    # client/src/scenes/battleBackgrounds.js: 1=temple, 2=inn, 3=shop, 4=house.
    "interior": [
        "Stone temple interior, very LOW camera angle looking along the "
        "flagstone floor. The far back wall is small on the horizon "
        "(y=320-470) with a tiny distant altar silhouette and soft warm "
        "candle glow. NO pillars anywhere in the frame. NO tall columns. "
        "Upper half is smooth dim stone ceiling and wall colors fading "
        "into shadow — no architectural verticals rising up. Only the "
        "floor plane and a short distant altar. Stained-glass light as a "
        "soft warm tint on the flagstones, not as visible windows. No "
        "figures, no pillars, no columns.",
        "Cozy inn common room viewed down the center aisle. The stone "
        "hearth and hanging lanterns sit dead-center on the far wall. "
        "Left and right thirds are open wooden floor with low stools pushed "
        "against the far walls only. Upper area has rafters in shadow. "
        "No figures, no text.",
        "Magic shop interior, LOW camera angle looking along the wooden "
        "floor. A small distant counter silhouette with a tiny lantern "
        "glow sits on the far wall (y=380-460). Upper half of the frame is "
        "smooth dim ceiling timber with soft warm light — NO shelves, NO "
        "potion bottles, NO stacked crates visible in the main frame. Any "
        "shelving is pushed entirely below y=460, treated as distant "
        "silhouette only. Left and right thirds are open wooden floor and "
        "soft wall shadow. No shopkeeper, no figures.",
        "Modest stone-and-timber house interior viewed down the center "
        "aisle. A small hearth with glowing embers sits dead-center on the "
        "far wall, with a window above it catching soft daylight through "
        "linen curtains. Left and right thirds of the foreground are open "
        "wooden floor with a woven rug running down the center. Simple "
        "chairs and a table pushed against the far walls only, nothing "
        "rising into the combatant zones. No figures, no text.",
    ],
}


def generate_image(prompt, aspect_ratio="4:3", reference_png=None):
    """Call Gemini and return a PIL Image, or None on failure.

    If reference_png (path or bytes) is provided, it's sent as inline_data
    alongside the text prompt so Gemini 2.5 Flash Image can use it as a
    composition reference (up to 14 images supported per request).
    """
    _ensure_pil()
    parts = [{"text": prompt}]
    if reference_png is not None:
        if isinstance(reference_png, (str, bytes, os.PathLike)) and not isinstance(
            reference_png, bytes
        ):
            with open(reference_png, "rb") as f:
                raw = f.read()
        else:
            raw = reference_png
        parts.append(
            {
                "inline_data": {
                    "mime_type": "image/png",
                    "data": base64.b64encode(raw).decode("ascii"),
                }
            }
        )
    payload = {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect_ratio},
        },
    }
    req_file = f"/tmp/gemini-bg-req-{os.getpid()}.json"
    resp_file = f"/tmp/gemini-bg-resp-{os.getpid()}.json"
    with open(req_file, "w") as f:
        json.dump(payload, f)

    result = subprocess.run(
        [
            "curl", "-s", "-o", resp_file, "-w", "%{http_code}",
            "-X", "POST", BASE_URL,
            "-H", "Content-Type: application/json",
            "-d", f"@{req_file}",
        ],
        capture_output=True, text=True, timeout=180,
    )
    status = result.stdout.strip()
    if status != "200":
        print(f"  ERROR: HTTP {status}")
        try:
            with open(resp_file) as f:
                print(f"  body: {f.read()[:400]}")
        except OSError:
            pass
        return None

    with open(resp_file) as f:
        data = json.load(f)
    if "error" in data:
        print(f"  ERROR: {data['error'].get('message', '')}")
        return None
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    for part in parts:
        if "inlineData" in part:
            raw = base64.b64decode(part["inlineData"]["data"])
            return Image.open(io_module.BytesIO(raw))
    print("  ERROR: no image in response")
    return None


def fit_to_4_3(img):
    """Center-crop or letterbox-fit an image to 4:3, then resize to 800x600."""
    _ensure_pil()
    img = img.convert("RGB")
    w, h = img.size
    target_ratio = TARGET_W / TARGET_H
    src_ratio = w / h
    if abs(src_ratio - target_ratio) < 1e-3:
        cropped = img
    elif src_ratio > target_ratio:
        # Too wide — crop width
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        cropped = img.crop((left, 0, left + new_w, h))
    else:
        # Too tall — crop height
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        cropped = img.crop((0, top, w, top + new_h))
    return cropped


def save_variants(img, motif, index):
    _ensure_pil()
    motif_dir = os.path.join(BG_DIR, motif)
    os.makedirs(motif_dir, exist_ok=True)

    cropped = fit_to_4_3(img)

    hi = cropped.resize((TARGET_W * 2, TARGET_H * 2), Image.LANCZOS)
    lo = cropped.resize((TARGET_W, TARGET_H), Image.LANCZOS)

    lo_path = os.path.join(motif_dir, f"{motif}_{index}.png")
    hi_path = os.path.join(motif_dir, f"{motif}_{index}@2x.png")
    lo.save(lo_path, "PNG")
    hi.save(hi_path, "PNG")
    return lo_path, hi_path


LAYOUT_TEMPLATE_DIR = os.path.join(
    os.path.dirname(__file__), "..", "tmp", "layout_templates"
)


def layout_template_for(motif):
    """Return path to the composition template for this motif. Auto-renders
    it under tmp/layout_templates/ if missing (the tmp/ tree is gitignored
    so templates aren't committed — they're derived artifacts)."""
    path = os.path.join(LAYOUT_TEMPLATE_DIR, f"{motif}.png")
    if os.path.exists(path):
        return path
    # Auto-generate by shelling to make_layout_template.py so this keeps
    # working on a clean checkout without manual setup.
    script = os.path.join(os.path.dirname(__file__), "make_layout_template.py")
    try:
        subprocess.run(
            [sys.executable, script, motif, path],
            check=True,
            capture_output=True,
            timeout=30,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"  ERROR auto-rendering layout template for {motif}: {e}")
        return None
    return path if os.path.exists(path) else None


def generate_for_motif(motif, variant_count, force):
    if motif not in MOTIF_PROMPTS:
        print(f"Unknown motif: {motif}")
        return 0
    prompts = MOTIF_PROMPTS[motif]
    n = min(variant_count, len(prompts)) if variant_count else len(prompts)
    written = 0
    ref = layout_template_for(motif)
    if ref:
        print(f"  using composition reference {os.path.relpath(ref)}")
    else:
        print(
            f"  ERROR: could not generate composition template for {motif}; "
            f"aborting this motif (layout-aware output requires the template)"
        )
        return 0
    for i in range(1, n + 1):
        out = os.path.join(BG_DIR, motif, f"{motif}_{i}.png")
        if os.path.exists(out) and not force:
            print(f"  skip {motif}_{i}.png (exists)")
            continue
        subject = prompts[i - 1]
        prompt = (
            f"{subject} {STYLE_SUFFIX}\n\n"
            "A reference composition image is attached. Match that layout "
            "exactly: sky in upper portion, distant horizon silhouette, "
            "open foreground in the left and right thirds (no subjects in "
            "those zones), focal subject centered on the horizon where the "
            "reference shows a small dark shape, and the bottom dark band "
            "is throwaway (will be covered by a UI panel in game)."
        )
        print(f"  generating {motif}_{i}.png")
        img = generate_image(prompt, aspect_ratio="4:3", reference_png=ref)
        if img is None:
            print(f"  fallback to 1:1 for {motif}_{i}")
            img = generate_image(prompt, aspect_ratio="1:1", reference_png=ref)
        if img is None:
            print(f"  FAILED: {motif}_{i}")
            continue
        lo_path, hi_path = save_variants(img, motif, i)
        print(f"  wrote {os.path.relpath(lo_path)} ({lo_path and 'ok'})")
        written += 1
    return written


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--motif", choices=list(MOTIF_PROMPTS.keys()),
                        help="Generate only this motif")
    parser.add_argument("--variants", type=int, default=0,
                        help="Cap variants per motif (default: all)")
    parser.add_argument("--force", action="store_true",
                        help="Overwrite existing PNGs")
    args = parser.parse_args()

    if not API_KEY:
        print("ERROR: GEMINI_API_KEY is not set. Populate .envrc.local or export it.")
        sys.exit(2)

    motifs = [args.motif] if args.motif else list(MOTIF_PROMPTS.keys())
    os.makedirs(BG_DIR, exist_ok=True)

    total = 0
    for motif in motifs:
        print(f"motif: {motif}")
        total += generate_for_motif(motif, args.variants, args.force)
    print(f"done. wrote {total} new backgrounds.")


if __name__ == "__main__":
    main()
