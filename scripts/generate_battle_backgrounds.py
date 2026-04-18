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
    "Final Fantasy Pixel Remaster battle background. Richly painted wide-angle "
    "scene, cinematic composition, clear horizon line, mid-ground depth, soft "
    "atmospheric perspective, vivid but not cartoonish colors. No characters, "
    "no UI, no text, no borders. The bottom third of the frame is visually "
    "quieter (ground plane) so combatants can stand in front of it. 4:3 "
    "aspect ratio."
)

# Each motif maps to a list of per-variant subject descriptors. Number of
# entries = variant count. Index + 1 becomes the filename suffix.
MOTIF_PROMPTS = {
    "plains": [
        "Open grassland under a warm afternoon sky, gently rolling green hills, "
        "scattered wildflowers, a single old oak on the ridge.",
        "Wildflower meadow at late spring, waist-high grass in golden light, "
        "butterflies, distant thatched windmill silhouette.",
        "Dry plains at sunset, tall pale grasses, low mesas on the far horizon, "
        "warm ochre and lilac sky.",
    ],
    "forest": [
        "Ancient deciduous forest at golden hour, dappled sunlight through the "
        "canopy, moss-covered roots, ferns, a faint mist between the trees.",
        "Deep pine forest at twilight under a full moon, cool blue and silver "
        "light, bioluminescent mushrooms at the base of the trunks.",
        "Mossy old-growth grove, massive gnarled trunks wrapped in ivy, warm "
        "shafts of light, soft bed of leaves on the forest floor.",
        "Autumn forest at dawn, red and amber leaves on birch and maple, "
        "pale fog low to the ground, soft rose-gold sky.",
    ],
    "dunes": [
        "Rolling desert dunes at high noon, sharp wind-sculpted ridgelines, "
        "pale warm sand, hazy turquoise sky.",
        "Desert oasis at dusk, palm cluster around a small reflective pool, "
        "distant sand sea under a violet-orange sky.",
        "Canyon edge at sunset, layered red and ochre sandstone walls, deep "
        "shadow in the gorge, warm copper light on the rim.",
    ],
    "mountains": [
        "High rocky pass between snow-capped peaks, pale slate cliffs, windswept "
        "pines clinging to the slopes, cold blue sky with thin clouds.",
        "Sheer cliff face under a bright alpine afternoon, granite wall with "
        "mineral streaks, a vast valley opening to the right, wisps of cloud.",
        "Mountain summit at sunrise above the cloud sea, jagged basalt peaks, "
        "warm pink and gold light on the snow, cold blue shadows.",
    ],
    "snow": [
        "Wide snowfield at midday under a pale cold sun, sparse dark evergreens "
        "on the far treeline, soft lavender shadows, crisp blue sky.",
        "Snow-laden pine forest edge at dusk, heavy snow on the boughs, warm "
        "amber light glowing from behind the trees, cool blue shadows on the snow.",
        "Frozen lake shore under overcast sky, cracked ice, distant mountains "
        "across the water, pale greys and frozen blues with a hint of pink.",
    ],
    "marsh": [
        "Swamp at dawn, still dark water between cypress trees draped in moss, "
        "thick low mist, warm amber light filtering through.",
        "Reed marsh at late afternoon, tall golden reeds, a winding channel of "
        "water reflecting the sky, scattered lily pads in the foreground.",
        "Bog at dusk with gnarled dead trees, green-glow firefly spores in the "
        "mist, deep teal water, violet horizon.",
    ],
    "shore": [
        "Sandy beach at golden hour, gentle surf, palm-lined dune in the "
        "background, warm coral and amber sky reflected on wet sand.",
        "Riverbank on a bright summer afternoon, smooth stones and clear water, "
        "willow trees leaning over the river, distant green hills.",
        "Old stone arched bridge over a wide slow river at dusk, weathered stone "
        "piers, reflected lantern glow on the water, lavender sky.",
    ],
    # Interior variants are ordered to match INTERIOR_VARIANT_BY_BUILDING in
    # client/src/scenes/battleBackgrounds.js: 1=temple, 2=inn, 3=shop, 4=house.
    "interior": [
        "Interior of a stone temple nave with tall pillars, warm candle "
        "light on flagstones, stained-glass windows casting colored beams, "
        "distant altar with glowing brazier. Painted, wide-angle, no figures.",
        "Interior of a cozy wooden inn common room, warm firelight from a "
        "stone hearth, long oak tables, hanging lanterns, rafters in shadow, "
        "barrels and crates along the walls. No figures, no text.",
        "Interior of a crowded magic shop, shelves stacked with potion bottles, "
        "herbs, scrolls, and curios, warm oil-lamp light, a worn rug underfoot, "
        "counter in the background. No shopkeeper visible.",
        "Interior of a modest stone-and-timber house, simple wooden table and "
        "chairs, a small hearth with embers, wool rug, window with soft daylight "
        "behind linen curtains. Warm and quiet, no figures.",
    ],
}


def generate_image(prompt, aspect_ratio="4:3"):
    """Call Gemini and return a PIL Image, or None on failure."""
    _ensure_pil()
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
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


def generate_for_motif(motif, variant_count, force):
    if motif not in MOTIF_PROMPTS:
        print(f"Unknown motif: {motif}")
        return 0
    prompts = MOTIF_PROMPTS[motif]
    n = min(variant_count, len(prompts)) if variant_count else len(prompts)
    written = 0
    for i in range(1, n + 1):
        out = os.path.join(BG_DIR, motif, f"{motif}_{i}.png")
        if os.path.exists(out) and not force:
            print(f"  skip {motif}_{i}.png (exists)")
            continue
        subject = prompts[i - 1]
        prompt = f"{subject} {STYLE_SUFFIX}"
        print(f"  generating {motif}_{i}.png")
        img = generate_image(prompt, aspect_ratio="4:3")
        if img is None:
            print(f"  fallback to 1:1 for {motif}_{i}")
            img = generate_image(prompt, aspect_ratio="1:1")
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
