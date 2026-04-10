#!/usr/bin/env python3
"""Generate placeholder pixel art assets for Kithlands.

Creates colored, identifiable placeholder sprites at correct sizes so the game
can load them immediately. Replace with AI-generated art by running
generate_sprites.py with GEMINI_API_KEY set.

Usage:
    python3 scripts/generate_placeholders.py
"""

import os
import sys
import hashlib

sys.path.insert(0, '/tmp/kith-venv/lib/python3.12/site-packages')
from PIL import Image, ImageDraw

PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "public")
SPRITES_DIR = os.path.join(PUBLIC_DIR, "sprites")
TILESETS_DIR = os.path.join(PUBLIC_DIR, "tilesets")

# ---------------------------------------------------------------------------
# Color palettes (SNES-inspired)
# ---------------------------------------------------------------------------

# Class colors (base, promoted)
CLASS_COLORS = {
    "warrior":    ((100, 120, 180), (160, 160, 160)),  # blue armor -> silver
    "knight":     ((200, 180, 80), (255, 215, 0)),     # gold
    "brawler":    ((200, 120, 50), (180, 80, 30)),     # orange gi
    "champion":   ((200, 50, 50), (255, 80, 80)),      # red energy
    "rogue":      ((60, 120, 60), (40, 80, 40)),       # green cloak
    "shadow":     ((80, 40, 120), (60, 20, 100)),      # purple
    "mender":     ((200, 200, 240), (180, 180, 220)),  # white-blue
    "sage":       ((240, 220, 160), (255, 240, 200)),  # white-gold
    "cinder":     ((80, 40, 120), (60, 20, 80)),       # dark purple
    "pyromancer": ((200, 60, 40), (240, 80, 20)),      # crimson
    "wayfarer":   ((140, 110, 70), (120, 90, 50)),     # brown
    "wanderer":   ((120, 120, 140), (100, 100, 120)),  # grey-blue
}

MONSTER_COLORS = {
    "slime":       (80, 140, 220),    # blue
    "goblin":      (80, 160, 60),     # green
    "wolf":        (120, 120, 130),   # grey
    "skeleton":    (220, 210, 190),   # bone
    "dark_knight": (60, 30, 80),      # dark purple
    "bat":         (100, 50, 120),    # purple
    "rat":         (140, 100, 60),    # brown
    "snake":       (60, 140, 60),     # green
    "spider":      (40, 40, 50),      # dark
    "orc":         (60, 120, 40),     # green
    "ghost":       (180, 200, 220),   # pale blue
    "bandit":      (120, 80, 50),     # brown
    "troll":       (80, 140, 60),     # green
    "wyvern":      (60, 140, 160),    # teal
    "lich":        (40, 60, 40),      # dark green
    "golem":       (140, 130, 120),   # stone
    "demon":       (180, 40, 30),     # red
    "dragon":      (200, 50, 30),     # red
}

NPC_COLORS = {
    "elder":      (140, 110, 80),   # brown robe
    "merchant":   (180, 140, 60),   # gold vest
    "blacksmith": (80, 80, 90),     # dark grey
    "innkeeper":  (180, 120, 80),   # warm brown
    "priestess":  (220, 220, 240),  # white
    "guard":      (120, 130, 150),  # steel
}

TILE_COLORS = {
    "grass":      (76, 175, 80),    # matches 0x4CAF50
    "path":       (210, 180, 140),  # matches 0xD2B48C
    "water":      (33, 150, 243),   # matches 0x2196F3
    "tree":       (46, 125, 50),    # matches 0x2E7D32
    "building":   (121, 85, 72),    # matches 0x795548
    "door":       (255, 193, 7),    # matches 0xFFC107
    "floor":      (188, 170, 164),  # matches 0xBCAAA4
    "rock":       (158, 158, 158),  # matches 0x9E9E9E
    "bush":       (102, 187, 106),  # matches 0x66BB6A
    "dark_grass": (56, 142, 60),    # matches 0x388E3C
    "forest":     (27, 94, 32),     # matches 0x1B5E20
    "hill":       (141, 110, 99),   # matches 0x8D6E63
    "sand":       (255, 224, 130),  # matches 0xFFE082
}

INTERIOR_COLORS = {
    "shop_floor":   (160, 120, 80),
    "inn_floor":    (140, 90, 60),
    "temple_floor": (200, 210, 230),
    "wooden_wall":  (120, 80, 50),
    "stone_wall":   (130, 130, 140),
    "counter":      (150, 110, 70),
    "bookshelf":    (100, 70, 40),
    "bed":          (180, 160, 140),
    "altar":        (160, 160, 180),
}


def _seed_color(name, base_color, variation=30):
    """Deterministic color variation from a name seed."""
    h = int(hashlib.md5(name.encode()).hexdigest()[:6], 16)
    r = max(0, min(255, base_color[0] + (h % variation) - variation // 2))
    g = max(0, min(255, base_color[1] + ((h >> 8) % variation) - variation // 2))
    b = max(0, min(255, base_color[2] + ((h >> 16) % variation) - variation // 2))
    return (r, g, b)


# ---------------------------------------------------------------------------
# Drawing helpers
# ---------------------------------------------------------------------------

def draw_character(img, color, size, is_promoted=False):
    """Draw a simple character silhouette."""
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # Body (rectangle)
    bw = size // 3
    bh = size // 2
    draw.rectangle([cx - bw//2, cy - bh//4, cx + bw//2, cy + bh//2],
                   fill=color)
    # Head (circle)
    hr = size // 6
    draw.ellipse([cx - hr, cy - bh//4 - hr*2, cx + hr, cy - bh//4],
                 fill=_lighter(color, 40))
    # Feet
    fw = size // 8
    draw.rectangle([cx - bw//2, cy + bh//2, cx - bw//2 + fw, cy + bh//2 + fw],
                   fill=_darker(color, 40))
    draw.rectangle([cx + bw//2 - fw, cy + bh//2, cx + bw//2, cy + bh//2 + fw],
                   fill=_darker(color, 40))
    if is_promoted:
        # Crown/halo indicator
        draw.ellipse([cx - hr - 2, cy - bh//4 - hr*2 - 4, cx + hr + 2, cy - bh//4 - hr*2 + 2],
                     fill=(255, 215, 0, 180))


def draw_monster(img, color, size, is_boss=False):
    """Draw a simple monster blob/shape."""
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    r = size // 3

    # Body blob
    draw.ellipse([cx - r, cy - r + r//4, cx + r, cy + r], fill=color)

    # Eyes
    er = max(2, size // 16)
    draw.ellipse([cx - r//2 - er, cy - er, cx - r//2 + er, cy + er],
                 fill=(255, 255, 255))
    draw.ellipse([cx + r//2 - er, cy - er, cx + r//2 + er, cy + er],
                 fill=(255, 255, 255))
    # Pupils
    pr = max(1, er // 2)
    draw.ellipse([cx - r//2 - pr, cy - pr, cx - r//2 + pr, cy + pr],
                 fill=(20, 20, 20))
    draw.ellipse([cx + r//2 - pr, cy - pr, cx + r//2 + pr, cy + pr],
                 fill=(20, 20, 20))

    if is_boss:
        # Horns
        hw = size // 8
        draw.polygon([(cx - r//2, cy - r + r//4),
                      (cx - r//2 - hw, cy - r - hw),
                      (cx - r//2 + hw, cy - r + r//4)],
                     fill=_darker(color, 60))
        draw.polygon([(cx + r//2, cy - r + r//4),
                      (cx + r//2 + hw, cy - r - hw),
                      (cx + r//2 - hw, cy - r + r//4)],
                     fill=_darker(color, 60))


def draw_npc(img, color, size):
    """Draw a small NPC figure."""
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2

    # Body
    bw = size // 4
    bh = size // 3
    draw.rectangle([cx - bw//2, cy - bh//4, cx + bw//2, cy + bh//2],
                   fill=color)
    # Head
    hr = size // 8
    draw.ellipse([cx - hr, cy - bh//4 - hr*2 + 1, cx + hr, cy - bh//4 + 1],
                 fill=_lighter(color, 50))


def draw_tile(img, color, size, variation=True):
    """Draw a tile with slight texture variation."""
    draw = ImageDraw.Draw(img)
    draw.rectangle([0, 0, size, size], fill=color)
    if variation:
        # Add some pixel noise for texture
        pixels = img.load()
        import random
        rng = random.Random(hash(color))
        for y in range(size):
            for x in range(size):
                if rng.random() < 0.3:
                    r, g, b, a = pixels[x, y]
                    d = rng.randint(-15, 15)
                    pixels[x, y] = (
                        max(0, min(255, r + d)),
                        max(0, min(255, g + d)),
                        max(0, min(255, b + d)),
                        a
                    )


def draw_icon(img, color, size, icon_type):
    """Draw a simple icon shape."""
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    r = size // 3

    if icon_type == "sword":
        draw.line([(cx, cy + r), (cx, cy - r)], fill=color, width=max(1, size//8))
        draw.line([(cx - r//2, cy - r//3), (cx + r//2, cy - r//3)],
                  fill=color, width=max(1, size//8))
    elif icon_type == "shield":
        draw.polygon([(cx, cy + r), (cx - r, cy - r//2),
                      (cx - r//2, cy - r), (cx + r//2, cy - r),
                      (cx + r, cy - r//2)], fill=color)
    elif icon_type == "potion":
        draw.ellipse([cx - r//2, cy - r//4, cx + r//2, cy + r],
                     fill=color)
        draw.rectangle([cx - r//4, cy - r, cx + r//4, cy - r//4],
                       fill=_lighter(color, 60))
    elif icon_type in ("spell", "xp"):
        # Star shape
        points = []
        import math
        for i in range(5):
            angle = math.pi * 2 * i / 5 - math.pi / 2
            points.append((cx + int(r * math.cos(angle)),
                          cy + int(r * math.sin(angle))))
        draw.polygon(points, fill=color)
    elif icon_type == "gold":
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
        draw.ellipse([cx - r + 2, cy - r + 2, cx + r - 2, cy + r - 2],
                     fill=_darker(color, 30))
    else:
        # Generic circle for status icons
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def draw_border(img, color, size, piece):
    """Draw a menu border piece."""
    draw = ImageDraw.Draw(img)
    bg = (20, 30, 60, 255)
    gold = color
    draw.rectangle([0, 0, size, size], fill=bg)

    w = max(1, size // 6)
    if "t" in piece and piece != "tr":
        draw.rectangle([0, 0, size, w], fill=gold)
    if "b" in piece and piece != "br":
        draw.rectangle([0, size - w, size, size], fill=gold)
    if "l" in piece and piece != "bl":
        draw.rectangle([0, 0, w, size], fill=gold)
    if "r" in piece and "l" not in piece:
        draw.rectangle([size - w, 0, size, size], fill=gold)
    if piece == "fill":
        draw.rectangle([0, 0, size, size], fill=bg)


def draw_hp_bar(img, color, size, bar_type):
    """Draw HP bar element."""
    draw = ImageDraw.Draw(img)
    h = size // 4
    y_off = (size - h) // 2

    if bar_type == "frame":
        draw.rectangle([2, y_off, size - 3, y_off + h], outline=(180, 180, 180), width=2)
    elif bar_type == "fill":
        draw.rectangle([2, y_off, size - 3, y_off + h], fill=color)
    elif bar_type == "empty":
        draw.rectangle([2, y_off, size - 3, y_off + h], fill=(80, 20, 20))


def _lighter(color, amount):
    """Lighten a color."""
    return tuple(min(255, c + amount) for c in color[:3])


def _darker(color, amount):
    """Darken a color."""
    return tuple(max(0, c - amount) for c in color[:3])


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

def save(img, path):
    """Save image, creating directories as needed."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    kb = os.path.getsize(path) / 1024
    print(f"  {kb:5.1f} KB  {os.path.relpath(path, os.path.join(os.path.dirname(__file__), '..'))}")


def generate_all():
    """Generate all placeholder assets."""
    count = 0

    # --- Class battle portraits (48x48) ---
    print("\n=== Class Battle Portraits (12) ===")
    promoted = {"knight", "champion", "shadow", "sage", "pyromancer", "wanderer"}
    for name, (base_c, prom_c) in CLASS_COLORS.items():
        img = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        is_prom = name in promoted
        color = prom_c if is_prom else base_c
        draw_character(img, color, 48, is_promoted=is_prom)
        save(img, os.path.join(SPRITES_DIR, f"{name}.png"))
        count += 1

    # --- Player directional sprites (32x32) ---
    print("\n=== Player Walk Sprites (4 static + 16 frames) ===")
    player_color = (80, 120, 180)
    for direction in ["down", "up", "left", "right"]:
        img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        draw_character(img, player_color, 32)
        # Direction indicator
        draw = ImageDraw.Draw(img)
        cx, cy = 16, 16
        if direction == "down":
            draw.polygon([(cx, cy + 12), (cx - 3, cy + 8), (cx + 3, cy + 8)],
                         fill=(255, 255, 255, 120))
        elif direction == "up":
            draw.polygon([(cx, cy - 12), (cx - 3, cy - 8), (cx + 3, cy - 8)],
                         fill=(255, 255, 255, 120))
        elif direction == "left":
            draw.polygon([(cx - 12, cy), (cx - 8, cy - 3), (cx - 8, cy + 3)],
                         fill=(255, 255, 255, 120))
        elif direction == "right":
            draw.polygon([(cx + 12, cy), (cx + 8, cy - 3), (cx + 8, cy + 3)],
                         fill=(255, 255, 255, 120))
        save(img, os.path.join(SPRITES_DIR, f"player_{direction}.png"))
        count += 1

    # Walk cycle frames
    os.makedirs(os.path.join(SPRITES_DIR, "walk"), exist_ok=True)
    for direction in ["down", "up", "left", "right"]:
        for frame in range(4):
            img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
            draw_character(img, player_color, 32)
            # Slight leg offset per frame
            draw = ImageDraw.Draw(img)
            offset = [-2, 0, 2, 0][frame]
            fw = 4
            if direction in ("left", "right"):
                draw.rectangle([14 + offset, 24, 14 + offset + fw, 28],
                               fill=_darker(player_color, 40))
            else:
                draw.rectangle([10 + offset, 24, 10 + offset + fw, 28],
                               fill=_darker(player_color, 40))
                draw.rectangle([18 - offset, 24, 18 - offset + fw, 28],
                               fill=_darker(player_color, 40))
            save(img, os.path.join(SPRITES_DIR, f"walk/walk_{direction}_{frame}.png"))
            count += 1

    # --- Monster sprites ---
    print("\n=== Monster Sprites (18) ===")
    os.makedirs(os.path.join(SPRITES_DIR, "monsters"), exist_ok=True)
    bosses = {"dark_knight", "dragon"}
    for name, color in MONSTER_COLORS.items():
        is_boss = name in bosses
        size = 96 if is_boss else 64
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw_monster(img, color, size, is_boss=is_boss)
        save(img, os.path.join(SPRITES_DIR, f"monsters/{name}.png"))
        count += 1

    # --- NPC sprites (32x32) ---
    print("\n=== NPC Sprites (6) ===")
    os.makedirs(os.path.join(SPRITES_DIR, "npcs"), exist_ok=True)
    for name, color in NPC_COLORS.items():
        img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        draw_npc(img, color, 32)
        save(img, os.path.join(SPRITES_DIR, f"npcs/{name}.png"))
        count += 1

    # --- Overworld tilesets (16x16) ---
    print("\n=== Overworld Tilesets (13) ===")
    for name, color in TILE_COLORS.items():
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 255))
        draw_tile(img, color + (255,), 16)
        save(img, os.path.join(TILESETS_DIR, f"{name}.png"))
        count += 1

    # --- Interior tilesets (16x16) ---
    print("\n=== Interior Tilesets (9) ===")
    os.makedirs(os.path.join(TILESETS_DIR, "interiors"), exist_ok=True)
    for name, color in INTERIOR_COLORS.items():
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 255))
        draw_tile(img, color + (255,), 16)
        save(img, os.path.join(TILESETS_DIR, f"interiors/{name}.png"))
        count += 1

    # --- UI icons (16x16) ---
    print("\n=== UI Icons (11) ===")
    os.makedirs(os.path.join(SPRITES_DIR, "ui"), exist_ok=True)
    icon_specs = [
        ("icon_sword",    (200, 200, 210), "sword"),
        ("icon_shield",   (100, 140, 200), "shield"),
        ("icon_potion",   (200, 50, 50),   "potion"),
        ("icon_spell",    (100, 140, 220), "spell"),
        ("icon_gold",     (255, 200, 50),  "gold"),
        ("icon_xp",       (80, 200, 80),   "xp"),
        ("icon_poison",   (140, 60, 180),  "status"),
        ("icon_sleep",    (100, 120, 200), "status"),
        ("icon_mute",     (200, 80, 80),   "status"),
        ("icon_slow",     (200, 160, 60),  "status"),
        ("icon_paralyze", (220, 200, 60),  "status"),
    ]
    for name, color, icon_type in icon_specs:
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        draw_icon(img, color, 16, icon_type)
        save(img, os.path.join(SPRITES_DIR, f"ui/{name}.png"))
        count += 1

    # --- UI border pieces (16x16) ---
    print("\n=== UI Border Pieces (9) ===")
    gold = (200, 170, 80)
    for piece in ["tl", "t", "tr", "l", "r", "bl", "b", "br", "fill"]:
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        draw_border(img, gold, 16, piece)
        save(img, os.path.join(SPRITES_DIR, f"ui/border_{piece}.png"))
        count += 1

    # --- HP bar elements (48x48) ---
    print("\n=== HP Bar Elements (3) ===")
    bar_specs = [
        ("hp_bar_frame", (180, 180, 180), "frame"),
        ("hp_bar_fill",  (60, 180, 60),   "fill"),
        ("hp_bar_empty", (80, 20, 20),    "empty"),
    ]
    for name, color, bar_type in bar_specs:
        img = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        draw_hp_bar(img, color, 48, bar_type)
        save(img, os.path.join(SPRITES_DIR, f"ui/{name}.png"))
        count += 1

    print(f"\nTotal: {count} placeholder assets generated.")
    return count


if __name__ == "__main__":
    generate_all()
