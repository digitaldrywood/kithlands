#!/usr/bin/env python3
"""Export the checked-in interior library as editable Tiled maps (no image edits)."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LAYERS = ['ground', 'terrain-detail', 'roads-and-water', 'structures',
          'props-below-player', 'collision', 'interactions', 'npc-spawns',
          'player-spawns', 'foreground', 'lighting-and-atmosphere']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    output = parser.parse_args().output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    templates = [json.loads(p.read_text()) for p in sorted((ROOT / 'shared/interiors').glob('*.json'))]
    assets = sorted({p['asset'] for t in templates for f in t['floors']
                     for p in f.get('presentation', {}).get('props', [])})
    tiles = [{'id': i, 'image': os.path.relpath(ROOT / 'client/public' / asset.lstrip('/'), output)}
             for i, asset in enumerate(assets)]
    (output / 'furniture.tsj').write_text(json.dumps(dict(type='tileset', name='interior-furniture',
        tilewidth=32, tileheight=32, tilecount=len(tiles), columns=0, tiles=tiles), indent=2) + '\n')
    count = 0
    for template in templates:
        for floor in template['floors']:
            layers = [dict(id=i+1, name=name, type='objectgroup', objects=[], visible=True, opacity=1)
                      for i, name in enumerate(LAYERS)]
            by_name = {layer['name']: layer for layer in layers}
            next_id = 1
            def add(layer, name, x, y, w=32, h=32, **extra):
                nonlocal next_id
                by_name[layer]['objects'].append(dict(id=next_id, name=name, x=x, y=y, width=w, height=h, **extra))
                next_id += 1
            presentation = floor.get('presentation', {})
            background = presentation.get('background_asset')
            if background:
                by_name['ground'].update(type='imagelayer', image=os.path.relpath(ROOT / 'client/public' / background.lstrip('/'), output))
                del by_name['ground']['objects']
                by_name['ground']['properties'] = [dict(name='runtime_width', type='int', value=floor['width']*32), dict(name='runtime_height', type='int', value=floor['height']*32)]
            for prop in presentation.get('props', []):
                add('props-below-player', Path(prop['asset']).stem, prop['x'], prop['y']+prop['height'],
                    prop['width'], prop['height'], gid=assets.index(prop['asset'])+1,
                    properties=[dict(name='feet_row', type='int', value=prop['row'])])
            for y, row in enumerate(floor['rows']):
                for x, symbol in enumerate(row):
                    if symbol not in '.DRUVS':
                        add('collision', symbol, x*32, y*32)
                    elif symbol == 'S':
                        add('interactions', 'secret_passage', x*32, y*32)
            for kind, key in [('npc-spawns', 'npc_anchors'), ('interactions', 'chest_anchors'), ('interactions', 'stairs')]:
                for item in floor.get(key, []):
                    props = [dict(name=k, type='int' if isinstance(v, int) else 'string', value=v)
                             for k,v in item.items() if isinstance(v, (str,int))]
                    add(kind, item.get('id', item.get('role', key)), item['x']*32, item['y']*32, properties=props)
            if floor.get('entrance'):
                e = floor['entrance']
                add('player-spawns', 'entrance', e['x']*32, e['y']*32)
            data = dict(type='map', version='1.10', tiledversion='1.11.2', orientation='orthogonal',
                renderorder='right-down', width=floor['width'], height=floor['height'], tilewidth=32,
                tileheight=32, infinite=False, layers=layers, nextlayerid=len(layers)+1, nextobjectid=next_id,
                tilesets=[dict(firstgid=1, source='furniture.tsj')],
                properties=[dict(name='template_id', type='string', value=template['id']),
                            dict(name='floor_id', type='int', value=floor['floor_id'])])
            (output / f"{template['id']}-floor-{floor['floor_id']}.tmj").write_text(json.dumps(data, indent=2)+'\n')
            count += 1
    print(f'Exported {count} Tiled floors and external furniture tileset to {output}')


if __name__ == '__main__':
    main()
