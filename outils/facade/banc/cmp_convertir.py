# Convertit une selection du jeu CMP Facade au format du banc : RGBA brut + JSON (fenetres et portes
# a trouver, vitrines ignorees). Selection reproductible : fenetres assez grandes, facades lisibles.
import re, sys, json, random
import numpy as np
from PIL import Image
base, stats, sortie_e, sortie_c = sys.argv[1:5]
n_e, n_c = int(sys.argv[5]), int(sys.argv[6])
def objets(xml):
    t = open(xml, encoding='latin-1').read()
    res = []
    for o in re.findall(r'<object>(.*?)</object>', t, re.S):
        xs = [float(v) for v in re.findall(r'<x>\s*([-\d.eE]+)\s*</x>', o)]
        ys = [float(v) for v in re.findall(r'<y>\s*([-\d.eE]+)\s*</y>', o)]
        lab = int(re.search(r'<label>\s*(\d+)\s*</label>', o).group(1))
        if len(xs) >= 2 and len(ys) >= 2:
            res.append((lab, min(ys), max(ys), min(xs), max(xs)))  # <x> = ligne, <y> = colonne
    return res
s = [x for x in json.load(open(stats)) if x['lw'] >= 45 and 3 <= x['fen'] <= 40]
random.Random(20261109).shuffle(s)
choix = s[: n_e + n_c]
for i, x in enumerate(choix):
    nom = x['nom']
    im = Image.open(f'{base}/{nom}.jpg').convert('RGBA')
    W, H = im.size
    gt, ign = [], []
    for lab, c0, c1, l0, l1 in objets(f'{base}/{nom}.xml'):
        b = {'x': round(c0 * W), 'y': round(l0 * H), 'l': round((c1 - c0) * W), 'h': round((l1 - l0) * H)}
        if b['l'] < 3 or b['h'] < 3: continue
        if lab == 3 or lab == 4:
            b['classe'] = 'fenetre' if lab == 3 else 'porte'
            if b['l'] < 14 or b['h'] < 14: b['difficile'] = True
            gt.append(b)
        elif lab == 12:
            ign.append(b)
    d = sortie_e if i < n_e else sortie_c
    open(f'{d}/{nom}.rgba', 'wb').write(np.asarray(im).tobytes())
    json.dump({'nom': nom, 'groupe': 'cmp', 'largeur': W, 'hauteur': H, 'pxParM': None, 'gt': gt, 'ignorer': ign}, open(f'{d}/{nom}.json', 'w'))
print(len(s), 'eligibles ;', n_e, 'en entrainement,', n_c, 'caches')
