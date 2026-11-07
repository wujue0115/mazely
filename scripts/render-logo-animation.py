"""Render a logo-only GIF using Studio wall geometry and real Mazely steps.

Run: python3 scripts/render-logo-animation.py
Requires Pillow, FFmpeg, installed workspace dependencies and built core.
"""
import json
from pathlib import Path
import subprocess
import tempfile

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads(subprocess.check_output(
    ['node', '--import', 'tsx', str(ROOT / 'scripts/logo-animation.mjs')], cwd=ROOT))
OUT = ROOT / 'assets/readme'
OUT.mkdir(parents=True, exist_ok=True)
W, H, FPS, SCALE = 544, 536, 20, 3
CELL, OX, OY = 8, 32, 32
BG = (14, 14, 14)
CYAN = (144, 247, 255)
WALL = (105, 169, 176)
VISIT = (27, 66, 73)
CENTERS = {key: point for c in DATA['components'] for key, point in c['centers'].items()}


def clamp(t):
    return max(0, min(1, t))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def world(p):
    return ((OX + p['x'] * CELL) * SCALE, (OY + p['y'] * CELL) * SCALE)


def point(cell):
    return world(CENTERS[cell])


def draw_frame(t):
    im = Image.new('RGB', (W * SCALE, H * SCALE), BG)
    d = ImageDraw.Draw(im)
    reveal = clamp((t - 0.6) / 0.65)
    fade = clamp((t - 10.4) / 1.0)
    alpha = reveal * (1 - fade)
    generation = clamp((t - 1.25) / 3.6)
    exploring = clamp((t - 5.1) / 1.8)
    solving = clamp((t - 7.0) / 1.3)
    base = mix(CYAN, BG, alpha)
    wall_color = mix(CYAN, WALL, alpha)
    for comp in DATA['components']:
        count = int(len(comp['generationHeads']) * generation)
        growing = comp['algorithm'] != 'recursive-division'
        cell_base = mix(BG, CYAN, fade) if growing else base
        stroke = mix(mix(BG, WALL, reveal), CYAN, fade) if growing else wall_color
        path_color = CYAN
        # Studio fills cells, draws closed boundaries, then draws centered paths.
        for cell in comp['cells']:
            x, y = point(cell)
            half = CELL * SCALE / 2
            fill = cell_base if comp['revealedAt'][cell] <= count else BG
            d.rectangle((x-half, y-half, x+half, y+half), fill=fill)
        if exploring:
            n = int(len(comp['visits']) * exploring)
            for cell in comp['visits'][:n]:
                x, y = point(cell)
                half = CELL * SCALE / 2
                d.rectangle((x-half, y-half, x+half, y+half), fill=mix(VISIT, CYAN, fade))
        for wall in comp['walls']:
            closed = wall['initialClosed']
            for step, state in wall['changes']:
                if step > count:
                    break
                closed = state
            if wall['revealedAt'] <= count and closed:
                d.line((world(wall['from']), world(wall['to'])), fill=stroke, width=3)
        if solving:
            n = max(1, int(len(comp['path']) * solving))
            points = [point(cell) for cell in comp['path'][:n]]
            if len(points) > 1:
                # Same relative path width as Studio SVG export: 0.18 cell units.
                d.line(points, fill=path_color, width=round(CELL * SCALE * 0.18), joint='curve')
        head = None
        if 0 < generation < 1 and count:
            head = comp['generationHeads'][count-1]
        elif 0 < exploring < 1 and comp['visits']:
            head = comp['visits'][max(0, int(len(comp['visits']) * exploring)-1)]
        elif 0 < solving < 1:
            head = comp['path'][max(0, int(len(comp['path']) * solving)-1)]
        if head:
            x, y = point(head)
            radius = CELL * SCALE * 0.22
            d.ellipse((x-radius, y-radius, x+radius, y+radius), fill=CYAN)
    # Hold the completed solid logo, then fade out before the next generation.
    restart = clamp((t - 12.8) / 0.8)
    if restart:
        im = Image.blend(im, Image.new('RGB', im.size, BG), restart)
    return im.resize((W, H), Image.Resampling.LANCZOS)


with tempfile.TemporaryDirectory(prefix='mazely-logo-') as temp:
    temp = Path(temp)
    for i in range(280):
        frame = draw_frame(i / FPS)
        frame.save(temp / f'{i:04d}.png')
        if i == 180:
            frame.save(OUT / 'logo-maze-preview.png')
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', str(FPS),
        '-i', str(temp / '%04d.png'), '-filter_complex',
        '[0:v]split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none',
        '-loop', '0', str(OUT / 'logo-maze.gif'),
    ], check=True)
print(f"Created {OUT / 'logo-maze.gif'}")
