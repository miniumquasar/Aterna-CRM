#!/usr/bin/env python3
"""
Makes every icon and installer image from the one piece of artwork,
build/icon-source.jpg (1024 x 1024). Run it again after changing the artwork:

    python3 scripts/make-icons.py

It needs Python 3 and Pillow (pip install pillow). Its output is checked in, so
a normal build never runs it:

    build/icon.png              1024 px, the glass tile with clear corners (Linux; electron-builder's fallback)
    build/icon.ico              Windows: 16 to 256 px; the small sizes close in on the crystal so it still reads
    build/icon.icns             macOS: the tile on Apple's grid (824 px in 1024, with a soft shadow), 16 to 1024 px
    build/installerSidebar.bmp  the installer's welcome and finish pages (164 x 314)
    build/uninstallerSidebar.bmp
    build/installerHeader.bmp   the installer's other pages (150 x 57)
    resources/icon.png          512 px, the window's icon on Linux
"""
import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
RESOURCES = ROOT / 'resources'

# Where the glass tile sits in the 1024 artwork, and its corner radius.
TILE_BOX = (128, 128, 896, 896)
TILE_RADIUS = 166
# The crystal, for the small sizes: a square centred on it.
CRYSTAL_CENTRE = (512, 500)
CRYSTAL_HALF = 300

INK = (7, 8, 12)          # the app's darkest surface
GOLD = (201, 168, 92)     # the artwork's gold line
TEXT = (236, 236, 240)
QUIET = (150, 152, 160)


def rounded_mask(size, radius, inset=0, ss=4):
    """An anti-aliased rounded rectangle, drawn large and scaled down."""
    w, h = size
    m = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle((inset * ss, inset * ss, (w - inset) * ss - 1, (h - inset) * ss - 1), radius=radius * ss, fill=255)
    return m.resize(size, Image.LANCZOS)


def tile(source):
    t = source.crop(TILE_BOX).convert('RGBA')
    t.putalpha(rounded_mask(t.size, TILE_RADIUS, inset=1))
    return t


def full(source_tile, size):
    """The whole tile, filling the square (Windows and Linux icons keep little margin)."""
    return source_tile.resize((size, size), Image.LANCZOS)


def crystal(source, size):
    """Closer in on the crystal, so it still reads at 16 to 32 px."""
    cx, cy = CRYSTAL_CENTRE
    crop = source.crop((cx - CRYSTAL_HALF, cy - CRYSTAL_HALF, cx + CRYSTAL_HALF, cy + CRYSTAL_HALF)).convert('RGBA')
    crop = ImageEnhance.Contrast(crop.resize((size * 4, size * 4), Image.LANCZOS)).enhance(1.12).resize((size, size), Image.LANCZOS)
    crop.putalpha(rounded_mask((size, size), max(2, round(size * 0.22))))
    return crop


def mac_grid(source_tile, size=1024):
    """Apple's grid: the tile 824/1024 of the canvas, centred, over a soft shadow."""
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inner = round(size * 824 / 1024)
    offset = (size - inner) // 2
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    shape = rounded_mask((inner, inner), round(TILE_RADIUS * inner / 768))
    shadow_layer = Image.new('RGBA', (inner, inner), (0, 0, 0, 110))
    shadow_layer.putalpha(shape.point(lambda v: v * 110 // 255))
    shadow.alpha_composite(shadow_layer, (offset, offset + round(size * 0.012)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=size * 0.014))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(source_tile.resize((inner, inner), Image.LANCZOS), (offset, offset))
    return canvas


def png_bytes(im):
    out = io.BytesIO()
    im.save(out, format='PNG', optimize=True)
    return out.getvalue()


def write_ico(path, images):
    """An .ico holding a PNG for each size (Windows Vista and later read PNG at any size)."""
    entries = sorted(images.items())
    header = struct.pack('<HHH', 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    directory = b''
    data = b''
    for size, im in entries:
        blob = png_bytes(im)
        directory += struct.pack('<BBBBHHII', 0 if size >= 256 else size, 0 if size >= 256 else size, 0, 0, 1, 32, len(blob), offset)
        data += blob
        offset += len(blob)
    path.write_bytes(header + directory + data)


def write_icns(path, grid_1024):
    """An .icns of PNGs: 16 to 512 at 1x, 32 to 1024 for the @2x slots."""
    types = [('icp4', 16), ('icp5', 32), ('icp6', 64), ('ic07', 128), ('ic08', 256), ('ic09', 512), ('ic10', 1024),
             ('ic11', 32), ('ic12', 64), ('ic13', 256), ('ic14', 512)]
    body = b''
    for kind, size in types:
        blob = png_bytes(grid_1024.resize((size, size), Image.LANCZOS))
        body += kind.encode('ascii') + struct.pack('>I', 8 + len(blob)) + blob
    path.write_bytes(b'icns' + struct.pack('>I', 8 + len(body)) + body)


def font(weight, size):
    for name in (f'/usr/share/fonts/opentype/inter/InterDisplay-{weight}.otf', f'/usr/share/fonts/opentype/inter/Inter-{weight}.otf'):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def sidebar(source_tile):
    """164 x 314: the tile, the name and a gold rule, on the app's ink, for the installer's first and last pages."""
    w, h = 164, 314
    im = Image.new('RGB', (w, h), INK)
    # A faint lift towards the top, as the app's screens have.
    glow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(glow).ellipse((-60, -90, w + 60, 170), fill=36)
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    im = Image.composite(Image.new('RGB', (w, h), (22, 30, 34)), im, glow)
    icon = source_tile.resize((96, 96), Image.LANCZOS)
    rgba = im.convert('RGBA')
    rgba.alpha_composite(icon, ((w - 96) // 2, 58))
    d = ImageDraw.Draw(rgba)
    name = 'AETERNA CRM'
    f = font('SemiBold', 15)
    tw = d.textlength(name, font=f)
    d.text(((w - tw) / 2, 172), name, font=f, fill=TEXT)
    d.line(((w - 36) / 2, 199, (w + 36) / 2, 199), fill=GOLD, width=1)
    q = font('Regular', 11)
    for i, line in enumerate(('Practice management', 'for UK accounting firms')):
        lw = d.textlength(line, font=q)
        d.text(((w - lw) / 2, 210 + i * 15), line, font=q, fill=QUIET)
    return rgba.convert('RGB')


def header(source_tile):
    """150 x 57: the tile beside the name, for the top-right of the installer's inner pages (a light band)."""
    w, h = 150, 57
    im = Image.new('RGBA', (w, h), (255, 255, 255, 255))
    icon = source_tile.resize((40, 40), Image.LANCZOS)
    im.alpha_composite(icon, (w - 40 - 8, (h - 40) // 2))
    d = ImageDraw.Draw(im)
    f = font('SemiBold', 12)
    tw = d.textlength('AETERNA CRM', font=f)
    d.text((w - 40 - 16 - tw, 21), 'AETERNA CRM', font=f, fill=(20, 22, 28))
    return im.convert('RGB')


def main():
    source = Image.open(BUILD / 'icon-source.jpg').convert('RGB')
    if source.size != (1024, 1024):
        raise SystemExit('build/icon-source.jpg must be 1024 x 1024')
    t = tile(source)
    RESOURCES.mkdir(exist_ok=True)
    full(t, 1024).save(BUILD / 'icon.png', optimize=True)
    full(t, 512).save(RESOURCES / 'icon.png', optimize=True)
    ico = {s: crystal(source, s) for s in (16, 20, 24, 32)}
    ico.update({s: full(t, s) for s in (40, 48, 64, 128, 256)})
    write_ico(BUILD / 'icon.ico', ico)
    write_icns(BUILD / 'icon.icns', mac_grid(t))
    sb = sidebar(t)
    sb.save(BUILD / 'installerSidebar.bmp')
    sb.save(BUILD / 'uninstallerSidebar.bmp')
    header(t).save(BUILD / 'installerHeader.bmp')
    print('made: build/icon.png, icon.ico, icon.icns, installerSidebar.bmp, uninstallerSidebar.bmp, installerHeader.bmp; resources/icon.png')


if __name__ == '__main__':
    main()
