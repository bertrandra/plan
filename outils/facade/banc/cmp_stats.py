# Lit les annotations CMP (suite d'elements <object>, coordonnees normalisees) : statistiques par
# image, et trace de controle d'une image.
import re, sys, glob, json, statistics
from PIL import Image, ImageDraw
base = sys.argv[1]
def objets(xml):
    t = open(xml, encoding='latin-1').read()
    res = []
    for o in re.findall(r'<object>(.*?)</object>', t, re.S):
        xs = [float(v) for v in re.findall(r'<x>\s*([-\d.eE]+)\s*</x>', o)]
        ys = [float(v) for v in re.findall(r'<y>\s*([-\d.eE]+)\s*</y>', o)]
        lab = int(re.search(r'<label>\s*(\d+)\s*</label>', o).group(1))
        if len(xs) >= 2 and len(ys) >= 2:
            # Dans ce jeu, <x> est la ligne (fraction de la hauteur) et <y> la colonne (fraction de
            # la largeur) : on rend (classe, col0, col1, lig0, lig1).
            res.append((lab, min(ys), max(ys), min(xs), max(xs)))
    return res
stats = []
for xml in sorted(glob.glob(base + '/*.xml')):
    nom = xml[:-4]
    w, h = Image.open(nom + '.jpg').size
    ob = objets(xml)
    fen = [(o[1] * w, o[2] * w, o[3] * h, o[4] * h) for o in ob if o[0] == 3]
    por = [o for o in ob if o[0] == 4]
    bou = [o for o in ob if o[0] == 12]
    if not fen: continue
    lw = statistics.median([f[1] - f[0] for f in fen]); lh = statistics.median([f[3] - f[2] for f in fen])
    stats.append({'nom': nom.split('/')[-1], 'w': w, 'h': h, 'fen': len(fen), 'por': len(por), 'bou': len(bou), 'lw': round(lw), 'lh': round(lh)})
json.dump(stats, open(sys.argv[2], 'w'))
print(len(stats), 'images ; fenetres medianes :', statistics.median([s['fen'] for s in stats]), 'par image ; largeur mediane', statistics.median([s['lw'] for s in stats]), 'px')
if len(sys.argv) > 3:
    nom = sys.argv[3]
    im = Image.open(f'{base}/{nom}.jpg').convert('RGB'); w, h = im.size
    d = ImageDraw.Draw(im)
    for lab, x0, x1, y0, y1 in objets(f'{base}/{nom}.xml'):
        if lab in (3, 4, 12):
            d.rectangle([x0 * w, y0 * h, x1 * w, y1 * h], outline={3: (255, 0, 0), 4: (0, 255, 0), 12: (0, 120, 255)}[lab], width=2)
    im.save(sys.argv[4]); print(nom, im.size)
