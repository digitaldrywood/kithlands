from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
INTERIORS = ROOT / "client" / "public" / "tilesets" / "interiors"
OBJECTS = ROOT / "client" / "public" / "sprites" / "objects"
NPCS = ROOT / "client" / "public" / "sprites" / "npcs"

TILE = 16
NPC_SCALE = 8


def rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def tile_canvas(fill):
    return Image.new("RGBA", (TILE, TILE), rgba(fill))


def save_tile(name, image):
    image.save(INTERIORS / name)


def save_object(name, image):
    image.save(OBJECTS / name)


def save_npc(name, image):
    image.resize((TILE * NPC_SCALE, TILE * NPC_SCALE), Image.Resampling.NEAREST).save(
        NPCS / name,
    )


def draw_floor(base, lines, accents):
    img = tile_canvas(base)
    draw = ImageDraw.Draw(img)
    for y in range(0, TILE, 4):
        draw.line((0, y, TILE - 1, y), fill=rgba(lines), width=1)
    for x, y, color in accents:
        draw.rectangle((x, y, x + 1, y + 1), fill=rgba(color))
    return img


def draw_wall(base, trim, accents):
    img = tile_canvas(base)
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, TILE - 1, 2), fill=rgba(trim))
    draw.rectangle((0, TILE - 3, TILE - 1, TILE - 1), fill=rgba(trim))
    for x in (2, 7, 12):
        draw.rectangle((x, 3, x + 1, TILE - 4), fill=rgba(trim, 220))
    for x, y, color in accents:
        draw.point((x, y), fill=rgba(color))
    return img


def draw_simple_prop(base, shadow, highlight, body):
    img = tile_canvas(base)
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 2, 13, 13), fill=rgba(body))
    draw.rectangle((2, 2, 13, 4), fill=rgba(highlight))
    draw.rectangle((2, 11, 13, 13), fill=rgba(shadow))
    return img


def draw_bed():
    img = tile_canvas("#5e402f")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 2, 13, 13), fill=rgba("#cc9c63"))
    draw.rectangle((3, 3, 12, 10), fill=rgba("#f2f1ea"))
    draw.rectangle((3, 11, 12, 12), fill=rgba("#5870a8"))
    draw.rectangle((3, 3, 6, 5), fill=rgba("#c7d2e8"))
    draw.rectangle((9, 3, 12, 5), fill=rgba("#c7d2e8"))
    return img


def draw_bookshelf():
    img = tile_canvas("#4e3526")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 2, 13, 13), fill=rgba("#714d33"))
    for y in (4, 8, 12):
        draw.line((2, y, 13, y), fill=rgba("#c08d59"))
    books = [
        (3, 3, "#c94f49"),
        (5, 3, "#e2bb57"),
        (8, 3, "#77a15c"),
        (10, 3, "#5b76c7"),
        (4, 7, "#e7d5a1"),
        (7, 7, "#9c5aa2"),
        (9, 7, "#c57c43"),
        (3, 11, "#d8d8d8"),
        (6, 11, "#89b4e3"),
        (10, 11, "#d45d79"),
    ]
    for x, y, color in books:
        draw.rectangle((x, y, x + 1, y + 2), fill=rgba(color))
    return img


def draw_counter():
    img = tile_canvas("#6d4a32")
    draw = ImageDraw.Draw(img)
    draw.rectangle((1, 4, 14, 13), fill=rgba("#8a6246"))
    draw.rectangle((1, 4, 14, 6), fill=rgba("#d1a067"))
    draw.rectangle((3, 8, 5, 13), fill=rgba("#5a3927"))
    draw.rectangle((10, 8, 12, 13), fill=rgba("#5a3927"))
    return img


def draw_desk():
    img = tile_canvas("#68462e")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 5, 13, 11), fill=rgba("#98653d"))
    draw.rectangle((2, 5, 13, 6), fill=rgba("#d4ad75"))
    draw.rectangle((3, 7, 5, 10), fill=rgba("#72452c"))
    draw.rectangle((10, 7, 12, 10), fill=rgba("#72452c"))
    return img


def draw_table():
    img = tile_canvas("#6b4a31")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 4, 13, 8), fill=rgba("#c7925b"))
    draw.rectangle((3, 9, 4, 13), fill=rgba("#704728"))
    draw.rectangle((11, 9, 12, 13), fill=rgba("#704728"))
    return img


def draw_chair():
    img = tile_canvas("#5f402a")
    draw = ImageDraw.Draw(img)
    draw.rectangle((4, 5, 11, 9), fill=rgba("#a17144"))
    draw.rectangle((5, 2, 10, 4), fill=rgba("#c7925b"))
    draw.rectangle((5, 10, 6, 13), fill=rgba("#704728"))
    draw.rectangle((9, 10, 10, 13), fill=rgba("#704728"))
    return img


def draw_crate():
    img = tile_canvas("#6a472c")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 2, 13, 13), fill=rgba("#ad7a47"))
    draw.rectangle((2, 2, 13, 4), fill=rgba("#d4ab6f"))
    draw.line((2, 2, 13, 13), fill=rgba("#81532e"))
    draw.line((13, 2, 2, 13), fill=rgba("#81532e"))
    return img


def draw_fireplace():
    img = tile_canvas("#54473d")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 2, 13, 13), fill=rgba("#82756b"))
    draw.rectangle((4, 4, 11, 12), fill=rgba("#30221a"))
    draw.polygon([(5, 12), (7, 7), (9, 12)], fill=rgba("#ff9f43"))
    draw.polygon([(7, 12), (9, 8), (10, 12)], fill=rgba("#ffe08a"))
    draw.rectangle((3, 2, 12, 3), fill=rgba("#d0c1ac"))
    return img


def draw_candle():
    img = tile_canvas("#6e573f")
    draw = ImageDraw.Draw(img)
    draw.rectangle((6, 6, 9, 12), fill=rgba("#f7ecce"))
    draw.rectangle((6, 5, 9, 6), fill=rgba("#fff6a7"))
    draw.polygon([(7, 3), (6, 5), (9, 5)], fill=rgba("#ffcb62"))
    return img


def draw_statue():
    img = tile_canvas("#5c6370")
    draw = ImageDraw.Draw(img)
    draw.rectangle((5, 2, 10, 10), fill=rgba("#c5ceda"))
    draw.rectangle((4, 11, 11, 13), fill=rgba("#8f9baa"))
    draw.rectangle((6, 3, 9, 5), fill=rgba("#e1e7ef"))
    return img


def draw_pew():
    img = tile_canvas("#5b4029")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 5, 13, 8), fill=rgba("#8d613c"))
    draw.rectangle((3, 9, 4, 13), fill=rgba("#68422a"))
    draw.rectangle((11, 9, 12, 13), fill=rgba("#68422a"))
    draw.rectangle((2, 4, 13, 5), fill=rgba("#d4ad75"))
    return img


def draw_altar():
    img = tile_canvas("#69788b")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 5, 13, 12), fill=rgba("#b9c7da"))
    draw.rectangle((3, 3, 12, 5), fill=rgba("#f2d17c"))
    draw.rectangle((6, 1, 9, 5), fill=rgba("#fff0b3"))
    return img


def draw_door(locked=False):
    img = tile_canvas("#543320")
    draw = ImageDraw.Draw(img)
    draw.rectangle((3, 1, 12, 14), fill=rgba("#7d5232"))
    draw.rectangle((4, 2, 11, 13), fill=rgba("#97653b"))
    draw.rectangle((5, 3, 10, 12), fill=rgba("#b07c4a"))
    draw.ellipse((9, 7, 11, 9), fill=rgba("#f3cf78"))
    if locked:
        draw.rectangle((6, 5, 9, 8), outline=rgba("#f3cf78"), width=1)
    return img


def draw_stairs(up=True):
    img = tile_canvas("#62564b")
    draw = ImageDraw.Draw(img)
    for step in range(4):
        left = 2 + (3 - step if up else 0)
        right = 13 - (0 if up else 3 - step)
        top = 3 + step * 3
        draw.rectangle((left, top, right, top + 1), fill=rgba("#e6dfcf"))
    return img


def draw_window():
    img = tile_canvas("#6d8aa2")
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 2, 13, 9), fill=rgba("#95c8ff"))
    draw.rectangle((1, 1, 14, 10), outline=rgba("#d7b06c"), width=1)
    draw.line((7, 2, 7, 9), fill=rgba("#d8edf7"))
    draw.line((2, 5, 13, 5), fill=rgba("#d8edf7"))
    draw.rectangle((3, 11, 12, 12), fill=rgba("#7b5731"))
    return img


def draw_lantern():
    img = tile_canvas("#4d4238")
    draw = ImageDraw.Draw(img)
    draw.line((8, 1, 8, 4), fill=rgba("#d7b06c"))
    draw.rectangle((5, 4, 10, 11), fill=rgba("#8c603b"))
    draw.rectangle((6, 5, 9, 9), fill=rgba("#ffde8a"))
    draw.rectangle((5, 11, 10, 12), fill=rgba("#6f4929"))
    return img


def draw_rug(main, border, accent):
    img = tile_canvas(border)
    draw = ImageDraw.Draw(img)
    draw.rectangle((2, 2, 13, 13), fill=rgba(main))
    draw.rectangle((4, 4, 11, 11), outline=rgba(accent), width=1)
    draw.rectangle((6, 6, 9, 9), fill=rgba(accent))
    return img


def draw_secret_hint():
    img = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    crack = rgba("#f4e6b2", 220)
    glow = rgba("#d8b067", 180)
    draw.line((3, 4, 12, 11), fill=glow, width=1)
    draw.line((8, 2, 5, 13), fill=crack, width=1)
    draw.line((11, 4, 13, 8), fill=crack, width=1)
    draw.line((4, 9, 7, 11), fill=glow, width=1)
    return img


def draw_chest(closed=True):
    img = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle((1, 5, 14, 14), fill=rgba("#472514"))
    draw.rectangle((2, 6, 13, 13), fill=rgba("#8f4d24"))
    lid = "#c85e2a" if closed else "#734026"
    draw.rectangle((2, 3, 13, 8), fill=rgba(lid))
    draw.rectangle((2, 3, 13, 4), fill=rgba("#f7cf74"))
    draw.rectangle((2, 7, 13, 8), fill=rgba("#5e2d17"))
    draw.rectangle((5, 3, 6, 13), fill=rgba("#f1d7a1"))
    draw.rectangle((9, 3, 10, 13), fill=rgba("#f1d7a1"))
    draw.rectangle((2, 10, 13, 11), fill=rgba("#f1d7a1"))
    if closed:
        draw.rectangle((6, 8, 9, 10), fill=rgba("#ffe89e"))
    else:
        draw.rectangle((3, 4, 12, 7), fill=rgba("#3b2416"))
    return img


def draw_sparkle():
    img = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    color = rgba("#fff4ad", 220)
    draw.line((8, 2, 8, 7), fill=color)
    draw.line((6, 4, 10, 4), fill=color)
    draw.line((6, 2, 10, 6), fill=color)
    draw.line((10, 2, 6, 6), fill=color)
    return img


def draw_npc(body, accent, hair, outline, prop=None, robe=False):
    img = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rectangle((6, 1, 9, 3), fill=rgba(hair))
    draw.rectangle((5, 3, 10, 5), fill=rgba("#f3d1aa"))
    if robe:
        draw.rectangle((4, 6, 11, 12), fill=rgba(body))
        draw.polygon([(4, 12), (11, 12), (8, 15)], fill=rgba(body))
    else:
        draw.rectangle((5, 6, 10, 12), fill=rgba(body))
    draw.rectangle((5, 6, 10, 7), fill=rgba(accent))
    draw.rectangle((4, 8, 5, 12), fill=rgba(body))
    draw.rectangle((10, 8, 11, 12), fill=rgba(body))
    draw.rectangle((6, 13, 7, 15), fill=rgba(outline))
    draw.rectangle((8, 13, 9, 15), fill=rgba(outline))
    if prop == "staff":
        draw.line((3, 5, 3, 13), fill=rgba("#d7c27d"))
        draw.ellipse((2, 3, 4, 5), fill=rgba("#8fd1ff"))
    elif prop == "scroll":
        draw.rectangle((10, 7, 12, 10), fill=rgba("#f2e6c6"))
    elif prop == "satchel":
        draw.rectangle((9, 8, 11, 11), fill=rgba("#8b5a2d"))
    elif prop == "hammer":
        draw.line((11, 7, 11, 12), fill=rgba("#d3d3d3"))
        draw.rectangle((10, 6, 12, 7), fill=rgba("#7c7f89"))
    return img


def draw_gossip():
    img = draw_npc("#78a6d2", "#f8d789", "#6b4628", "#3e2a18")
    draw = ImageDraw.Draw(img)
    draw.rectangle((4, 7, 11, 8), fill=rgba("#f4d6aa"))
    draw.rectangle((11, 7, 13, 9), fill=rgba("#f4d6aa"))
    draw.rectangle((3, 5, 5, 7), fill=rgba("#d06f8f"))
    draw.rectangle((10, 3, 11, 5), fill=rgba("#d06f8f"))
    draw.rectangle((6, 9, 9, 10), fill=rgba("#f7f2c1"))
    return img


def draw_quest_giver():
    img = draw_npc(
        "#5f7aaf",
        "#f1d47f",
        "#715335",
        "#352316",
        robe=True,
    )
    draw = ImageDraw.Draw(img)
    draw.rectangle((10, 7, 12, 11), fill=rgba("#f2e6c6"))
    draw.rectangle((9, 8, 10, 11), fill=rgba("#8b5a2d"))
    draw.rectangle((4, 7, 5, 12), fill=rgba("#e8c96f"))
    draw.ellipse((9, 3, 11, 5), fill=rgba("#8fd1ff"))
    return img


def ensure_dirs():
    for path in (INTERIORS, OBJECTS, NPCS):
        path.mkdir(parents=True, exist_ok=True)


def main():
    ensure_dirs()

    floor_sets = {
        "house_floor.png": ("#9a6b44", "#c38b59", [(2, 2, "#845534"), (10, 10, "#d7b179")]),
        "house_floor_b.png": ("#8b5f39", "#b37a49", [(4, 6, "#6f4627"), (11, 3, "#c38b59")]),
        "house_floor_c.png": ("#936540", "#ba8353", [(3, 10, "#734a2b"), (12, 5, "#d7b179")]),
        "house_floor_d.png": ("#8f6642", "#b78457", [(5, 4, "#6d4325"), (9, 12, "#cca468")]),
        "inn_floor.png": ("#99663d", "#cb9258", [(3, 5, "#6b4222"), (12, 9, "#e0b072")]),
        "inn_floor_b.png": ("#9d6a40", "#d79a5b", [(4, 8, "#704726"), (10, 2, "#e9bd7d")]),
        "inn_floor_c.png": ("#a27046", "#c98e55", [(6, 12, "#71482a"), (13, 5, "#e3b174")]),
        "inn_floor_d.png": ("#95633b", "#c58d57", [(2, 11, "#684223"), (11, 7, "#ddaf74")]),
        "shop_floor.png": ("#8d684c", "#b8976f", [(3, 2, "#6e4f39"), (12, 10, "#dbc3a5")]),
        "shop_floor_b.png": ("#7f5d43", "#a98763", [(6, 3, "#624632"), (9, 11, "#d2b794")]),
        "shop_floor_c.png": ("#8b6245", "#b58f68", [(4, 9, "#6b4831"), (12, 4, "#d8bd98")]),
        "shop_floor_d.png": ("#856149", "#b19072", [(2, 6, "#694a34"), (10, 13, "#dbc2a3")]),
        "temple_floor.png": ("#b8c2cf", "#e7edf4", [(3, 3, "#a4afbb"), (11, 10, "#ffffff")]),
        "temple_floor_b.png": ("#b0bbc8", "#e1e9f2", [(5, 5, "#9ea9b4"), (12, 3, "#ffffff")]),
        "temple_floor_c.png": ("#b6c0cd", "#ebf1f7", [(2, 11, "#a1acb7"), (10, 6, "#fdfdfd")]),
        "temple_floor_d.png": ("#adb7c5", "#dfe6ef", [(4, 8, "#9aa6b3"), (13, 5, "#fafafa")]),
    }
    for name, spec in floor_sets.items():
        save_tile(name, draw_floor(*spec))

    wall_sets = {
        "house_wall.png": ("#8b5d3d", "#d2a46c", [(3, 6, "#f1d39c"), (11, 8, "#6a4127")]),
        "house_wall_b.png": ("#7e5234", "#c69560", [(5, 7, "#ebc98d"), (12, 10, "#5f3922")]),
        "house_wall_c.png": ("#86563a", "#d3a067", [(4, 11, "#e9cb91"), (9, 5, "#6a4127")]),
        "inn_wall.png": ("#9a6942", "#e1b275", [(3, 8, "#f8d79c"), (10, 10, "#7d4a2a")]),
        "inn_wall_b.png": ("#8f633e", "#d7aa70", [(5, 6, "#efcf95"), (11, 12, "#744627")]),
        "inn_wall_c.png": ("#95663f", "#dfb070", [(4, 9, "#f4d89f"), (12, 7, "#7a492a")]),
        "shop_wall.png": ("#8a644a", "#c99a6c", [(5, 5, "#f2d9a7"), (9, 11, "#5e432f")]),
        "shop_wall_b.png": ("#805d45", "#bf9165", [(3, 10, "#ecd5a4"), (11, 6, "#563d2b")]),
        "shop_wall_c.png": ("#86614a", "#c59769", [(4, 8, "#edd6a1"), (10, 12, "#5b412c")]),
        "temple_wall.png": ("#8a94a6", "#d9e2ed", [(5, 5, "#f5f8fb"), (9, 10, "#718093")]),
        "temple_wall_b.png": ("#7f8a9d", "#d0d9e4", [(3, 11, "#f7fbff"), (11, 6, "#687587")]),
        "temple_wall_c.png": ("#8691a3", "#d6dfea", [(4, 8, "#f2f6fb"), (10, 12, "#6d7a8c")]),
    }
    for name, spec in wall_sets.items():
        save_tile(name, draw_wall(*spec))

    props = {
        "altar.png": draw_altar(),
        "bed.png": draw_bed(),
        "bookshelf.png": draw_bookshelf(),
        "counter.png": draw_counter(),
        "desk.png": draw_desk(),
        "table.png": draw_table(),
        "chair.png": draw_chair(),
        "crate.png": draw_crate(),
        "fireplace.png": draw_fireplace(),
        "candle.png": draw_candle(),
        "statue.png": draw_statue(),
        "pew.png": draw_pew(),
        "door.png": draw_door(False),
        "locked_door.png": draw_door(True),
        "stairs_up.png": draw_stairs(True),
        "stairs_down.png": draw_stairs(False),
        "window.png": draw_window(),
        "lantern.png": draw_lantern(),
        "rug_house.png": draw_rug("#7b3f32", "#ceb170", "#f0d9a3"),
        "rug_inn.png": draw_rug("#1b5f78", "#d8b166", "#fff1bf"),
        "rug_shop.png": draw_rug("#2f6b49", "#d1a868", "#f3e4aa"),
        "rug_temple.png": draw_rug("#6a5ba1", "#d0b57e", "#f4e8c0"),
        "secret_hint.png": draw_secret_hint(),
    }
    for name, image in props.items():
        save_tile(name, image)

    save_object("chest_closed.png", draw_chest(True))
    save_object("chest_open.png", draw_chest(False))
    save_object("chest_sparkle.png", draw_sparkle())

    npcs = {
        "gossip.png": draw_gossip(),
        "quest_giver.png": draw_quest_giver(),
        "flavor_amber.png": draw_npc("#7a9c5d", "#f7d485", "#80512e", "#43311f"),
        "flavor_bram.png": draw_npc("#a15f4b", "#f5d482", "#3f2d1d", "#2b1d12", prop="satchel"),
    }
    for name, image in npcs.items():
        save_npc(name, image)


if __name__ == "__main__":
    main()
