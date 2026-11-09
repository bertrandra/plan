# Decoupe une zone d'un echantillon du banc (RGBA brut) avec une grille de coordonnees, pour
# regarder de pres ce que le detecteur voit.
#   python3 -I zone.py <dossier-jeu> <nom> <x> <y> <largeur> <hauteur> <sortie.png> [pas-de-grille]
import sys, json
import numpy as np
from PIL import Image, ImageDraw
dossier, nom = sys.argv[1:3]
x0, y0, w, h = map(int, sys.argv[3:7])
sortie = sys.argv[7]
pas = int(sys.argv[8]) if len(sys.argv) > 8 else 0
m = json.load(open(f'{dossier}/{nom}.json'))
a = np.frombuffer(open(f'{dossier}/{nom}.rgba', 'rb').read(), dtype=np.uint8).reshape(m['hauteur'], m['largeur'], 4)
z = Image.fromarray(a[max(0, y0):y0 + h, max(0, x0):x0 + w, :3].copy())
k = max(1, min(4, 1400 // max(z.size)))
if k > 1: z = z.resize((z.size[0] * k, z.size[1] * k), Image.NEAREST)
elif max(z.size) > 1600:
    f = 1600 / max(z.size); z = z.resize((round(z.size[0] * f), round(z.size[1] * f)), Image.LANCZOS); k = f
if pas:
    d = ImageDraw.Draw(z)
    for x in range((x0 // pas + 1) * pas, x0 + w, pas):
        d.line([((x - x0) * k, 0), ((x - x0) * k, z.size[1])], fill=(255, 255, 0)); d.text(((x - x0) * k + 2, 2), str(x), fill=(255, 0, 255))
    for y in range((y0 // pas + 1) * pas, y0 + h, pas):
        d.line([(0, (y - y0) * k), (z.size[0], (y - y0) * k)], fill=(255, 255, 0)); d.text((2, (y - y0) * k + 2), str(y), fill=(255, 0, 255))
z.save(sortie); print(sortie, z.size, 'facteur', k)
