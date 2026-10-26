"""Original outlined equipment icons. Build candidates, never install runtime art."""
from pathlib import Path
from html import escape
import json
import sys

# Explicit art direction; no equipment rules or stats live in this script.
PROFILES = {
    'patched_mantle': ('mantle', 'moss', 'patch'),
    'leather_gloves': ('gloves', 'leather', 'plain'),
    'traveler_belt': ('belt', 'leather', 'plain'),
    'trail_pants': ('pants', 'moss', 'patch'),
    'trail_boots': ('boots', 'leather', 'plain'),
    'copper_amulet': ('amulet', 'copper', 'plain'),
    'copper_ring': ('ring', 'copper', 'plain'),
    'twin_sigil_amulet': ('amulet', 'mythril', 'twin'),
    'warrior_signet': ('ring', 'gold', 'signet'),
    'cloth_robe': ('robe', 'linen', 'plain'),
    'leather_armor': ('leather', 'leather', 'plain'),
    'chain_mail': ('chain', 'iron', 'plain'),
    'silk_robe': ('robe', 'jade', 'silk'),
    'studded_leather': ('leather', 'leather', 'studs'),
    'plate_mail': ('plate', 'steel', 'plain'),
    'enchanted_robe': ('robe', 'violet', 'rune'),
    'war_plate': ('plate', 'iron', 'crest'),
    'mythril_chain': ('chain', 'mythril', 'plain'),
    'shadow_leather': ('leather', 'shadow', 'rune'),
    'arcane_robe': ('robe', 'blue', 'rune'),
    'dragonscale_plate': ('plate', 'ember', 'scales'),
    'knight_chain': ('chain', 'steel', 'crest'),
    'ranger_leather': ('leather', 'moss', 'leaf'),
    'sage_robe': ('robe', 'jade', 'leaf'),
    'blessed_plate': ('plate', 'gold', 'sun'),
    'guardian_chain': ('chain', 'blue', 'crest'),
    'hunter_leather': ('leather', 'leather', 'fang'),
    'void_robe': ('robe', 'shadow', 'moon'),
    'aegis_plate': ('plate', 'mythril', 'wings'),
    'titan_chain': ('chain', 'gold', 'mountain'),
    'phantom_leather': ('leather', 'violet', 'moon'),
    'celestial_robe': ('robe', 'blue', 'star'),
    'wooden_shield': ('shield', 'leather', 'wood'),
    'iron_shield': ('shield', 'iron', 'boss'),
    'steel_shield': ('shield', 'steel', 'crest'),
    'leather_cap': ('cap', 'leather', 'plain'),
    'iron_helm': ('helm', 'iron', 'open'),
    'great_helm': ('helm', 'steel', 'closed'),
}
PALETTES = {
    'leather': ('#b88454', '#68452f', '#e1b680', '#d9b570'),
    'moss': ('#879777', '#424f41', '#c0c7a0', '#c9ab70'),
    'copper': ('#d79a67', '#784838', '#f6d49a', '#a8d9c1'),
    'linen': ('#c8bf9f', '#77745f', '#eee7c9', '#9e8a5b'),
    'iron': ('#9eaebd', '#455a6b', '#dee8ed', '#bfa16b'),
    'steel': ('#c6d6e3', '#536d86', '#f4f8f7', '#dfbb72'),
    'mythril': ('#93d8df', '#326d85', '#defaff', '#dfc78b'),
    'jade': ('#82b9a4', '#34615e', '#cde8c2', '#e0c285'),
    'violet': ('#ae92c6', '#51426f', '#e2cced', '#dfbf86'),
    'shadow': ('#79759e', '#302e50', '#c7beda', '#b9a3cc'),
    'blue': ('#7aabcf', '#304c79', '#d1e9f5', '#e8c87b'),
    'ember': ('#bd8161', '#643d38', '#efbb88', '#dfc074'),
    'gold': ('#d5ba78', '#7a6648', '#fff0ba', '#a0d8d9'),
}


def icon(kind, material, detail, label):
    main, dark, light, trim = PALETTES[material]
    p = []
    def path(d, fill='url(#surface)', stroke='#192737', width=2):
        p.append(f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')
    def line(d, color=light, width=1.5):
        path(d, 'none', color, width)
    def circle(x, y, r, fill, stroke='#192737', width=1.8):
        p.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')
    def emblem(style, x=32, y=30):
        p.append(f'<g transform="translate({x-32} {y-30})">')
        if style in ('rune', 'twin'):
            line('M32 23L37 29L32 36L27 29Z', trim, 2)
            line('M32 26V33', light, 1)
        elif style == 'leaf':
            path('M26 35Q22 23 39 23Q39 35 26 35Z', trim, dark, 1)
            line('M26 35L35 27', dark, 1)
        elif style == 'moon':
            path('M35 23A7 7 0 1 0 38 35Q27 35 35 23Z', trim, dark, 1)
        elif style == 'sun':
            circle(32, 30, 4, trim, dark, 1)
            line('M32 20V23M32 37V40M22 30H25M39 30H42M25 23L27 25M37 35L39 37M39 23L37 25M27 35L25 37', trim, 1.5)
        elif style in ('star', 'wings'):
            path('M32 21L35 27L42 28L37 33L38 39L32 36L26 39L27 33L22 28L29 27Z', trim, dark, 1)
        elif style == 'fang':
            path('M27 23L37 23L34 34L29 38L30 30Z', light, dark, 1)
        elif style == 'mountain':
            path('M23 35L31 23L35 29L39 26L43 35Z', trim, dark, 1)
        else:
            path('M27 23L37 23L36 32L32 37L28 32Z', trim, dark, 1)
            line('M32 26V32', light, 1.2)
        p.append('</g>')

    if kind in ('robe', 'chain', 'plate', 'leather'):
        if kind == 'robe':
            path('M23 9L14 13L6 31L15 36L20 26L17 57Q32 61 47 57L44 26L49 36L58 31L50 13L41 9L37 15H27Z')
            path('M23 10L29 21L27 54L21 55L25 25L18 17ZM41 10L35 21L37 54L43 55L39 25L46 17Z', dark, dark, 1)
            line('M23 11L30 21L29 53M41 11L34 21L35 53M21 56Q32 59 43 56', trim, 2)
            path('M21 34L43 34L44 39L20 39Z', trim)
            line('M25 42L23 52M39 42L41 52', light, 1)
            if detail != 'plain': emblem(detail, 32, 28)
        else:
            path('M23 9L14 12L6 29L15 35L20 28L18 54Q32 59 46 54L44 28L49 35L58 29L50 12L41 9L37 15H27Z')
            path('M25 9L27 15L37 15L39 9Q32 13 25 9Z', dark)
            if kind == 'chain':
                for y in range(21, 48, 5):
                    for x in range(23+(2 if y % 2 else 0), 43, 6):
                        line(f'M{x-2} {y}q2 5 4 0', dark, 1.3)
                path('M18 49L46 49L46 54Q32 59 18 54Z', trim)
                line('M14 16L10 26M50 16L54 26', light, 2)
            elif kind == 'plate':
                path('M22 16Q32 22 42 16L45 35L39 42H25L19 35Z')
                path('M18 41L46 41L45 49H19ZM19 49L45 49L46 55L34 58L32 52L30 58L18 55Z', dark)
                path('M12 13L23 12L21 24L8 28ZM41 12L52 13L56 28L43 24Z')
                line('M32 22V39M21 44H43M23 51L29 53M35 53L41 51', light)
                if detail == 'scales':
                    for y in (26, 32):
                        for x in (26, 32, 38):
                            line(f'M{x-3} {y}l3 4 3 -4', trim, 1.4)
            else:
                path('M23 17L30 22L29 49L21 49ZM41 17L34 22L35 49L43 49Z', dark, dark, 1)
                path('M18 42L46 42L46 48L18 48Z', '#6d4938')
                path('M29 41L36 41L36 49L29 49Z', trim)
                line('M20 18L17 27M44 18L47 27', trim)
                if detail == 'studs':
                    for x,y in [(23,25),(23,34),(41,25),(41,34),(25,53),(39,53)]: circle(x,y,1.4,light,dark,.7)
            if detail not in ('plain', 'studs', 'scales'): emblem(detail)
    elif kind == 'mantle':
        path('M23 12Q32 7 41 12L56 39L44 45L40 39L32 46L24 39L20 45L8 39Z')
        path('M24 13L28 24L32 31L36 24L40 13Q32 19 24 13Z', dark)
        line('M13 37L21 39M43 39L51 37M22 25L18 34M42 25L46 34', trim, 2)
        path('M35 31L43 29L46 37L38 40Z', '#b39d73', dark, 1)
        line('M37 32L40 30M39 39L42 37M44 33L46 35', light, 1)
        circle(32,25,3,trim)
    elif kind == 'gloves':
        for x,y,angle in [(2,3,-12),(29,9,12)]:
            p.append(f'<g transform="translate({x} {y}) rotate({angle} 16 25)">')
            path('M8 23L7 12Q8 8 11 12L13 20V7Q15 3 17 7V19L19 8Q22 5 23 9L22 22L26 17Q30 17 29 21L25 35L21 39L21 48H8V36L4 26Q3 21 6 21Z')
            path('M8 38L22 38L22 48L8 48Z', dark)
            line('M10 42H20M12 26L12 33M18 25L18 33', trim)
            p.append('</g>')
    elif kind == 'belt':
        path('M8 23Q32 14 56 23L55 39Q32 31 9 40Z', dark)
        path('M8 26Q32 19 56 26L55 35Q32 28 9 36Z')
        path('M24 20L40 20L40 39L24 39Z', trim)
        path('M28 25L36 25L36 34L28 34Z', dark)
        line('M33 29H42', light, 2)
        for x in (13,18,47,51): circle(x,29,1,dark,dark,.5)
    elif kind == 'pants':
        path('M17 7L47 7L48 28L43 57L33 56L32 34L29 56L18 57L15 28Z')
        path('M17 7L47 7L47 14L17 14Z', dark)
        line('M32 16V29M21 22L20 44M43 22L40 44', dark, 1.5)
        path('M19 34L27 33L28 43L19 45Z', '#b39d73', dark, 1)
        line('M19 53L29 52M34 52L43 53', trim, 2)
    elif kind == 'boots':
        for x,y in [(0,0),(24,4)]:
            p.append(f'<g transform="translate({x} {y})">')
            path('M16 7L32 7L30 34L34 42L35 52L9 52L8 45L16 37Z')
            path('M15 7L33 7L32 15L15 15Z', dark)
            path('M8 47L35 47L35 53L9 53Z', dark)
            line('M20 19L27 21M19 25L26 27M18 31L25 33', trim, 2)
            p.append('</g>')
    elif kind == 'amulet':
        line('M16 10Q15 30 32 38Q49 30 48 10', dark, 5)
        line('M16 10Q15 30 32 38Q49 30 48 10', main, 2.5)
        if detail == 'twin':
            path('M26 30L36 34L32 51L22 47Z', trim)
            path('M35 30L44 35L39 51L30 46Z')
            line('M28 36L26 43M37 37L35 44', dark, 2)
        else:
            circle(32,43,11,main)
            circle(32,43,6,dark,light,1.2)
            path('M32 36L36 43L32 49L28 43Z', trim, dark, 1)
    elif kind == 'ring':
        p.append('<ellipse cx="32" cy="36" rx="17" ry="20" fill="none" stroke="#192737" stroke-width="10"/>')
        p.append(f'<ellipse cx="32" cy="36" rx="17" ry="20" fill="none" stroke="{main}" stroke-width="6"/>')
        line('M19 29Q19 20 27 18M42 42L40 47', light, 2)
        if detail == 'signet':
            path('M24 10L40 10L43 20L37 28L27 28L21 20Z', trim)
            path('M32 13L36 19L32 24L28 19Z', dark, light, 1)
    elif kind == 'shield':
        path('M32 6L54 14L51 37Q46 51 32 59Q18 51 13 37L10 14Z')
        path('M32 11L49 17L46 36Q42 47 32 53Q22 47 18 36L15 17Z', dark)
        if detail == 'wood':
            path('M32 12L48 18L45 36Q41 46 32 52Q23 46 19 36L16 18Z', main, trim, 1)
            line('M24 16L25 45M33 14V50M40 17L39 45', dark, 1.5)
            path('M16 23L48 23L47 28L17 28ZM20 39L44 39L41 44H23Z', '#667784')
        elif detail == 'boss':
            circle(32,30,9,main,trim,2)
            line('M29 26L35 32', light, 2)
        else: emblem('crest',32,31)
        for x,y in [(16,17),(48,17),(21,42),(43,42)]: circle(x,y,1.3,trim,dark,.6)
    elif kind == 'cap':
        path('M12 41L14 24Q16 9 32 9Q48 9 50 24L52 41L43 49L39 41H25L21 49Z')
        path('M12 34Q32 28 52 34V41Q32 36 12 41Z', dark)
        line('M32 12V29M19 24Q21 15 27 14', trim, 1.5)
    elif kind == 'helm':
        path('M13 45L13 23Q14 8 32 6Q50 8 51 23V45L43 53L39 43H25L21 53Z')
        path('M19 27L45 27L44 37H20Z', '#263744')
        if detail == 'closed':
            path('M19 38L45 38L44 51L32 58L20 51Z')
            line('M25 42V49M30 42V51M35 42V51M40 42V49', dark, 2)
        path('M29 8L35 8L35 40L29 40Z', trim)
        line('M19 22Q20 15 26 13M38 13Q44 16 45 22', light, 1.8)
    else:
        raise ValueError(kind)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><title>{escape(label)}</title><defs><linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{light}"/><stop offset=".42" stop-color="{main}"/><stop offset="1" stop-color="{dark}"/></linearGradient></defs><g stroke-linejoin="round" stroke-linecap="round">'+''.join(p)+'</g></svg>\n'


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[3]
    content = json.loads((root/'shared/items.json').read_text())
    target = Path(sys.argv[1])
    target.mkdir(parents=True, exist_ok=True)
    for group in ('gear','armor','shields','helmets'):
        for item in content[group]:
            if item['id'] in PROFILES:
                (target/(item['id'].replace('_','-')+'.svg')).write_text(icon(*PROFILES[item['id']],item['name']))
    print(f'Wrote {len(PROFILES)} original equipment SVG candidates to {target}')
