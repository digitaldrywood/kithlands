#!/usr/bin/env python3
"""Generate all game pixel art assets via Gemini API and post-process them.

Removes green-screen backgrounds, crops to consistent sizes,
outputs transparent PNGs ready for Phaser.

Usage:
    GEMINI_API_KEY=... python3 scripts/generate_sprites.py [--category CATEGORY]

Categories: all, classes, walk, monsters, npcs, tilesets, interiors, ui
Default: all
"""

import json
import base64
import os
import subprocess
import sys
import argparse

# Defer PIL import so --dry-run works without Pillow installed
Image = None
io_module = None


def _ensure_pil():
    """Import PIL lazily; exit with a clear message if unavailable."""
    global Image, io_module
    if Image is not None:
        return
    try:
        from PIL import Image as _Img
        import io as _io
        Image = _Img
        io_module = _io
    except ImportError:
        sys.path.insert(0, '/tmp/kith-venv/lib/python3.12/site-packages')
        try:
            from PIL import Image as _Img
            import io as _io
            Image = _Img
            io_module = _io
        except ImportError:
            print("ERROR: Pillow not installed. Run: pip install Pillow")
            sys.exit(1)

def _load_api_key():
    """Load API key from environment or project .env file."""
    key = os.environ.get("GEMINI_API_KEY", "")
    if key:
        return key
    # Fallback: read from project .env file
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


API_KEY = _load_api_key()
MODEL = "gemini-2.5-flash-image"
BASE_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={API_KEY}"
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public")
SPRITES_DIR = os.path.join(PUBLIC_DIR, "sprites")
TILESETS_DIR = os.path.join(PUBLIC_DIR, "tilesets")

STYLE = (
    "Final Fantasy Pixel Remaster style. High-definition detailed pixel art "
    "with fine shading, rich color gradients, and smooth anti-aliased edges. "
    "Modern HD quality suitable for high-resolution displays. Detailed and "
    "refined, not chunky or retro. On a solid bright magenta #FF00FF background."
)

TILE_STYLE = (
    "Final Fantasy Pixel Remaster style tileset tile. High-definition detailed "
    "pixel art, seamless tileable texture, top-down perspective. Fine shading, "
    "rich color gradients. Modern HD quality, not chunky or retro."
)

# ---------------------------------------------------------------------------
# Asset manifest
# ---------------------------------------------------------------------------

CLASS_SPRITES = [
    # (filename, size, description)
    # Base classes
    ("warrior.png", 192,
     f"Front-facing portrait of a JRPG warrior knight character. Silver plate armor, blue cape, short sword held at side. Heroic stance. {STYLE}"),
    ("brawler.png", 192,
     f"Front-facing portrait of a JRPG brawler monk character. Muscular build, wrapped fists, orange gi, no weapons, martial arts stance. {STYLE}"),
    ("rogue.png", 192,
     f"Front-facing portrait of a JRPG thief/rogue character. Dark leather armor, green hooded cloak, holding a dagger, confident smirk. {STYLE}"),
    ("mender.png", 192,
     f"Front-facing portrait of a JRPG white mage healer character. White and blue robes, gentle expression, holding a healing staff with a crystal. {STYLE}"),
    ("cinder.png", 192,
     f"Front-facing portrait of a JRPG black mage character. Dark purple robe, tall pointed hat with shadow hiding face except glowing yellow eyes, wooden staff. Mysterious stance. {STYLE}"),
    ("wayfarer.png", 192,
     f"Front-facing portrait of a JRPG wandering adventurer character. Travel-worn brown cloak, wide-brim hat, carrying a walking staff and satchel. Friendly expression. {STYLE}"),
    # Promoted classes
    ("knight.png", 192,
     f"Front-facing portrait of a JRPG holy knight character. Gleaming gold-trimmed plate armor, white cape, longsword with glowing blade, noble stance. More ornate than base warrior. {STYLE}"),
    ("champion.png", 192,
     f"Front-facing portrait of a JRPG champion martial artist character. Powerful build, glowing fists with chi energy, red headband, scarred arms, battle-hardened stance. {STYLE}"),
    ("shadow.png", 192,
     f"Front-facing portrait of a JRPG shadow assassin character. Black form-fitting armor, dark purple cloak with shadow wisps, twin daggers, glowing violet eyes. {STYLE}"),
    ("sage.png", 192,
     f"Front-facing portrait of a JRPG sage character. Ornate white and gold robes, glowing staff, halo of light, serene wise expression. More powerful than base mender. {STYLE}"),
    ("pyromancer.png", 192,
     f"Front-facing portrait of a JRPG pyromancer character. Crimson and black robes with flame motifs, staff topped with fire crystal, eyes glowing orange, arcane fire swirling. {STYLE}"),
    ("wanderer.png", 192,
     f"Front-facing portrait of a JRPG wanderer character. Weathered adventurer gear, enchanted dual-colored cloak (half white half black), sword in one hand staff in other, experienced look. {STYLE}"),
]

WALK_SPRITES = [
    # (filename, size, description) -- individual directional sprites
    ("player_down.png", 128,
     f"Single pixel art sprite of a small JRPG adventurer character facing toward the viewer (front view). Brown hair, blue tunic, simple design. Full body visible, standing pose. {STYLE}"),
    ("player_up.png", 128,
     f"Single pixel art sprite of a small JRPG adventurer character facing away from the viewer (back view). Brown hair, blue tunic, simple design. Full body visible, standing pose. {STYLE}"),
    ("player_left.png", 128,
     f"Single pixel art sprite of a small JRPG adventurer character facing left (side view, walking left). Brown hair, blue tunic, simple design. Full body visible. {STYLE}"),
    ("player_right.png", 128,
     f"Single pixel art sprite of a small JRPG adventurer character facing right (side view, walking right). Brown hair, blue tunic, simple design. Full body visible. {STYLE}"),
]

# Walk cycle animation frames (4 directions x 4 frames)
WALK_ANIMATION_FRAMES = []
for direction in ["down", "up", "left", "right"]:
    facing = {
        "down": "toward the viewer (front view)",
        "up": "away from the viewer (back view)",
        "left": "left (side view)",
        "right": "right (side view)",
    }[direction]
    for frame in range(4):
        step = ["standing still feet together",
                "stepping with left foot forward",
                "standing still feet together",
                "stepping with right foot forward"][frame]
        WALK_ANIMATION_FRAMES.append((
            f"walk/walk_{direction}_{frame}.png", 128,
            f"Single pixel art sprite of a small JRPG adventurer character "
            f"facing {facing}, {step}. Brown hair, blue tunic. Walk cycle "
            f"frame {frame + 1} of 4. Full body visible. {STYLE}"
        ))

MONSTER_SPRITES = [
    # Existing (regenerated for consistency)
    ("monsters/slime.png", 256,
     f"A cute blue translucent slime monster from a JRPG. Round blob shape, two dot eyes, small smile. Slightly bouncing pose. {STYLE}"),
    ("monsters/goblin.png", 256,
     f"A small green-skinned goblin enemy from a JRPG. Pointy ears, red eyes, leather vest, holding a rusty dagger. Aggressive stance. {STYLE}"),
    ("monsters/wolf.png", 256,
     f"A fierce grey wolf enemy from a JRPG. Snarling, fangs bared, crouched to pounce. Dark fur with lighter belly. {STYLE}"),
    ("monsters/skeleton.png", 256,
     f"A skeleton warrior enemy from a JRPG. Bone white, glowing blue eyes in empty sockets, holding a rusted sword, tattered armor scraps. {STYLE}"),
    ("monsters/dark_knight.png", 384,
     f"A dark knight boss enemy from a JRPG. Imposing black full plate armor with purple trim, large dark sword, glowing red eyes behind visor, dark aura. Larger and more detailed than regular enemies. {STYLE}"),
    # New Tier 1
    ("monsters/bat.png", 256,
     f"A dark purple vampire bat monster from a JRPG. Wings spread wide, red glowing eyes, fangs visible, swooping attack pose. {STYLE}"),
    ("monsters/rat.png", 256,
     f"A large brown dire rat monster from a JRPG. Matted fur, red beady eyes, long pink tail, sharp teeth bared, aggressive hunch. {STYLE}"),
    ("monsters/snake.png", 256,
     f"A green venomous serpent monster from a JRPG. Coiled body, hood flared like a cobra, forked tongue out, poison dripping from fangs. {STYLE}"),
    ("monsters/spider.png", 256,
     f"A large black cave spider monster from a JRPG. Eight legs spread wide, multiple red eyes, dripping web silk, menacing pose. {STYLE}"),
    # New Tier 2
    ("monsters/orc.png", 256,
     f"A muscular green orc warrior enemy from a JRPG. Heavy build, tusks, leather armor, wielding a crude battle axe, war paint on face. {STYLE}"),
    ("monsters/ghost.png", 256,
     f"A floating translucent ghost enemy from a JRPG. Pale blue-white wispy form, hollow dark eyes, reaching spectral hands, trailing ectoplasm. {STYLE}"),
    ("monsters/bandit.png", 256,
     f"A human bandit enemy from a JRPG. Scruffy appearance, eye patch, leather vest, wielding a short sword, menacing grin. {STYLE}"),
    ("monsters/troll.png", 256,
     f"A large green troll monster from a JRPG. Hulking build, warty skin, small eyes, carrying a wooden club, hunched posture. {STYLE}"),
    # New Tier 3
    ("monsters/wyvern.png", 256,
     f"A blue-green wyvern dragon monster from a JRPG. Bat-like wings, long serpentine neck, sharp talons, breathing frost mist. {STYLE}"),
    ("monsters/lich.png", 256,
     f"An undead lich sorcerer enemy from a JRPG. Skeletal figure in tattered dark robes, glowing green eyes, holding a necromantic staff, dark magic aura. {STYLE}"),
    ("monsters/golem.png", 256,
     f"A stone golem construct enemy from a JRPG. Massive rocky body, glowing rune marks on chest, heavy stone fists, craggy angular form. {STYLE}"),
    ("monsters/demon.png", 256,
     f"A red-skinned demon enemy from a JRPG. Horns, bat wings, clawed hands, forked tail, wreathed in dark fire, sinister grin. {STYLE}"),
    # New Boss
    ("monsters/dragon.png", 384,
     f"An ancient red dragon boss from a JRPG. Massive and imposing, great wings spread, breathing fire, golden eyes, armored scales, crown of horns. Larger and more detailed than regular enemies. {STYLE}"),
]

NPC_SPRITES = [
    ("npcs/elder.png", 128,
     f"A small JRPG village elder NPC. White beard, brown robes, wooden walking cane, wise expression. Top-down overworld scale. Full body visible. {STYLE}"),
    ("npcs/merchant.png", 128,
     f"A small JRPG traveling merchant NPC. Round figure, colorful vest, large backpack of wares, friendly smile. Top-down overworld scale. Full body visible. {STYLE}"),
    ("npcs/blacksmith.png", 128,
     f"A small JRPG blacksmith NPC. Muscular arms, leather apron, holding a hammer, soot-marked face. Top-down overworld scale. Full body visible. {STYLE}"),
    ("npcs/innkeeper.png", 128,
     f"A small JRPG innkeeper NPC. Plump and welcoming, white apron, holding a mug, warm smile. Top-down overworld scale. Full body visible. {STYLE}"),
    ("npcs/priestess.png", 128,
     f"A small JRPG temple priestess NPC. White robes with gold trim, prayer beads, serene expression. Top-down overworld scale. Full body visible. {STYLE}"),
    ("npcs/guard.png", 128,
     f"A small JRPG town guard NPC. Chain mail armor, spear, helmet, alert stance. Top-down overworld scale. Full body visible. {STYLE}"),
]

OVERWORLD_TILESETS = [
    # (filename, description)
    ("grass.png", f"Lush green grass terrain ground. {TILE_STYLE}"),
    ("path.png", f"Tan brown dirt walking path trail. {TILE_STYLE}"),
    ("water.png", f"Blue water surface with gentle ripples. {TILE_STYLE}"),
    ("tree.png", f"Dark green tree canopy top-down view, dense foliage. {TILE_STYLE}"),
    ("building.png", f"Brown stone brick building wall exterior, medieval. {TILE_STYLE}"),
    ("door.png", f"Yellow-brown wooden door entrance panel. {TILE_STYLE}"),
    ("floor.png", f"Light brown wooden floor planks, building interior. {TILE_STYLE}"),
    ("rock.png", f"Grey stone rocky terrain, rough boulders. {TILE_STYLE}"),
    ("bush.png", f"Light green leafy bush shrub, low hedge vegetation. {TILE_STYLE}"),
    ("dark_grass.png", f"Dark green tall thick grass, shadowy wilderness. {TILE_STYLE}"),
    ("forest.png", f"Very dark green dense old-growth forest canopy. {TILE_STYLE}"),
    ("hill.png", f"Brown and tan elevated hillside rolling terrain. {TILE_STYLE}"),
    ("sand.png", f"Golden yellow sandy beach desert coastal ground. {TILE_STYLE}"),
]

INTERIOR_TILESETS = [
    ("interiors/shop_floor.png", f"Polished wooden shop floor with occasional rug pattern. {TILE_STYLE}"),
    ("interiors/inn_floor.png", f"Warm reddish-brown tavern inn wooden floor planks. {TILE_STYLE}"),
    ("interiors/temple_floor.png", f"White and blue marble temple floor with mosaic pattern. {TILE_STYLE}"),
    ("interiors/wooden_wall.png", f"Vertical wooden plank wall panels, interior wall. {TILE_STYLE}"),
    ("interiors/stone_wall.png", f"Grey cobblestone interior wall, castle or temple. {TILE_STYLE}"),
    ("interiors/counter.png", f"Wooden shop counter top surface, merchant desk. {TILE_STYLE}"),
    ("interiors/bookshelf.png", f"Wooden bookshelf filled with colorful book spines. {TILE_STYLE}"),
    ("interiors/bed.png", f"Small wooden bed with white sheets and pillow, top-down. {TILE_STYLE}"),
    ("interiors/altar.png", f"Stone temple altar with glowing rune markings. {TILE_STYLE}"),
]

UI_ICONS = [
    # (filename, size, description)
    ("ui/icon_sword.png", 64,
     f"Sword weapon icon for a JRPG menu. Silver blade, brown hilt. Clean and detailed. {STYLE}"),
    ("ui/icon_shield.png", 64,
     f"Shield defense icon for a JRPG menu. Blue and silver kite shield. Clean and detailed. {STYLE}"),
    ("ui/icon_potion.png", 64,
     f"Red health potion bottle icon for a JRPG menu. Round glass bottle, red liquid. Clean and detailed. {STYLE}"),
    ("ui/icon_spell.png", 64,
     f"Magic spell icon for a JRPG menu. Glowing blue magic orb with sparkles. Clean and detailed. {STYLE}"),
    ("ui/icon_gold.png", 64,
     f"Gold coin icon for a JRPG menu. Shiny yellow gold coin with G marking. Clean and detailed. {STYLE}"),
    ("ui/icon_xp.png", 64,
     f"Experience star icon for a JRPG menu. Glowing green star. Clean and detailed. {STYLE}"),
    ("ui/icon_poison.png", 64,
     f"Poison status icon. Purple skull with green drip. Clean and detailed. {STYLE}"),
    ("ui/icon_sleep.png", 64,
     f"Sleep status icon. Blue ZZZ letters. Clean and detailed. {STYLE}"),
    ("ui/icon_mute.png", 64,
     f"Mute/silence status icon. Red X over a mouth. Clean and detailed. {STYLE}"),
    ("ui/icon_slow.png", 64,
     f"Slow status icon. Orange snail shape. Clean and detailed. {STYLE}"),
    ("ui/icon_paralyze.png", 64,
     f"Paralyze status icon. Yellow lightning bolt. Clean and detailed. {STYLE}"),
]

UI_ELEMENTS = [
    # Menu border pieces
    ("ui/border_tl.png", 64,
     f"JRPG menu border top-left corner piece. Dark blue with gold trim, ornate corner. {STYLE}"),
    ("ui/border_t.png", 64,
     f"JRPG menu border top edge piece. Dark blue with gold trim line, horizontally tileable. {STYLE}"),
    ("ui/border_tr.png", 64,
     f"JRPG menu border top-right corner piece. Dark blue with gold trim, ornate corner. {STYLE}"),
    ("ui/border_l.png", 64,
     f"JRPG menu border left edge piece. Dark blue with gold trim line, vertically tileable. {STYLE}"),
    ("ui/border_r.png", 64,
     f"JRPG menu border right edge piece. Dark blue with gold trim line, vertically tileable. {STYLE}"),
    ("ui/border_bl.png", 64,
     f"JRPG menu border bottom-left corner piece. Dark blue with gold trim, ornate corner. {STYLE}"),
    ("ui/border_b.png", 64,
     f"JRPG menu border bottom edge piece. Dark blue with gold trim line, horizontally tileable. {STYLE}"),
    ("ui/border_br.png", 64,
     f"JRPG menu border bottom-right corner piece. Dark blue with gold trim, ornate corner. {STYLE}"),
    ("ui/border_fill.png", 64,
     f"JRPG menu background fill. Solid dark blue, slight gradient. {STYLE}"),
    # HP bar pieces
    ("ui/hp_bar_frame.png", 192,
     f"JRPG HP bar frame/outline. Horizontal bar shape, dark metallic border, empty center. {STYLE}"),
    ("ui/hp_bar_fill.png", 192,
     f"JRPG HP bar fill gradient. Horizontal green to yellow health bar fill. {STYLE}"),
    ("ui/hp_bar_empty.png", 192,
     f"JRPG HP bar empty fill. Horizontal dark red empty health bar. {STYLE}"),
]


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

def generate_image(prompt):
    """Generate an image via Gemini and return a PIL Image."""
    _ensure_pil()
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
            img = Image.open(io_module.BytesIO(raw))
            return img

    print("  ERROR: No image in response")
    return None


def remove_background(img, threshold=120):
    """Replace magenta-screen (#FF00FF area) with transparency."""
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size

    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            is_magenta = False
            # Pure magenta: high red + high blue, low green
            if r > 120 and b > 120 and g < threshold:
                is_magenta = True
            # Dominant magenta: R and B both significantly outweigh G
            elif r > 100 and b > 100 and r > g * 1.4 and b > g * 1.4:
                is_magenta = True
            # Very saturated magenta
            elif (r + b) > 360 and g < 100:
                is_magenta = True
            if is_magenta:
                pixels[x, y] = (0, 0, 0, 0)

    # Second pass: remove isolated semi-transparent magenta edge pixels
    pixels = img.load()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            transparent_neighbors = 0
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    _, _, _, na = pixels[x + dx, y + dy]
                    if na == 0:
                        transparent_neighbors += 1
            if transparent_neighbors >= 5 and r > g and b > g:
                pixels[x, y] = (0, 0, 0, 0)

    return img


def crop_to_content(img, padding=2):
    """Crop to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()
    if bbox:
        x1, y1, x2, y2 = bbox
        x1 = max(0, x1 - padding)
        y1 = max(0, y1 - padding)
        x2 = min(img.width, x2 + padding)
        y2 = min(img.height, y2 + padding)
        img = img.crop((x1, y1, x2, y2))
    return img


def resize_to_square(img, target_size):
    """Resize image to a square, maintaining aspect ratio, with transparent padding."""
    w, h = img.size
    scale = min(target_size / w, target_size / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    img = img.resize((new_w, new_h), Image.LANCZOS)

    result = Image.new("RGBA", (target_size, target_size), (0, 0, 0, 0))
    offset_x = (target_size - new_w) // 2
    offset_y = (target_size - new_h) // 2
    result.paste(img, (offset_x, offset_y))
    return result


def cleanup_edge_artifacts(img):
    """Drop semi-transparent edge pixels that only contain chromakey bleed colors.

    After LANCZOS resize, edge pixels can blend content with any residual
    chromakey color. Force semi-transparent edge pixels to fully transparent
    when they sit on the alpha boundary and are dominated by the chromakey hue.
    """
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if a == 0 or a >= 250:
                continue
            # Semi-transparent pixel adjacent to transparent area
            has_transparent_neighbor = False
            if y > 0 and pixels[x, y - 1][3] == 0: has_transparent_neighbor = True
            elif y < h - 1 and pixels[x, y + 1][3] == 0: has_transparent_neighbor = True
            elif x > 0 and pixels[x - 1, y][3] == 0: has_transparent_neighbor = True
            elif x < w - 1 and pixels[x + 1, y][3] == 0: has_transparent_neighbor = True
            if not has_transparent_neighbor:
                continue
            # Drop if magenta-leaning (pink/purple edge bleed)
            if r > 120 and b > 120 and g < 120:
                pixels[x, y] = (0, 0, 0, 0)
            # Drop if pure green bleed (#00FF00 chromakey leftover)
            elif g > 150 and r < 100 and b < 100:
                pixels[x, y] = (0, 0, 0, 0)
    return img


def generate_and_process(prompt, output_path, target_size, is_tile=False):
    """Generate, remove green, crop, resize, save."""
    print(f"  Generating: {os.path.basename(output_path)}...")
    img = generate_image(prompt)
    if img is None:
        return False

    if not is_tile:
        img = remove_background(img)
        img = crop_to_content(img)
    img = resize_to_square(img, target_size)
    img.save(output_path, "PNG")
    size_kb = os.path.getsize(output_path) // 1024
    print(f"  Saved: {output_path} ({size_kb} KB, {target_size}x{target_size})")
    return True


# ---------------------------------------------------------------------------
# Generation functions by category
# ---------------------------------------------------------------------------

def generate_classes():
    """Generate all 12 class battle portraits (6 base + 6 promoted)."""
    print("\n=== Class Battle Portraits (12) ===\n")
    success = 0
    for filename, size, prompt in CLASS_SPRITES:
        path = os.path.join(SPRITES_DIR, filename)
        if generate_and_process(prompt, path, size):
            success += 1
    print(f"  Classes: {success}/{len(CLASS_SPRITES)}")
    return success


def generate_walk():
    """Generate player directional sprites and walk cycle frames."""
    print("\n=== Player Walk Sprites ===\n")
    os.makedirs(os.path.join(SPRITES_DIR, "walk"), exist_ok=True)
    success = 0

    # Static directional sprites (overwrite existing)
    for filename, size, prompt in WALK_SPRITES:
        path = os.path.join(SPRITES_DIR, filename)
        if generate_and_process(prompt, path, size):
            success += 1

    # Walk cycle animation frames
    for filename, size, prompt in WALK_ANIMATION_FRAMES:
        path = os.path.join(SPRITES_DIR, filename)
        if generate_and_process(prompt, path, size):
            success += 1

    total = len(WALK_SPRITES) + len(WALK_ANIMATION_FRAMES)
    print(f"  Walk: {success}/{total}")
    return success


def generate_monsters():
    """Generate all 18 monster sprites (5 existing + 13 new)."""
    print("\n=== Monster Sprites (18) ===\n")
    os.makedirs(os.path.join(SPRITES_DIR, "monsters"), exist_ok=True)
    success = 0
    for filename, size, prompt in MONSTER_SPRITES:
        path = os.path.join(SPRITES_DIR, filename)
        if generate_and_process(prompt, path, size):
            success += 1
    print(f"  Monsters: {success}/{len(MONSTER_SPRITES)}")
    return success


def generate_npcs():
    """Generate 6 NPC quest-giver sprites."""
    print("\n=== NPC Sprites (6) ===\n")
    os.makedirs(os.path.join(SPRITES_DIR, "npcs"), exist_ok=True)
    success = 0
    for filename, size, prompt in NPC_SPRITES:
        path = os.path.join(SPRITES_DIR, filename)
        if generate_and_process(prompt, path, size):
            success += 1
    print(f"  NPCs: {success}/{len(NPC_SPRITES)}")
    return success


def generate_tilesets():
    """Generate 13 overworld terrain tilesets."""
    print("\n=== Overworld Tilesets (13) ===\n")
    success = 0
    for filename, prompt in OVERWORLD_TILESETS:
        path = os.path.join(TILESETS_DIR, filename)
        if generate_and_process(prompt, path, 16, is_tile=True):
            success += 1
    print(f"  Tilesets: {success}/{len(OVERWORLD_TILESETS)}")
    return success


def generate_interiors():
    """Generate 9 interior tilesets."""
    print("\n=== Interior Tilesets (9) ===\n")
    os.makedirs(os.path.join(TILESETS_DIR, "interiors"), exist_ok=True)
    success = 0
    for filename, prompt in INTERIOR_TILESETS:
        path = os.path.join(TILESETS_DIR, filename)
        if generate_and_process(prompt, path, 16, is_tile=True):
            success += 1
    print(f"  Interiors: {success}/{len(INTERIOR_TILESETS)}")
    return success


def generate_ui():
    """Generate UI icons, menu borders, and HP bar elements."""
    print("\n=== UI Elements ===\n")
    os.makedirs(os.path.join(SPRITES_DIR, "ui"), exist_ok=True)
    success = 0

    all_ui = UI_ICONS + UI_ELEMENTS
    for filename, size, prompt in all_ui:
        path = os.path.join(SPRITES_DIR, filename)
        if generate_and_process(prompt, path, size):
            success += 1

    print(f"  UI: {success}/{len(all_ui)}")
    return success


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

CATEGORIES = {
    "classes": generate_classes,
    "walk": generate_walk,
    "monsters": generate_monsters,
    "npcs": generate_npcs,
    "tilesets": generate_tilesets,
    "interiors": generate_interiors,
    "ui": generate_ui,
}


def main():
    parser = argparse.ArgumentParser(description="Generate Kithlands pixel art assets")
    parser.add_argument(
        "--category", "-c",
        choices=list(CATEGORIES.keys()) + ["all"],
        default="all",
        help="Which category to generate (default: all)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List assets that would be generated without calling the API",
    )
    args = parser.parse_args()

    if args.dry_run:
        print("=== Asset Manifest (dry run) ===\n")
        manifests = [
            ("Class Portraits", [(f, s) for f, s, _ in CLASS_SPRITES]),
            ("Walk Sprites", [(f, s) for f, s, _ in WALK_SPRITES]),
            ("Walk Frames", [(f, s) for f, s, _ in WALK_ANIMATION_FRAMES]),
            ("Monsters", [(f, s) for f, s, _ in MONSTER_SPRITES]),
            ("NPCs", [(f, s) for f, s, _ in NPC_SPRITES]),
            ("Overworld Tiles", [(f, 16) for f, _ in OVERWORLD_TILESETS]),
            ("Interior Tiles", [(f, 16) for f, _ in INTERIOR_TILESETS]),
            ("UI Icons", [(f, s) for f, s, _ in UI_ICONS]),
            ("UI Elements", [(f, s) for f, s, _ in UI_ELEMENTS]),
        ]
        total = 0
        for name, items in manifests:
            print(f"{name} ({len(items)}):")
            for filename, size in items:
                print(f"  {size:3d}x{size:<3d}  {filename}")
            total += len(items)
            print()
        print(f"Total: {total} assets")
        return

    if not API_KEY:
        print("ERROR: GEMINI_API_KEY not set")
        sys.exit(1)

    # Ensure output directories exist
    os.makedirs(os.path.join(SPRITES_DIR, "monsters"), exist_ok=True)
    os.makedirs(os.path.join(SPRITES_DIR, "walk"), exist_ok=True)
    os.makedirs(os.path.join(SPRITES_DIR, "npcs"), exist_ok=True)
    os.makedirs(os.path.join(SPRITES_DIR, "ui"), exist_ok=True)
    os.makedirs(os.path.join(TILESETS_DIR, "interiors"), exist_ok=True)

    if args.category == "all":
        cats = list(CATEGORIES.keys())
    else:
        cats = [args.category]

    total_success = 0
    for cat in cats:
        total_success += CATEGORIES[cat]()

    total_assets = (
        len(CLASS_SPRITES) + len(WALK_SPRITES) + len(WALK_ANIMATION_FRAMES)
        + len(MONSTER_SPRITES) + len(NPC_SPRITES)
        + len(OVERWORLD_TILESETS) + len(INTERIOR_TILESETS)
        + len(UI_ICONS) + len(UI_ELEMENTS)
    )

    if args.category == "all":
        print(f"\nDone: {total_success}/{total_assets} assets generated.")
    else:
        print(f"\nDone: {total_success} assets generated for '{args.category}'.")


if __name__ == "__main__":
    main()
