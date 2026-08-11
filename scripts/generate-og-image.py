#!/usr/bin/env python3
"""Compose public/brand/og-image.png (1200x630) from the brand logo.

Run with a Python that has Pillow, e.g.:
  demo/.venv-deck/bin/python scripts/generate-og-image.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / 'public' / 'brand' / 'guidelight-logo.png'
OUT = ROOT / 'public' / 'brand' / 'og-image.png'

W, H = 1200, 630
INK = (16, 24, 40)  # --brand-guide (light theme): #101828
TAGLINE = 'From evidence comes excellence'

logo = Image.open(LOGO).convert('RGBA')

# Sample the logo's own background so the card matches the brand paper tone
bg = logo.convert('RGB').getpixel((2, 2))
card = Image.new('RGB', (W, H), bg)

# Logo at 2x, centred slightly above the middle
scale = 2
logo_big = logo.resize((logo.width * scale, logo.height * scale), Image.LANCZOS)
# Flatten onto the card background in case of transparency
lx = (W - logo_big.width) // 2
ly = H // 2 - logo_big.height // 2 - 30
card.paste(logo_big, (lx, ly), logo_big)

draw = ImageDraw.Draw(card)
font_path = '/System/Library/Fonts/Supplemental/Georgia.ttf'
font = ImageFont.truetype(font_path, 34)
tw = draw.textlength(TAGLINE, font=font)
draw.text(((W - tw) / 2, ly + logo_big.height + 48), TAGLINE, font=font, fill=INK)

card.save(OUT, optimize=True)
print(f'wrote {OUT} ({OUT.stat().st_size} bytes), background {bg}')
