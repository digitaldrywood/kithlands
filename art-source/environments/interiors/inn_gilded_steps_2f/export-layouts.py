"""Export the shared inn's collision and interaction guides as editable Tiled maps."""
import json
from pathlib import Path

source = Path(__file__).resolve().parent
root = source.parents[3]
template = json.loads((root / "shared/interiors/inn_gilded_steps_2f.json").read_text())
for floor in template["floors"]:
    objects = {name: [] for name in ("collision", "interactions", "npc-spawns", "player-spawns", "foreground")}
    chests = {(entry["x"], entry["y"]): entry["id"] for entry in floor.get("chest_anchors", [])}
    for y, row in enumerate(floor["rows"]):
        for x, symbol in enumerate(row):
            if symbol not in ".RDUV" or (x, y) in chests:
                objects["collision"].append(dict(name=chests.get((x, y), symbol), type="solid", x=x*32, y=y*32, width=32, height=32))
    for kind, entries in (("stair", floor.get("stairs", [])), ("chest", floor.get("chest_anchors", []))):
        for entry in entries:
            objects["interactions"].append(dict(name=entry.get("id", kind), type=kind, x=entry["x"]*32, y=entry["y"]*32, width=32, height=32,
                properties=[dict(name=k, type="int" if isinstance(v, int) else "string", value=v) for k,v in entry.items() if k not in ("x","y")]))
    if floor.get("entrance"):
        entry = floor["entrance"]
        objects["interactions"].append(dict(name="exit", type="door", x=entry["x"]*32, y=entry["y"]*32, width=32, height=32,
            properties=[dict(name="transition_id", type="string", value="exit-interior")]))
        objects["player-spawns"].append(dict(name="entry", type="spawn", x=entry["x"]*32+16, y=(entry["y"]-1)*32+16, point=True))
    for entry in floor["npc_anchors"]:
        objects["npc-spawns"].append(dict(name=entry["role"], type="npc", x=entry["x"]*32+16, y=entry["y"]*32+16, point=True))
    for entry in floor["presentation"]["foreground"]:
        objects["foreground"].append(dict(name="opaque-crop", type="foreground", **{k:v for k,v in entry.items() if k != "row"},
            properties=[dict(name="depth_row", type="int", value=entry["row"])]))
    layers=[]
    object_id=1
    for name in ("ground","terrain-detail","roads-and-water","structures","props-below-player","collision","interactions","npc-spawns","player-spawns","foreground","lighting-and-atmosphere"):
        layer=dict(id=len(layers)+1,name=name,opacity=1,visible=name=="ground",x=0,y=0)
        if name=="ground":
            layer.update(type="imagelayer",image="../../../../client/public"+floor["presentation"]["background_asset"])
        else:
            layer.update(type="objectgroup",draworder="topdown",objects=objects.get(name,[]))
            for obj in layer["objects"]:
                obj.update(id=object_id,rotation=0,visible=True)
                object_id+=1
        layers.append(layer)
    tiled=dict(type="map",orientation="orthogonal",renderorder="right-down",version="1.10",tiledversion="1.11.2",infinite=False,tilewidth=32,tileheight=32,
        width=floor["width"],height=floor["height"],layers=layers,nextlayerid=12,nextobjectid=object_id,
        properties=[dict(name="runtime_template",type="string",value=template["id"]),dict(name="floor_id",type="int",value=floor["floor_id"])])
    (source/f'floor-{floor["floor_id"]}.tmj').write_text(json.dumps(tiled,indent=2)+"\n")
