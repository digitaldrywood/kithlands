"""Original Kithlands vector weapon art. Writes candidates only; no runtime install."""
from pathlib import Path
import json
import sys

# Per-item art direction, independent of rules/stats. Shared items own runtime keys.
PROFILES = {
    'wooden_club': ('club', 'wood', 'plain'),
    'wooden_staff': ('staff', 'wood', 'plain'),
    'rusty_dagger': ('dagger', 'rust', 'plain'),
    'short_sword': ('sword', 'iron', 'plain'),
    'short_bow': ('bow', 'wood', 'short'),
    'iron_dagger': ('dagger', 'iron', 'plain'),
    'iron_axe': ('axe', 'iron', 'single'),
    'oak_staff': ('staff', 'wood', 'crook'),
    'long_bow': ('bow', 'wood', 'long'),
    'war_hammer': ('hammer', 'iron', 'block'),
    'steel_dagger': ('dagger', 'steel', 'plain'),
    'shadow_blade': ('dagger', 'shadow', 'hook'),
    'war_staff': ('staff', 'mythril', 'mace'),
    'composite_bow': ('bow', 'steel', 'recurve'),
    'mythril_hammer': ('hammer', 'mythril', 'block'),
    'flame_blade': ('sword', 'fire', 'flame'),
    'berserker_axe': ('axe', 'fire', 'double'),
    'venom_dagger': ('dagger', 'venom', 'hook'),
    'elemental_staff': ('staff', 'storm', 'orb'),
    'hawk_bow': ('bow', 'gold', 'wing'),
    'thunder_hammer': ('hammer', 'storm', 'rune'),
    'rune_blade': ('sword', 'mythril', 'rune'),
    'titan_axe': ('axe', 'gold', 'double'),
    'void_knife': ('dagger', 'shadow', 'void'),
    'sage_staff': ('staff', 'mythril', 'crescent'),
    'storm_bow': ('bow', 'storm', 'recurve'),
    'earth_hammer': ('hammer', 'earth', 'stone'),
    'hero_edge': ('sword', 'gold', 'wing'),
    'world_splitter': ('axe', 'mythril', 'crown'),
    'whisperfang': ('dagger', 'mythril', 'fang'),
    'starcaller': ('staff', 'gold', 'star'),
    'skys_eye': ('bow', 'mythril', 'eye'),
    'mountainvoice': ('hammer', 'gold', 'mountain'),
}
PALETTES = {
    'wood': ('#b89161', '#745037', '#dbbd85', '#b8a27c'),
    'rust': ('#c79166', '#684431', '#edc093', '#98856b'),
    'iron': ('#c5d1d9', '#53697b', '#f0f4ef', '#a98c5c'),
    'steel': ('#edf3f7', '#667f98', '#ffffff', '#c6a361'),
    'mythril': ('#9fe0ec', '#39778e', '#e9fcff', '#d8bb77'),
    'shadow': ('#7772b9', '#302a56', '#c6b5f3', '#9d8eba'),
    'fire': ('#e9a45e', '#9d453b', '#fff0a1', '#e4b06d'),
    'venom': ('#aad890', '#46704c', '#dcf6b3', '#bcaa6c'),
    'storm': ('#91c6f0', '#435e9f', '#eeedff', '#e7c570'),
    'earth': ('#b4ab91', '#5b6557', '#e4d7b0', '#93bd91'),
    'gold': ('#f0d28c', '#887247', '#fff4cf', '#9ce4ec'),
}

def icon(kind, material, variant, label):
    main, dark, light, trim = PALETTES[material]
    defs = f'<defs><linearGradient id="metal" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="{light}"/><stop offset=".46" stop-color="{main}"/><stop offset=".5" stop-color="{light}"/><stop offset="1" stop-color="{dark}"/></linearGradient></defs>'
    parts = []
    def path(d, fill='url(#metal)', stroke=None, width=None):
        parts.append(f'<path d="{d}" fill="{fill}"'+(f' stroke="{stroke}"' if stroke else '')+(f' stroke-width="{width}"' if width else '')+'/>')
    def circle(cx,cy,r,fill):
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>')
    if kind in ('sword','dagger'):
        # Model vertically, then rotate a fixed diagonal. Daggers remain short/broad.
        parts.append('<g transform="rotate(39 32 32)">')
        top, shoulder = (5,40) if kind=='sword' else (12,38)
        if variant in ('hook','fang'):
            path('M31 9Q48 19 37 32L35 39L28 39L26 30Q35 24 31 9Z')
        elif variant=='flame':
            path('M32 4L39 14L35 22L39 28L35 39L28 39L25 29L29 22L27 14Z')
        else:
            path(f'M32 {top}L38 {top+13}L36 {shoulder}L28 {shoulder}L26 {top+13}Z')
            path(f'M32 {top+5}L32 {shoulder-4}', 'none', light, 1.4)
        path('M28 40L36 40L36 55L28 55Z', '#72503d')
        path('M28 44L36 46M28 49L36 51','none',trim,2)
        path('M21 38Q32 34 43 38L42 43Q32 39 22 43Z',trim)
        path('M27 55L37 55L35 60L29 60Z',trim)
        if variant in ('rune','void'):
            path('M32 18L35 23L32 28L29 23Z',dark)
            path('M32 21L32 25','none',light,1)
        if variant=='wing':
            path('M22 39L17 32L25 35L32 32L39 35L47 32L42 39Z',trim)
            circle(32,38,3,main)
        parts.append('</g>')
    elif kind in ('axe','hammer','club','staff'):
        parts.append('<g transform="'+('translate(0 2) ' if kind=='axe' else '')+'rotate(37 32 32)">')
        path('M29 21L35 21L35 58L29 58Z', '#76533f' if material not in ('shadow','mythril') else dark)
        path('M29 42L35 44M29 47L35 49M29 52L35 54','none',trim,2.5)
        path('M28 56L36 56L35 60L29 60Z',trim)
        if kind=='club':
            path('M29 7Q38 5 40 15L37 34L28 36L23 16Q22 9 29 7Z',main)
            path('M28 13L31 27M35 12L34 31','none',dark,1.5)
        elif kind=='axe':
            path('M29 12L17 5Q8 17 16 29L29 25Z')
            path('M17 5Q8 17 16 29L20 27Q14 17 21 9Z',light)
            if variant in ('double','crown'):
                path('M35 12L47 5Q56 17 48 29L35 25Z')
                path('M47 5Q56 17 48 29L44 27Q50 17 43 9Z',light)
            else:
                path('M35 14L42 14L44 19L35 22Z',dark)
            path('M28 10L36 10L36 28L28 28Z',trim)
            if variant=='crown':
                path('M24 12L24 5L29 9L32 3L35 9L40 5L40 12Z',trim)
            circle(32,19,2.5,dark)
        elif kind=='hammer':
            if variant in ('stone','mountain'):
                path('M15 8L42 7L49 14L47 28L19 31L13 24Z')
                path('M19 13L27 17L24 24M40 12L35 19L39 25','none',dark,2)
            else:
                path('M13 10L45 10L49 15L49 25L45 29L13 29L10 25L10 14Z')
                path('M14 11L18 11L18 28L14 28ZM42 11L46 11L46 28L42 28Z',trim)
            if variant=='rune':
                path('M32 12L27 20L32 20L28 27L38 17L33 17L37 12Z',light)
            elif variant=='mountain':
                path('M23 24L31 12L36 19L39 15L44 24Z',light)
        elif kind=='staff':
            if variant=='plain':
                path('M29 6L35 6L36 25L29 25Z',main)
                path('M31 9L32 21','none',dark,1.2)
            elif variant=='crook':
                path('M29 25L29 12Q29 4 36 5Q44 6 42 14L38 18L34 15L36 12L35 10L34 12L35 24Z',main)
            elif variant=='mace':
                path('M26 22L22 12L27 8L32 11L37 8L42 12L38 22Z')
                path('M26 22L38 22L36 27L28 27Z',trim)
            elif variant=='crescent':
                path('M25 5Q15 27 35 25Q44 22 42 10Q36 23 29 18Q23 14 25 5Z')
                circle(32,12,3,trim)
            else:
                path('M22 18L26 25L38 25L43 17L39 20L37 11L32 7L27 11L25 20Z',trim)
                if variant=='star':
                    path('M32 3L35 10L42 12L36 16L37 23L32 19L26 23L28 16L22 12L29 10Z',main)
                else:
                    circle(32,13,8,main)
                    path('M29 8L28 13L31 16','none',light,2)
                path('M27 26L37 26L35 30L29 30Z',trim)
        parts.append('</g>')
    elif kind=='bow':
        # Bow/string silhouette is deliberately distinct from a diagonal polearm.
        span=5 if variant!='short' else 10
        path(f'M19 {span}Q49 15 33 32Q49 49 19 {64-span}L25 {54 if span==5 else 49}Q36 43 28 34L28 29Q36 20 25 {10 if span==5 else 15}Z',main)
        path(f'M19 {span}L28 32L19 {64-span}', 'none',light,1.5)
        path('M27 26L33 28L33 37L27 38Z','#72503d')
        path('M28 29L33 30M28 34L33 35','none',trim,2)
        path('M10 49L48 11','none',trim,2)
        path('M44 10L53 7L50 16Z')
        path('M10 47L9 54L16 53','none',main,2)
        if variant in ('recurve','wing','eye'):
            path('M26 14L36 10L33 19M31 45L38 53L25 51','none',trim,3)
        if variant=='eye':
            path('M31 21Q44 15 45 24Q39 30 31 21Z',trim)
            circle(39,22,2,dark)
    if material=='rust':
        path('M38 22L42 24M31 28L35 30','none','#ab613e',2)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img"><title>{label}</title>{defs}<g stroke="#172332" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">'+''.join(parts)+'</g></svg>\n'

if __name__=='__main__':
    target=Path(sys.argv[1]);target.mkdir(parents=True,exist_ok=True)
    content=json.loads(Path('shared/items.json').read_text())
    for item in content['weapons']:
        if item['id'] not in PROFILES:continue
        (target/(item['id'].replace('_','-')+'.svg')).write_text(icon(*PROFILES[item['id']],item['name']))
    print(f'Wrote {len(PROFILES)} original SVG candidates to {target}')
