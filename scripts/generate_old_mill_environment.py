#!/usr/bin/env python3
"""Author original Old Mill SVG backgrounds and their matching Tiled maps.

SVG sources are the production assets, not an image-model conversion. Geometry,
prop footprints and the navigable routes are authored together here. The default
output is a candidate directory; review rendered candidates before installing.
"""

import argparse
import json
import math
import random
from pathlib import Path

WIDTH, HEIGHT = 768, 512
LAYERS = ["ground", "terrain-detail", "roads-and-water", "structures",
          "props-below-player", "collision", "interactions", "npc-spawns",
          "player-spawns", "foreground", "lighting-and-atmosphere"]
ANCHORS = [(2, 8), (21, 8), (12, 2), (12, 13), (12, 8), (6, 4), (12, 12)]


class Scene:
    def __init__(self, key):
        self.key = key
        self.rng = random.Random(key)
        self.shapes = []
        self.solids = []
        self.add('''<defs>
          <linearGradient id="timber" x2="0" y2="1"><stop stop-color="#ae8351"/><stop offset=".5" stop-color="#795433"/><stop offset="1" stop-color="#4d3527"/></linearGradient>
          <linearGradient id="stone" x2="0" y2="1"><stop stop-color="#887e62"/><stop offset="1" stop-color="#494c40"/></linearGradient>
          <linearGradient id="water" x2=".5" y2="1"><stop stop-color="#214a4b"/><stop offset=".6" stop-color="#346c69"/><stop offset="1" stop-color="#528883"/></linearGradient>
          <linearGradient id="leaves" x2=".3" y2="1"><stop stop-color="#8c9b4f"/><stop offset=".55" stop-color="#506937"/><stop offset="1" stop-color="#293f2d"/></linearGradient>
          <radialGradient id="lamp"><stop stop-color="#ffde83" stop-opacity=".34"/><stop offset="1" stop-color="#ffc15b" stop-opacity="0"/></radialGradient>
          <radialGradient id="shade"><stop offset=".5" stop-color="#182821" stop-opacity="0"/><stop offset="1" stop-color="#101c1b" stop-opacity=".43"/></radialGradient>
          <pattern id="grain" width="39" height="24" patternUnits="userSpaceOnUse"><path d="M0 6Q10 2 25 6T44 6M4 16Q17 20 38 14" fill="none" stroke="#e7c99a" stroke-opacity=".09" stroke-width="1"/></pattern>
          <filter id="texture" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="14" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".075"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
        </defs>''')

    def add(self, text):
        self.shapes.append(text)

    def rect(self, x, y, w, h, fill, stroke=None, radius=0, extra=""):
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}"' +
                 (f' stroke="{stroke}" stroke-width="2"' if stroke else '') + f' {extra}/>')

    def path(self, d, fill="none", stroke=None, width=1, extra=""):
        self.add(f'<path d="{d}" fill="{fill}"' +
                 (f' stroke="{stroke}" stroke-width="{width}"' if stroke else '') + f' {extra}/>')

    def ellipse(self, x, y, rx, ry, fill, stroke=None, extra=""):
        stroke_width = '' if 'stroke-width=' in extra else ' stroke-width="2"'
        self.add(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{fill}"' +
                 (f' stroke="{stroke}"{stroke_width}' if stroke else '') + f' {extra}/>')

    def solid(self, name, x, y, w, h):
        self.solids.append(dict(id=len(self.solids) + 1, name=name, type="solid",
                                x=x, y=y, width=w, height=h))

    def shadow(self, x, y, rx, ry):
        self.ellipse(x + 4, y + 5, rx, ry, "#111c19", extra='opacity=".35"')

    def barrel(self, x, y, size=1):
        self.add(f'<g transform="translate({x} {y}) scale({size})">')
        self.shadow(0, 10, 18, 9)
        self.path('M-16-13Q-22 4-14 22Q0 30 14 22Q22 4 16-13Z', 'url(#timber)', '#372b23', 2)
        for a in [-10, -4, 4, 10]:
            self.path(f'M{a}-13Q{a*1.3} 2 {a} 23', stroke='#4e3525')
        for yy in [-3, 16]:
            self.path(f'M-18 {yy}Q0 {yy+7} 18 {yy}', stroke='#343c35', width=5)
            self.path(f'M-17 {yy-1}Q0 {yy+5} 17 {yy-1}', stroke='#859080', width=1)
        self.ellipse(0, -13, 16, 8, '#af8550', '#493929')
        self.ellipse(0, -13, 12, 5, '#84603b', '#c29a5c')
        self.path('M-11-15L11-12M-7-18L-7-10M4-18L4-9', stroke='#553d2b')
        self.add('</g>')

    def crate(self, x, y, w=44, h=34):
        self.rect(x + 5, y + 9, w, h, '#142019', radius=3, extra='opacity=".3"')
        self.rect(x, y, w, h, 'url(#timber)', '#372c23', 2)
        self.path(f'M{x} {y}l8-8h{w}l-8 8M{x+w} {y}l8-8v{h}l-8 8', '#9e784b', '#433225', 2)
        for xx in range(x+10, x+w, 10):
            self.path(f'M{xx} {y+2}v{h-4}', stroke='#513a29')
        self.path(f'M{x+4} {y+3}l{w-8} {h-6}M{x+w-4} {y+3}l-{w-8} {h-6}', stroke='#c0965b', width=5)
        for xx in [x+4, x+w-4]:
            for yy in [y+4, y+h-4]:
                self.ellipse(xx, yy, 1.5, 1.5, '#332c26')

    def sack(self, x, y, tone='#b9a072'):
        self.shadow(x, y+9, 19, 10)
        self.path(f'M{x-10} {y-18}Q{x-29} {y+3} {x-15} {y+20}Q{x} {y+29} {x+17} {y+18}Q{x+26} {y+3} {x+8} {y-18}Z', tone, '#5a4d34', 2)
        self.path(f'M{x-10} {y-18}l2-8 8 3 8-3 2 8Z', '#8b754e', '#5a4d34', 2)
        self.path(f'M{x-10} {y-16}h20M{x-14} {y+13}q8 6 21 2M{x+5} {y-9}q11 10 8 23', stroke='#796446', width=2)
        self.path(f'M{x-9} {y-6}q-8 13-2 20', stroke='#ddc699', width=2)

    def lamp(self, x, y, scale=1):
        self.ellipse(x, y+8, 61*scale, 55*scale, 'url(#lamp)')
        self.path(f'M{x} {y-22}v9', stroke='#282d27', width=3)
        self.path(f'M{x-7} {y-12}l7-5 7 5-2 18h-10Z', '#edb753', '#343b2f', 2)
        self.rect(x-2, y-10, 4, 13, '#ffe3a0')
        self.path(f'M{x-8} {y-12}h16M{x-6} {y+6}h12', stroke='#444934', width=3)

    def rock(self, x, y, scale=1):
        self.add(f'<g transform="translate({x} {y}) scale({scale})">')
        self.shadow(0, 4, 18, 10)
        self.path('M-19 2L-14-11 0-18 16-11 23 1 15 11-8 13Z', '#707664', '#444f42', 2)
        self.path('M-14-10L0-15 15-9 2-3Z', '#9c9f80')
        self.path('M-14 4L-4 0 7 5 2 11-9 10Z', '#536946')
        self.add('</g>')

    def grass(self, x, y, scale=1):
        self.path(f'M{x-5*scale} {y}q-5-9-2-13M{x} {y}q-1-13 4-17M{x+3*scale} {y}q4-9 9-10', stroke=self.rng.choice(['#637747','#87904e','#a4a66a']), width=1.5)

    def tree(self, x, y, scale=1, gold=False):
        self.add(f'<g transform="translate({x} {y}) scale({scale})">')
        self.shadow(2, 15, 33, 15)
        self.path('M-7 15L-3-53 8-58 11 14 18 22 3 19-14 24Z', 'url(#timber)', '#303c28', 2)
        self.path('M2 12L3-42M3-21L-14-40M6-12L25-36', stroke='#aa8653', width=2)
        cols = ['#ad9d4b','#8c873e','#c0aa56','#6e7036'] if gold else ['#789049','#58793e','#9baa58','#456336']
        for dx,dy,r in [(-19,-48,25),(20,-50,26),(-3,-73,29),(2,-40,29)]:
            self.path(f'M{dx-r} {dy}q-5-16 9-22q0-17 20-13q14-12 25 2q20-2 19 18q16 13 0 25q-9 18-29 11q-19 10-33-5Z', self.rng.choice(cols), '#334b2e', 2)
            for _ in range(13):
                px,py=dx+self.rng.randint(-r+6,r-6),dy+self.rng.randint(-r+4,r-5)
                self.path(f'M{px} {py}l5-3 4 2-5 3Z', self.rng.choice(cols), extra='opacity=".65"')
        self.add('</g>')

    def wheel(self, x, y, radius=58, horizontal=False):
        self.add(f'<g transform="translate({x} {y}) scale(1 {0.63 if horizontal else 1})">')
        self.shadow(5, 12, radius+12, radius+7)
        for a in range(0, 360, 30):
            self.add(f'<g transform="rotate({a})">')
            self.rect(-8,-radius-9,16,24,'url(#timber)','#332c23',2)
            self.rect(-4,-radius,8,radius,'#9d7847','#473c2a',1)
            self.add('</g>')
        self.ellipse(0,0,radius-5,radius-5,'none','#403727',extra='stroke-width="13"')
        self.ellipse(0,0,radius-5,radius-5,'none','#bc9657',extra='stroke-width="6"')
        self.ellipse(0,0,13,13,'#c9ad71','#3b3e30')
        self.ellipse(0,0,5,5,'#3f4e43','#838f6c')
        self.add('</g>')

    def floor(self, stone=False, damp=False):
        self.rect(0,0,768,512,'#26312b')
        self.rect(32,38,704,436,'#6a6047' if stone else '#795435')
        if stone:
            for yy in range(40,480,37):
                for xx in range(0,768,64):
                    x=xx + (17 if (yy//37)%2 else -13)
                    color=self.rng.choice(['#857963','#7e775e','#746f58','#918169','#857f64'])
                    self.rect(x,yy,61,34,color,'#5b5c49',4)
                    self.path(f'M{x+7} {yy+4}h42',stroke='#b4a287',extra='opacity=".4"')
                    if self.rng.random()<.2:
                        self.path(f'M{x+25} {yy+2}l-4 7 7 9-3 10',stroke='#5b5d4b',extra='opacity=".5"')
        else:
            for yy in range(40,480,25):
                for xx in range(32,736,96):
                    self.rect(xx,yy,94,23,self.rng.choice(['#8b6745','#805b3c','#916d48','#98744f','#785538']),'#59402c',1)
                    self.path(f'M{xx+8} {yy+6}q24-4 75 0M{xx+20} {yy+16}h53',stroke='#b99564',extra='opacity=".33"')
                    self.ellipse(xx+6,yy+5,1,1,'#453b2d')
                    self.ellipse(xx+87,yy+18,1,1,'#453b2d')
        self.rect(32,40,704,440,'url(#grain)')
        if damp:
            for x,y,rx,ry in [(138,360,57,23),(592,357,47,16),(583,147,77,22),(106,139,30,15)]:
                self.ellipse(x,y,rx,ry,'#384e3e',extra='opacity=".3"')
                self.path(f'M{x-rx/2} {y+2}q{rx/2}-10 {rx} 0',stroke='#abc3a0',extra='opacity=".17"')
        # All rooms preserve wide cross routes and the special northwest anchor.
        for name,x,y,w,h in [('north',0,0,768,32),('west',0,0,32,512),('east',736,0,32,512),('south',0,480,768,32)]:
            self.solid(name+'-boundary',x,y,w,h)
        self.walls()

    def walls(self):
        for x in range(0,768,48):
            self.rect(x,0,46,17,'#4a4a3a','#292e26',2)
            self.rect(x-22,18,46,19,'#69644d','#363c2f',2)
        self.rect(0,38,768,9,'#211f1b',extra='opacity=".45"')
        for x in [18,740]:
            self.rect(x,16,10,468,'url(#timber)','#302b22',2)
            self.path(f'M{x+3} 23v450',stroke='#af8452')
        self.rect(0,478,768,34,'#303b32','#1b251f')
        for x in range(0,768,49):
            self.rect(x,480,47,24,'url(#stone)','#303b31',3)
        # Four consistent arches line up with the content-owned action anchors.
        self.path('M354 39V10H446V39','none','#342b23',10)
        self.rect(364,0,72,33,'#202c28')
        self.path('M354 40h93M366 50h66M370 59h58',stroke='#c0aa7a',width=3)
        self.rect(361,460,78,28,'#443d30','#242c26',2)
        self.path('M356 461h88M366 452h67M374 444h52',stroke='#b29a6d',width=3)
        for x in [31,735]:
            self.rect(x-8,239,16,66,'#25332c')
            self.path(f'M{x-9} 234h18M{x-9} 311h18',stroke='#b79765',width=4)
        for x in [64,704]:
            self.lamp(x,66)

    def shelf(self,x,y,w=116):
        self.rect(x+4,y+7,w,60,'#22291f',radius=3,extra='opacity=".4"')
        self.rect(x,y,w,55,'#503b2a','#302920',3)
        for shelf_y in [y+8,y+42]:
            self.rect(x-3,shelf_y,w+6,7,'url(#timber)','#403021',1)
        for xx in range(x+10,x+w-15,22):
            self.ellipse(xx+3,y+33,8,4,'#3e3627')
            self.path(f'M{xx-3} {y+15}q5-4 10 0l3 18q-8 6-16 0Z',self.rng.choice(['#9a7f4b','#667458','#836140']),'#393b2c')
        self.rect(x+5,y+53,w-10,7,'#b18a52')

    def table(self,x,y,w=126,h=48):
        self.rect(x+7,y+12,w,h,'#22291f',radius=6,extra='opacity=".35"')
        self.rect(x+6,y+h-2,8,15,'#4b3726','#32291f')
        self.rect(x+w-15,y+h-2,8,15,'#4b3726','#32291f')
        self.rect(x,y,w,h,'url(#timber)','#3c2d20',4)
        for yy in range(y+10,y+h,12):
            self.path(f'M{x+3} {yy}h{w-6}',stroke='#473425')
        self.path(f'M{x+4} {y+3}h{w-8}',stroke='#c6a270',width=3)

    def stairs(self,x,y,w=80,h=100):
        self.rect(x-8,y-8,w+16,h+20,'#3f3b2b','#292d23',3)
        for yy in range(y,y+h,13):
            self.rect(x,yy,w,11,'url(#timber)','#372c21')
            self.path(f'M{x+2} {yy+1}h{w-4}',stroke='#c8a273',width=2)
        for xx in [x-8,x+w]:
            self.rect(xx,y-10,8,h+20,'url(#timber)','#302d24')

    def pipe(self,d,width=15):
        self.path(d,stroke='#282f29',width=width+5)
        self.path(d,stroke='#77794f',width=width)
        self.path(d,stroke='#b1a476',width=3)

    def finish(self):
        self.rect(0,0,768,512,'url(#shade)')
        self.rect(0,0,768,512,'transparent',extra='filter="url(#texture)"')
        return '<svg xmlns="http://www.w3.org/2000/svg" width="768" height="512" viewBox="0 0 768 512" role="img"><title>Old Mill — '+self.key.replace('-',' ').title()+'</title>'+''.join(self.shapes)+'</svg>\n'

    def tiled(self):
        layers=[]
        for i,name in enumerate(LAYERS):
            layer=dict(id=i+1,name=name,type='imagelayer' if name=='ground' else 'objectgroup',opacity=1,visible=name!='collision',x=0,y=0)
            if name=='ground':
                layer['image']=f'/api/data/dungeons/art/{self.key}.svg'
            else:
                layer['objects']=[]
                layer['draworder']='topdown'
            if name=='collision':
                layer['objects']=self.solids
            if name=='player-spawns':
                layer['objects']=[dict(id=500,name='entrance',type='spawn',point=True,x=400,y=400,properties=[dict(name='direction',type='string',value='up')])]
            layers.append(layer)
        return dict(type='map',orientation='orthogonal',renderorder='right-down',width=24,height=16,tilewidth=32,tileheight=32,infinite=False,tiledversion='1.11.2',version='1.10',properties=[dict(name='id',type='string',value=self.key),dict(name='kind',type='string',value='dungeon')],layers=layers)


def outdoor(scene, pool=False):
    s=scene
    s.rect(0,0,768,512,'#61754a')
    # Large moss patches establish the terrain before small leaves and flowers.
    for _ in range(80):
        x,y=s.rng.randrange(768),s.rng.randrange(512)
        s.ellipse(x,y,s.rng.randrange(10,65),s.rng.randrange(5,24),s.rng.choice(['#506541','#73824f','#818955','#486642']),extra='opacity=".55"')
    path='M400 515C390 432 374 366 400 280C404 219 401 136 400 54M32 274C155 256 276 282 400 280C503 267 610 262 738 274M206 144Q288 124 399 150'
    s.path(path,stroke='#4d6040',width=74,extra='stroke-linecap="round"')
    s.path(path,stroke='#b9ac7d',width=56,extra='stroke-linecap="round"')
    s.path(path,stroke='#cdbb8a',width=42,extra='stroke-linecap="round"')
    for _ in range(150):
        x,y=s.rng.randrange(40,730),s.rng.randrange(38,475)
        if (360<x<430 or 250<y<295 or (180<x<400 and 128<y<156)):
            s.ellipse(x,y,s.rng.randint(1,4),s.rng.randint(1,2),s.rng.choice(['#8b8964','#dfd0a0','#a49b72']),extra='opacity=".7"')
        else:
            s.grass(x,y)
    # River occupies the eastern pockets, with a broad, readable bridge route.
    for y,h in [(30,192),(322,155)]:
        s.rect(547,y,115,h,'#324e3f',radius=23)
        s.rect(557,y,94,h,'url(#water)',radius=22)
        for yy in range(y+8,y+h-6,13):
            s.path(f'M{565+s.rng.randrange(18)} {yy}q22-5 56 0',stroke='#a5c5a7',extra='opacity=".32"')
        s.solid('river-bank-'+str(y),544,y,128,h)
        for yy in range(y+17,y+h,43):
            s.grass(548,yy)
            s.rock(665,yy,.55)
    for xx in range(548,661,12):
        s.rect(xx,224,11,95,'url(#timber)','#57452d',1)
        s.path(f'M{xx+3} 229v82',stroke='#c3a46f')
    for yy in [220,316]:
        s.path(f'M541 {yy}h128',stroke='#382f24',width=8)
        s.path(f'M541 {yy-2}h128',stroke='#ad8550',width=4)
    for name,x,y,w,h in [('north',0,0,768,32),('west',0,0,32,512),('east',736,0,32,512),('south',0,480,768,32)]:
        s.solid(name+'-boundary',x,y,w,h)
    if not pool:
        # Split oak: a memorable hollow trunk and forked canopy, away from path.
        s.tree(120,185,1.18,True)
        s.path('M100 204L111 119 129 115 138 204 151 216 121 211 91 219Z','url(#timber)','#38452c',3)
        s.path('M111 160Q116 139 124 156L129 197 108 199Z','#253a2c','#b08d50',2)
        s.path('M114 148L90 112M126 149L155 116',stroke='#795f35',width=12)
        s.solid('split-oak',80,160,80,64)
        # Mill silhouette: steep slate roof, stone footing, waterwheel and moss.
        s.rect(307,3,187,50,'#73664b','#3b392c',3)
        s.path('M289 19L320-21H483L507 19Z','#435f5a','#283d35',3)
        for yy in [0,10]:
            s.path(f'M306 {yy}h183',stroke='#829381',width=2)
        s.rect(365,10,71,46,'#2b3026','#bd9c5d',4)
        s.path('M373 15v35M428 15v35M371 12h59',stroke='#766038',width=3)
        s.lamp(346,35)
        s.lamp(456,35)
        s.path('M364 62h72M370 70h60',stroke='#e0c392',width=3)
        s.solid('mill-west-wall',304,32,48,32)
        s.solid('mill-east-wall',448,32,48,32)
        # Side path marker and kingfisher landing tell a local woodland story.
        s.path('M255 186v43',stroke='#604629',width=6)
        s.path('M235 182h39l9 8-9 8h-39Z','#b09157','#594d30',2)
        s.path('M240 189h22',stroke='#626547',width=2)
        s.solid('pool-trail-sign',240,192,32,32)
        s.path('M691 213q-5-43 15-56',stroke='#6b6241',width=7)
        s.path('M697 182q-13-12-24-5',stroke='#7e7450',width=4)
        s.ellipse(679,172,9,6,'#416e7c','#293f39')
        s.path('M674 175l-7 10 12-7M686 170l12 2-12 2','#b6a36e')
        s.ellipse(684,169,2,2,'#192d2c')
        s.solid('kingfisher-branch',688,160,32,64)
    else:
        # Optional pool uses a quieter stone basin and heron statue focal point.
        s.ellipse(173,359,121,58,'#3d5643','#8d9263')
        s.ellipse(173,356,108,48,'url(#water)','#c0b482')
        for xx,yy in [(132,343),(189,374),(214,337)]:
            s.ellipse(xx,yy,14,7,'#7f945d','#405f46')
            s.path(f'M{xx} {yy}l12-3',stroke='#bac183')
        s.solid('heron-pool',64,320,224,96)
        s.rock(160,104,2)
        s.path('M151 97q-10-20 6-33l14-19q6-16-5-20l-12 5 9 6-9 25q-27 5-14 32Z','#c3bea0','#656e55',2)
        s.path('M164 27l20 8-19 1M149 94l-4 13M157 94l4 13',stroke='#747b5e',width=3)
        s.solid('heron-stone',112,64,64,64)
        s.crate(473,355,43,30)
        s.solid('keeper-cache',480,352,32,32)
    for x,y,scale in [(34,152,1.25),(42,422,1.24),(270,420,1.07),(700,407,1.15),(732,122,1.2),(274,95,.94),(508,418,.85),(475,193,.9)]:
        s.tree(x,y,scale,gold=x in [274,700])
        # Trunks/canopy clusters are solid rectangles kept away from all routes.
        s.solid('woodland-'+str(x),max(32,int(x-24)),max(32,int(y-45)),48,64)
    for x in range(25,755,54):
        if abs(x-400)>65:
            s.tree(x,24,.75)
        if abs(x-400)>55:
            s.tree(x,520,.85)
    for x,y in [(326,345),(465,334),(105,319),(302,202),(691,339)]:
        s.rock(x,y,.63)
        s.grass(x+14,y+7)


def receiving(s):
    s.floor()
    s.shelf(87,62,135)
    s.shelf(490,62,178)
    s.solid('arrival-shelves-left',64,64,160,32)
    s.solid('arrival-shelves-right',480,64,192,64)
    # Freight desk: ledger, balance scale and incoming grain samples.
    s.table(96,331,161,65)
    s.rect(155,336,40,27,'#d3c094','#6c6044',1)
    s.path('M175 337v24M159 343h11M159 348h10M180 343h10M180 348h9',stroke='#7f7c60')
    s.path('M124 354v-25M108 334h33M112 334l-7 13h15ZM137 334l-7 13h15Z',stroke='#b0a56d',width=2)
    s.lamp(233,338)
    s.solid('freight-desk',96,320,160,96)
    for x,y in [(542,356),(574,374),(617,352)]:
        s.sack(x,y)
    s.crate(651,362,43,44)
    s.crate(617,398,47,35)
    s.solid('received-grain',512,320,192,128)
    # Broken handcart and wooden tally board explain why the mill stood quiet.
    s.table(510,166,115,40)
    s.wheel(519,204,15)
    s.wheel(613,204,15)
    s.path('M621 169l40-20M621 195l40-20',stroke='#563e2b',width=6)
    s.solid('handcart',512,160,128,64)
    for x,y in [(99,180),(132,197)]:
        s.barrel(x,y)
    s.solid('empty-casks',64,160,96,64)
    # A worn teal runner emphasizes the entrance without adding a collision.
    s.rect(366,341,68,84,'#4e7162','#a79762',2,extra='opacity=".75"')
    s.path('M375 350h50v65h-50ZM386 382l13-15 14 15-14 15Z',stroke='#aaa76e',width=2)


def grain_store(s):
    s.floor()
    for x,y in [(82,64),(481,64),(496,342)]:
        s.rect(x,y,181,70,'#483b27','#302c22',4)
        for xx in range(x+23,x+168,34):
            s.sack(xx,y+25,s.rng.choice(['#a58c5c','#c1a878','#aa975f']))
            s.sack(xx+5,y+51)
        s.path(f'M{x} {y+67}h180M{x+5} {y+7}v66M{x+174} {y+7}v66',stroke='#6e4f2e',width=7)
        s.solid('grain-bin-'+str(x)+str(y),x//32*32,y//32*32,192,64 if x == 82 else 96)
    s.table(94,345,168,48)
    for xx in range(115,250,27):
        s.sack(xx,352,'#d0b97d')
    s.solid('grain-sorting-bench',96,320,192,96)
    s.barrel(652,178,1.2)
    s.solid('seed-barrel',640,160,64,64)
    for x in [293,469]:
        s.path(f'M{x} 45v157',stroke='#443522',width=10)
        s.path(f'M{x-2} 45v153',stroke='#a88350',width=3)


def drying_room(s):
    s.floor(stone=True)
    for x,y in [(70,58),(481,58),(80,338),(489,341)]:
        s.rect(x,y,174,73,'#414735','#2c3328',4)
        s.rect(x+8,y+7,158,54,'#ac9156','#77613b',2)
        for xx in range(x+14,x+162,9):
            s.path(f'M{xx} {y+11}v42',stroke='#d0b574',width=2)
        for yy in [y+18,y+39]:
            s.path(f'M{x+10} {yy}h155',stroke='#816432',width=2)
        s.solid('drying-rack-'+str(x),x//32*32,y//32*32,192,96)
    s.rect(530,169,99,50,'#463d2e','#272b22',3)
    s.path('M538 201h80M548 191h65M560 181h40',stroke='#ab7c43',width=4)
    s.ellipse(579,196,35,23,'url(#lamp)')
    s.pipe('M578 169V138H686V42',13)
    s.solid('banked-drying-stove',512,160,128,64)
    s.lamp(126,179)


def wheel_house(s):
    s.floor(stone=True,damp=True)
    s.rect(467,39,231,187,'#333e31','#282f27',7)
    s.rect(482,51,202,161,'url(#water)','#65715a',6)
    for yy in range(65,211,18):
        s.path(f'M490 {yy}q65 13 181 0',stroke='#85aca0',extra='opacity=".36"')
    s.wheel(578,127,72)
    s.pipe('M583 129H706V422',18)
    s.solid('waterwheel-basin',480,32,224,192)
    s.table(96,352,166,45)
    s.wheel(137,365,25,True)
    s.path('M193 357l42 20M200 380l30-29',stroke='#d0b179',width=6)
    s.solid('wheelwright-tools',96,320,192,96)
    s.barrel(121,77)
    s.solid('grease-barrel',96,64,64,64)
    s.pipe('M71 190H268V66',14)
    s.wheel(269,176,26)
    s.solid('sluice-controls',256,160,32,64)
    for x,y in [(548,368),(593,390),(637,362)]:
        s.rock(x,y,1.3)
    s.solid('river-stones',512,352,160,64)


def sluice_gallery(s):
    s.floor(stone=True,damp=True)
    # Water channels flank a dry, wide center causeway and crossing.
    for x in [78,493]:
        for y,h in [(64,153),(334,99)]:
            s.rect(x,y,159,h,'#344b3b','#262e26',5)
            s.rect(x+8,y+5,143,h-10,'url(#water)',radius=4)
            for yy in range(y+16,y+h,17):
                s.path(f'M{x+20} {yy}q36 7 105 0',stroke='#83aaa0',extra='opacity=".35"')
            # Northwest action anchor at 6,4 sits on its own stone landing.
            if x==78 and y==64:
                s.rect(169,117,70,56,'url(#stone)','#b4ad81',3)
                s.solid('sluice-northwest-upper',64,64,192,32)
                s.solid('sluice-northwest-left',64,96,96,128)
                s.solid('sluice-northwest-lower',160,192,96,32)
            else:
                s.solid('sluice-'+str(x)+str(y),x//32*32,y//32*32,192,(h//32+1)*32)
    s.pipe('M292 53V211M454 52V213',12)
    s.wheel(295,98,24)
    s.wheel(457,178,24)
    s.solid('western-valve',288,64,32,64)
    s.solid('eastern-valve',448,160,32,64)
    s.lamp(334,186)
    s.lamp(449,365)


def maintenance(s):
    s.floor()
    s.table(87,59,186,49)
    s.shelf(483,61,177)
    for x in [113,150,188,220]:
        s.path(f'M{x} 76l18 18M{x+3} 76l-3-11 10-2 6 9Z',stroke='#c0b282',width=4)
    s.solid('repair-bench',64,64,224,64)
    s.solid('spare-parts',480,64,192,64)
    s.stairs(562,328,98,99)
    s.solid('loft-stairs',544,320,128,128)
    s.wheel(139,367,48,True)
    s.wheel(238,357,32,True)
    s.solid('spare-gears',64,320,224,96)
    s.barrel(112,177)
    s.solid('oil-cask',96,160,32,64)
    s.table(506,169,116,38)
    s.rect(528,174,71,24,'#c2b283','#7b7654',1)
    s.path('M536 187h48M544 178v17M572 178v17',stroke='#697c64',width=2)
    s.solid('mill-plan',512,160,128,64)


def loft(s):
    s.floor()
    for x,y in [(71,59),(503,59),(75,342)]:
        s.rect(x,y,182,58,'#4c3828','#2e2820',3)
        s.rect(x+9,y+8,162,35,'#a99865','#766440',3)
        s.path(f'M{x+13} {y+11}l156 27M{x+18} {y+31}h140',stroke='#c1ad72',width=3)
        s.solid('loft-hay-'+str(x)+str(y),x//32*32,y//32*32,192,96)
    # Hoist and hatch occupy the east corner, with a safe rail.
    s.rect(500,337,171,89,'#232d26','#b18b50',4)
    s.path('M509 344l149 74M514 413l144-70',stroke='#59442d',width=8)
    s.wheel(631,355,24)
    s.path('M629 350V96M640 350V96',stroke='#ccb078',width=3)
    s.solid('hoist-hatch',480,320,224,128)
    for x in [299,451]:
        s.rect(x,40,10,184,'url(#timber)','#403322')
        s.path(f'M{x-15} 42l25 50 23-50',stroke='#4f3825',width=7)
    s.solid('roof-brace-west',288,64,32,96)
    s.solid('roof-brace-east',448,64,32,96)
    s.barrel(120,191)
    s.solid('loft-cask',96,160,64,64)


def root_cellar(s):
    s.floor(stone=True,damp=True)
    s.shelf(69,61,195)
    s.shelf(488,63,183)
    s.solid('preserve-shelves-west',64,64,224,32)
    s.solid('preserve-shelves-east',480,64,224,64)
    for x,y in [(119,359),(179,371),(239,355),(545,371),(613,373)]:
        s.barrel(x,y,1.2)
    s.solid('root-casks-west',64,320,224,96)
    s.solid('root-casks-east',512,320,160,96)
    for x in [64,706]:
        s.path(f'M{x} 44q-17 70 7 144q-26-29-36-18M{x} 70q40 35 34 103',stroke='#3e422d',width=10)
        s.path(f'M{x} 44q-17 70 7 144',stroke='#7a7649',width=4)
    s.solid('western-root-column',32,96,32,128)
    s.solid('eastern-root-column',704,96,32,128)
    s.rock(591,194,1.8)
    s.path('M562 190q20-20 41-1M585 175q-10-19-1-30',stroke='#687a46',width=6)
    s.solid('root-fall',544,160,96,64)
    for x,y in [(170,177),(185,190),(199,177)]:
        s.path(f'M{x} {y}v13',stroke='#c2bc90',width=3)
        s.ellipse(x,y,8,4,'#78947a','#476b56')


def mill_heart(s):
    s.floor(stone=True,damp=True)
    # The defeated warden is never baked into the scene. An ancient millstone
    # gives the arena a distinct focal point while leaving center interaction open.
    s.ellipse(398,272,130,76,'#484d38','#beb280')
    s.ellipse(398,268,113,66,'#a09571','#555b41')
    s.ellipse(398,267,100,56,'none','#c8ba86')
    s.ellipse(398,267,29,16,'#78815e','#bdb582')
    for a in range(0,360,30):
        xx=398+math.cos(math.radians(a))*86
        yy=267+math.sin(math.radians(a))*48
        s.path(f'M{xx:.1f} {yy:.1f}l{math.cos(math.radians(a+30))*16:.1f} {math.sin(math.radians(a+30))*10:.1f}',stroke='#6a7150',width=3)
    s.wheel(583,118,64,True)
    s.pipe('M584 113H697V421',18)
    s.solid('heart-drive-gear',512,64,160,96)
    for x,y,w,h in [(75,53,205,55),(79,351,194,68),(490,354,182,67)]:
        s.rect(x,y,w,h,'#4b4b34','#2d3729',8)
        for xx in range(x+17,x+w,38):
            s.rock(xx,y+21,.9)
        s.path(f'M{x+8} {y+h-10}q34-70 75-20t{w-89} 0',stroke='#6f7342',width=9)
        s.path(f'M{x+8} {y+h-12}q34-70 75-20t{w-89} 0',stroke='#a09757',width=3)
        s.solid('ancient-root-'+str(x),x//32*32,y//32*32,(w//32+1)*32,(h//32+1)*32)
    for x,y in [(122,171),(666,192),(298,353),(457,353)]:
        s.lamp(x,y,1.2)


def tailrace(s):
    outdoor(s,pool=True)
    # A retired millstone, restored causeway, and jetty make the return distinct.
    s.ellipse(127,179,44,25,'#505840','#343c2d')
    s.ellipse(127,170,43,24,'#b0a77e','#606a4d')
    s.ellipse(127,170,11,6,'#4d6147','#c7bb8c')
    s.solid('retired-millstone',96,160,64,64)
    s.path('M321 214L469 214',stroke='#5b5036',width=11)
    s.path('M321 214L469 214',stroke='#b4a075',width=5)
    s.path('M321 209v-31M469 209v-31',stroke='#645337',width=8)
    s.solid('causeway-rail',320,192,160,32)


BUILDERS = {'approach': lambda s: outdoor(s), 'heron-pool': lambda s: outdoor(s, True),
            'receiving': receiving, 'grain-store': grain_store, 'drying-room': drying_room,
            'wheel-house': wheel_house, 'sluice-gallery': sluice_gallery,
            'maintenance': maintenance, 'loft': loft, 'root-cellar': root_cellar,
            'mill-heart': mill_heart, 'tailrace': tailrace}


def validate_map(scene):
    """Check geometry, cardinal connectivity, required actions and boundary."""
    blocked=set()
    for obj in scene.solids:
        if obj['x'] < 0 or obj['y'] < 0 or obj['x']+obj['width'] > WIDTH or obj['y']+obj['height'] > HEIGHT:
            raise ValueError(f'{scene.key}: out-of-bounds solid {obj}')
        for y in range(16):
            for x in range(24):
                if obj['x'] <= x*32+16 < obj['x']+obj['width'] and obj['y'] <= y*32+16 < obj['y']+obj['height']:
                    blocked.add((x,y))
    for anchor in ANCHORS:
        if anchor in blocked:
            raise ValueError(f'{scene.key}: blocked anchor {anchor}')
    visited=set()
    todo=[(12,12)]
    while todo:
        pos=todo.pop()
        if pos in visited or pos in blocked:
            continue
        x,y=pos
        if not (0<=x<24 and 0<=y<16):
            continue
        visited.add(pos)
        todo.extend([(x+1,y),(x-1,y),(x,y+1),(x,y-1)])
    for anchor in ANCHORS:
        if anchor not in visited:
            raise ValueError(f'{scene.key}: unreachable anchor {anchor}')
    edge={(x,y) for x in range(24) for y in range(16) if x in [0,23] or y in [0,15]}
    if not edge <= blocked:
        raise ValueError(f'{scene.key}: open boundary')
    return len(visited)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True,help='Candidate output root containing art/ and maps/.')
    parser.add_argument('--rooms',nargs='+',choices=BUILDERS,default=list(BUILDERS))
    args=parser.parse_args()
    for sub in ['art','maps']:
        (args.output/sub).mkdir(parents=True,exist_ok=True)
    for key in args.rooms:
        scene=Scene(key)
        BUILDERS[key](scene)
        reachable=validate_map(scene)
        (args.output/'art'/f'{key}.svg').write_text(scene.finish())
        (args.output/'maps'/f'{key}.json').write_text(json.dumps(scene.tiled(),indent=2)+'\n')
        print(f'{key}: {len(scene.solids)} solids; {reachable} connected walkable tiles; all 7 anchors reachable')


if __name__ == '__main__':
    main()
