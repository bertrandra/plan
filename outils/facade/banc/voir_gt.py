# Trace l'annotation d'un echantillon du banc (RGBA brut + JSON) dans un PNG reduit.
import sys, json
import numpy as np
from PIL import Image, ImageDraw
dossier, nom, sortie = sys.argv[1:4]
m = json.load(open(f'{dossier}/{nom}.json'))
a = np.frombuffer(open(f'{dossier}/{nom}.rgba', 'rb').read(), dtype=np.uint8).reshape(m['hauteur'], m['largeur'], 4)
im = Image.fromarray(a[..., :3].copy())
k = min(1, 1500 / max(im.size))
im = im.resize((round(im.size[0] * k), round(im.size[1] * k)), Image.LANCZOS)
d = ImageDraw.Draw(im)
for i, b in enumerate(m['gt']):
    c = (255, 160, 0) if b.get('difficile') else (255, 0, 0)
    d.rectangle([b['x'] * k, b['y'] * k, (b['x'] + b['l']) * k, (b['y'] + b['h']) * k], outline=c, width=3)
for b in m.get('ignorer', []):
    d.rectangle([b['x'] * k, b['y'] * k, (b['x'] + b['l']) * k, (b['y'] + b['h']) * k], outline=(0, 120, 255), width=2)
im.save(sortie)
print(nom, im.size, len(m['gt']), 'ouvertures')
