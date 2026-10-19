"""Vorher | Nachher nebeneinander, mit Beschriftung. Aufruf:
python nebeneinander.py <ziel.png> <titel> <vorher.png> <nachher.png> [<hoehe>]
"""
import sys
from PIL import Image, ImageDraw, ImageFont

ziel, titel, links, rechts = sys.argv[1:5]
hoehe = int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5] != '-' else None
marke_links = sys.argv[6] if len(sys.argv) > 6 else 'Vorher'
marke_rechts = sys.argv[7] if len(sys.argv) > 7 else 'Nachher (Simulation)'

a = Image.open(links).convert('RGB')
b = Image.open(rechts).convert('RGB')
if hoehe:
    a = a.crop((0, 0, a.width, min(hoehe, a.height)))
    b = b.crop((0, 0, b.width, min(hoehe, b.height)))
rand, kopf, abstand = 24, 76, 32
breite = a.width + b.width + abstand + 2 * rand
hoch = max(a.height, b.height) + kopf + rand
bild = Image.new('RGB', (breite, hoch), (255, 255, 255))
zeichnen = ImageDraw.Draw(bild)
try:
    schrift = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 26)
    fett = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 28)
except OSError:
    schrift = fett = ImageFont.load_default()
zeichnen.text((rand, 8), titel, fill=(20, 20, 20), font=fett)
zeichnen.text((rand, 42), marke_links, fill=(170, 40, 40), font=schrift)
zeichnen.text((rand + a.width + abstand, 42), marke_rechts, fill=(30, 120, 60), font=schrift)
bild.paste(a, (rand, kopf))
bild.paste(b, (rand + a.width + abstand, kopf))
zeichnen.rectangle([rand - 1, kopf - 1, rand + a.width, kopf + a.height], outline=(200, 200, 200))
x2 = rand + a.width + abstand
zeichnen.rectangle([x2 - 1, kopf - 1, x2 + b.width, kopf + b.height], outline=(200, 200, 200))
bild.save(ziel)
print(ziel, bild.size)
