#!/usr/bin/env python3
"""Compile shared room blueprints into a finite, reviewable interior library.

This is an offline authoring tool, never runtime generation. It preserves
gameplay identities from blueprints and packs functional furniture clusters
around a protected entrance/aisle. Every output must pass connectivity checks
and the rendered gallery review before release.
"""
import copy
import hashlib
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESIGN = json.loads((ROOT / "shared/interior_library_design.json").read_text())
WALKABLE = set(".DRUVS")
SIZE = 32


def neighbors(p):
    x, y = p
    return [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]


def reachable(rows, start, occupied=()):
    occupied = set(occupied)
    seen, queue = set(), [start]
    for p in queue:
        x, y = p
        if p in seen or p in occupied or not (0 <= y < len(rows) and 0 <= x < len(rows[0])):
            continue
        if rows[y][x] not in WALKABLE:
            continue
        seen.add(p)
        queue.extend(n for n in neighbors(p) if n not in seen)
    return seen


def connected(rows, start, occupied=()):
    free = {(x, y) for y, row in enumerate(rows) for x, tile in enumerate(row)
            if tile in WALKABLE} - set(occupied)
    return reachable(rows, start, occupied) == free


def prop(asset, x, y, width, height, row):
    return dict(asset=f"/interiors/library/{asset}.png", x=x, y=y,
                width=width, height=height, row=row)


def furnish(source, family, inventory, seed):
    rng = random.Random(seed)
    height = 14 if source.get("stairs") or any("S" in row for row in source["rows"]) or family == "inn" else 12
    for attempt in range(800):
        floor = copy.deepcopy(source)
        rows = [list("W" * 16) if y < 3 or y > height - 3 else list("W" + "." * 14 + "W")
                for y in range(height)]
        entry = floor.get("entrance")
        if entry:
            floor["entrance"] = dict(x=7, y=height - 1, **({"from": entry["from"]} if "from" in entry else {}))
            rows[height - 2][7:9], rows[height - 1][7:9] = list(".."), list("DD")
        start = (7, height - 3)
        reserved = {(x, y) for x in (7, 8) for y in range(5, height)}
        props = []
        secret_count = sum(row.count("S") for row in source["rows"])
        if secret_count:
            # Bookcases form a storage alcove with a hinted, walk-through panel.
            reserved |= {(x, y) for x in range(1, 5) for y in range(3, 7)}
            for y in range(3, 6):
                rows[y][4] = "O"
            for x in range(1, 5):
                rows[5][x] = "O"
            rows[5][3] = "S"
            if secret_count > 1:
                rows[4][4] = "S"
            props.append(prop("bookcase", 128, 64, 32, 128, 5))
            for x in range(1, 4):
                props.append(prop("bookcase", x * 32, 128, 32, 64, 5))
        if floor.get("stairs"):
            reserved |= {(x, y) for x in range(11, 14) for y in range(3, 7)}
            for y in range(3, 6):
                for x in range(11, 14):
                    rows[y][x] = "O"
            stair = floor["stairs"][0]
            stair.update(x=12, y=5, to_x=12, to_y=6)
            rows[5][12] = "U" if stair["kind"] == "up" else "V"
            props.append(prop("stairs-" + stair["kind"], 352, 64, 96, 128, 5))
        chests = floor.get("chest_anchors", [])
        for index, chest in enumerate(chests):
            x, y = ((1, 3 + index) if secret_count else [(12, height - 3), (3, height - 3)][index])
            chest.update(x=x, y=y)
            reserved.add((x, y))
        placements = []
        failed = False
        for asset in inventory:
            shape = DESIGN["furniture"][asset]
            w, h = shape["width"], shape["height"]
            candidates = [(x, y) for y in range(3, height - 1 - h) for x in range(1, 15 - w + 1)]
            rng.shuffle(candidates)
            if shape["prefer"] == "center":
                candidates.sort(key=lambda p: abs(p[0] - 6) + abs(p[1] - 3) * 4)
            elif shape["prefer"] == "north":
                candidates.sort(key=lambda p: p[1])
            placed = False
            for x, y in candidates:
                cells = {(xx, yy) for yy in range(y, y + h) for xx in range(x, x + w)}
                if cells & reserved or any(rows[yy][xx] != "." for xx, yy in cells):
                    continue
                top = (y + h) * 32 - shape["visual_height"]
                if any(x * 32 < p["x"] + p["width"] and (x + w) * 32 > p["x"] and top < p["y"] + p["height"] and (y + h) * 32 > p["y"] for p in props):
                    continue
                for xx, yy in cells:
                    rows[yy][xx] = shape["symbol"]
                if not connected(rows, start):
                    for xx, yy in cells:
                        rows[yy][xx] = "."
                    continue
                vh = shape["visual_height"]
                props.append(prop(asset, x * 32, (y + h) * 32 - vh, w * 32, vh, y + h - 1))
                placements.append((asset, x, y, w, h))
                placed = True
                break
            if not placed:
                failed = True
                break
        if failed:
            continue
        occupied = {(c["x"], c["y"]) for c in chests}
        if not connected(rows, start, occupied):
            continue
        for index, npc in enumerate(floor.get("npc_anchors", [])):
            candidates = [(x, y) for y in range(3, height - 3) for x in range(1, 15)
                          if rows[y][x] == "." and (x, y) not in occupied
                          and not (floor.get("stairs") and (x, y) == (12, 6))
                          and not any(x*32 < p["x"]+p["width"] and (x+1)*32 > p["x"]
                                      and y*32 < p["y"]+p["height"] and (y+1)*32 > p["y"]
                                      for p in props)
                          and all(abs(x-cx) + abs(y-cy) > 2 for cx, cy in occupied)]
            rng.shuffle(candidates)
            if index == 0 and placements:
                focal = next((p for p in placements if p[0] in ("altar", "counter")), placements[0])
                _, fx, fy, fw, fh = focal
                candidates.sort(key=lambda p: abs(p[0] - (fx + fw)) + abs(p[1] - (fy + fh)))
            target = next((p for p in candidates if connected(rows, start, occupied | {p})), None)
            if target is None:
                failed = True
                break
            npc.update(x=target[0], y=target[1])
            if npc["role"] in DESIGN["finished_sprites"]:
                npc["sprite"] = DESIGN["finished_sprites"][npc["role"]]
            occupied.add(target)
        if failed:
            continue
        floor.update(width=16, height=height, rows=["".join(row) for row in rows])
        floor.pop("window_anchors", None)
        floor.pop("light_anchors", None)
        shell = "stone" if family == "temple" else "wood"
        background = f"/interiors/library/{shell}-shell.png"
        if not entry:
            background = "/interiors/library/stone-closed-shell.png"
        floor["presentation"] = dict(background_asset=background, hide_tile_layer=True, props=props,
            chest_closed_asset="/interiors/inn/gilded-guest-chest-closed.png",
            chest_open_asset="/interiors/inn/gilded-guest-chest-open.png")
        return floor
    raise ValueError(f"No connected composition for {family}, floor {source['floor_id']}, seed {seed}")


def compile_template(source, name, profile, variant, original=False):
    result = copy.deepcopy(source)
    result["id"] = name
    if not original:
        result["library_generation"] = 1
    family = source["building_type"]
    for index, floor in enumerate(source["floors"]):
        if family == "inn" and index > 0:
            # Preserve the accepted painted guest floor and its treasure.
            result["floors"][index]["stairs"][0].update(to_x=12, to_y=6)
            continue
        seed = int.from_bytes(hashlib.sha256(f"{name}:{variant}:{index}".encode()).digest()[:8], "little")
        inventory = DESIGN["profiles"][family][profile]
        if index > 0:
            inventory = ["altar", "bookcase", "bookcase", "desk", "pew"]
        result["floors"][index] = furnish(floor, family, inventory, seed)
    if family == "inn" and len(result["floors"]) > 1:
        result["floors"][0]["stairs"][0].update(to_x=7, to_y=7)
    return result


def main():
    output = ROOT / "shared/interiors"
    fingerprints = set()
    manifest = []
    for family, profiles in DESIGN["profiles"].items():
        originals = [t for t in DESIGN["originals"] if t["building_type"] == family]
        entries = []
        for index, original in enumerate(originals):
            if original["id"] in DESIGN["preserve_painted"]:
                template = copy.deepcopy(original)
            else:
                profile = list(profiles)[index % len(profiles)]
                template = compile_template(original, original["id"], profile, index, original=True)
            entries.append((template, "original"))
        for index in range(DESIGN["target_per_family"] - len(originals)):
            profile = list(profiles)[index % len(profiles)]
            variant = index // len(profiles) + 1
            name = f"{family}_{profile}_{variant:02}"
            source = originals[index % len(originals)]
            template = compile_template(source, name, profile, variant)
            entries.append((template, profile))
        for template, profile in entries:
            signature = json.dumps([f["rows"] for f in template["floors"]])
            if signature in fingerprints:
                raise ValueError(f"Duplicate collision layout: {template['id']}")
            fingerprints.add(signature)
            (output / f"{template['id']}.json").write_text(json.dumps(template, indent=2) + "\n")
            manifest.append(dict(id=template["id"], family=family, profile=profile,
                                 floors=len(template["floors"])))
    (ROOT / "shared/interior_library_manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Compiled {len(manifest)} distinct templates, {sum(t['floors'] for t in manifest)} floors")


if __name__ == "__main__":
    main()
