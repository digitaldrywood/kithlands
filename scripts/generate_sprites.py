#!/usr/bin/env python3
"""Generate game sprites via Gemini API and post-process them.

Removes green-screen backgrounds, crops to consistent sizes,
outputs transparent PNGs ready for Phaser.
"""

import json
import base64
import os
import subprocess
import sys

# Use venv PIL
sys.path.insert(0, '/tmp/kith-venv/lib/python3.12/site-packages')
from PIL import Image
import io

API_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = "gemini-2.5-flash-image"
BASE_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
SPRITES_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public", "sprites")

def generate_image(prompt, output_path, size=None):
    """Generate an image via Gemini and save it."""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": "1:1"}
        }
    }

    req_file = f"/tmp/gemini-sprite-req-{os.getpid()}.json"
    resp_file = f"/tmp/gemini-sprite-resp-{os.getpid()}.json"

    with open(req_file, "w") as f:
        json.dump(payload, f)

    result = subprocess.run([
        "curl", "-s", "-o", resp_file, "-w", "%{http_code}",
        "-X", "POST", BASE_URL,
        "-H", "Content-Type: application/json",
        "-d", f"@{req_file}"
    ], capture_output=True, text=True, timeout=120)

    status = result.stdout.strip()
    if status != "200":
        print(f"  ERROR: HTTP {status}")
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
            img = Image.open(io.BytesIO(raw))
            return img

    print("  ERROR: No image in response")
    return None


def remove_green_background(img, threshold=120):
    """Replace green-screen (#00FF00 area) with transparency.

    Uses a ratio-based approach: if green is the dominant channel
    by a significant margin, the pixel is considered background.
    """
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue

            # Ratio-based: green must be dominant by a margin
            is_green = False

            # Pure green screen (#00FF00 area)
            if g > 120 and r < threshold and b < threshold:
                is_green = True
            # Green-dominant with margin (catches fringing)
            elif g > 100 and g > r * 1.4 and g > b * 1.4:
                is_green = True
            # Very bright green tones
            elif g > 180 and (r + b) < g:
                is_green = True

            if is_green:
                pixels[x, y] = (0, 0, 0, 0)

    # Second pass: remove isolated semi-transparent green edge pixels
    pixels = img.load()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            # Check if surrounded by mostly transparent pixels
            transparent_neighbors = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    _, _, _, na = pixels[x + dx, y + dy]
                    if na == 0:
                        transparent_neighbors += 1
            # If mostly surrounded by transparent and has green tint, remove
            if transparent_neighbors >= 5 and g > r and g > b:
                pixels[x, y] = (0, 0, 0, 0)

    return img


def crop_to_content(img, padding=2):
    """Crop to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()
    if bbox:
        # Add padding
        x1, y1, x2, y2 = bbox
        x1 = max(0, x1 - padding)
        y1 = max(0, y1 - padding)
        x2 = min(img.width, x2 + padding)
        y2 = min(img.height, y2 + padding)
        img = img.crop((x1, y1, x2, y2))
    return img


def resize_to_square(img, target_size):
    """Resize image to a square, maintaining aspect ratio, with transparent padding."""
    # Scale to fit
    w, h = img.size
    scale = min(target_size / w, target_size / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    img = img.resize((new_w, new_h), Image.NEAREST)

    # Center on transparent square
    result = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    offset_x = (target_size - new_w) // 2
    offset_y = (target_size - new_h) // 2
    result.paste(img, (offset_x, offset_y))
    return result


def generate_and_process(prompt, output_path, target_size):
    """Generate, remove green, crop, resize, save."""
    print(f"  Generating: {os.path.basename(output_path)}...")
    img = generate_image(prompt, output_path)
    if img is None:
        return False

    img = remove_green_background(img)
    img = crop_to_content(img)
    img = resize_to_square(img, target_size)
    img.save(output_path, "PNG")
    print(f"  Saved: {output_path} ({os.path.getsize(output_path) // 1024} KB, {target_size}x{target_size})")
    return True


def main():
    if not API_KEY:
        print("ERROR: GEMINI_API_KEY not set")
        sys.exit(1)

    os.makedirs(os.path.join(SPRITES_DIR, "monsters"), exist_ok=True)

    style = "Pixel Remaster style, 16-bit JRPG pixel art like Final Fantasy VI or Chrono Trigger. Rich colors, clean pixel edges, no anti-aliasing, no outlines. On a bright green #00FF00 background."

    # Character sprites (front-facing for battle/overworld)
    characters = [
        ("warrior.png", 48,
         f"Front-facing portrait of a JRPG warrior knight character. Silver plate armor, blue cape, short sword held at side. Heroic stance. {style}"),
        ("cinder.png", 48,
         f"Front-facing portrait of a JRPG black mage character. Dark purple robe, tall pointed hat with shadow hiding face except glowing yellow eyes, wooden staff. Mysterious stance. {style}"),
        ("mender.png", 48,
         f"Front-facing portrait of a JRPG white mage healer character. White and blue robes, gentle expression, holding a healing staff with a crystal. {style}"),
        ("rogue.png", 48,
         f"Front-facing portrait of a JRPG thief/rogue character. Dark leather armor, green hooded cloak, holding a dagger, confident smirk. {style}"),
    ]

    # Player overworld sprites (4 directions for walking)
    overworld = [
        ("player_down.png", 32,
         f"Single pixel art sprite of a small JRPG adventurer character facing toward the viewer (front view). Brown hair, blue tunic, simple design. Full body visible, standing pose. {style}"),
        ("player_up.png", 32,
         f"Single pixel art sprite of a small JRPG adventurer character facing away from the viewer (back view). Brown hair, blue tunic, simple design. Full body visible, standing pose. {style}"),
        ("player_left.png", 32,
         f"Single pixel art sprite of a small JRPG adventurer character facing left (side view, walking left). Brown hair, blue tunic, simple design. Full body visible. {style}"),
        ("player_right.png", 32,
         f"Single pixel art sprite of a small JRPG adventurer character facing right (side view, walking right). Brown hair, blue tunic, simple design. Full body visible. {style}"),
    ]

    # Monster sprites
    monsters = [
        ("monsters/slime.png", 64,
         f"A cute blue translucent slime monster from a JRPG. Round blob shape, two dot eyes, small smile. Slightly bouncing pose. {style}"),
        ("monsters/goblin.png", 64,
         f"A small green-skinned goblin enemy from a JRPG. Pointy ears, red eyes, leather vest, holding a rusty dagger. Aggressive stance. {style}"),
        ("monsters/wolf.png", 64,
         f"A fierce grey wolf enemy from a JRPG. Snarling, fangs bared, crouched to pounce. Dark fur with lighter belly. {style}"),
        ("monsters/skeleton.png", 64,
         f"A skeleton warrior enemy from a JRPG. Bone white, glowing blue eyes in empty sockets, holding a rusted sword, tattered armor scraps. {style}"),
        ("monsters/dark_knight.png", 96,
         f"A dark knight boss enemy from a JRPG. Imposing black full plate armor with purple trim, large dark sword, glowing red eyes behind visor, dark aura. Larger and more detailed than regular enemies. {style}"),
    ]

    all_sprites = characters + overworld + monsters

    print(f"Generating {len(all_sprites)} sprites...\n")

    success = 0
    for filename, size, prompt in all_sprites:
        path = os.path.join(SPRITES_DIR, filename)
        if generate_and_process(prompt, path, size):
            success += 1

    print(f"\nDone: {success}/{len(all_sprites)} sprites generated.")


if __name__ == "__main__":
    main()
