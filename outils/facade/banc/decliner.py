# Decline UN echantillon du banc en une famille de variantes : rognages de 1 a 7 px (la phase des
# grilles de reduction : c'est la premiere cause d'instabilite des detecteurs), miroir, reductions a
# 50, 70 et 85 %, image assombrie, avec ou sans echelle. Les annotations suivent.
#   python3 -I decliner.py <dossier-source> <nom> <dossier-sortie> <pxParM ou 0>
import sys, json, copy
import numpy as np
from PIL import Image
src, nom, out, pxm = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
m = json.load(open(f'{src}/{nom}.json'))
a = np.frombuffer(open(f'{src}/{nom}.rgba', 'rb').read(), dtype=np.uint8).reshape(m['hauteur'], m['largeur'], 4)
def ecrire(n, img, meta):
    meta = dict(meta); meta['nom'] = n; meta['hauteur'], meta['largeur'] = img.shape[:2]
    open(f'{out}/{n}.rgba', 'wb').write(np.ascontiguousarray(img).tobytes()); json.dump(meta, open(f'{out}/{n}.json', 'w'), ensure_ascii=False)
def boites(meta, f):
    r = copy.deepcopy(meta)
    for k in ('gt', 'ignorer'):
        r[k] = [dict(b, **f(b)) for b in meta.get(k, [])]
    return r
ecrire(nom, a, m)
if pxm: ecrire(nom + '-ech', a, dict(m, pxParM=pxm))
for k in (1, 2, 3, 5, 7):
    ecrire(f'{nom}-moins{k}', a[k:, k:], boites(m, lambda b: {'x': b['x'] - k, 'y': b['y'] - k}))
W = m['largeur']
ecrire(nom + '-miroir', a[:, ::-1], boites(m, lambda b: {'x': W - b['x'] - b['l']}))
def reduit(f):
    im = Image.fromarray(a, 'RGBA'); w, h = round(m['largeur'] * f), round(m['hauteur'] * f)
    return np.asarray(im.resize((w, h), Image.LANCZOS)), boites(m, lambda b: {'x': round(b['x'] * f), 'y': round(b['y'] * f), 'l': round(b['l'] * f), 'h': round(b['h'] * f)})
for f, s in ((0.5, 'demi'), (0.7, 'r70'), (0.85, 'r85')):
    img, meta = reduit(f); ecrire(f'{nom}-{s}', img, meta)
sombre = a.copy(); sombre[..., :3] = (a[..., :3].astype(np.float32) * 0.6).astype(np.uint8)
ecrire(nom + '-sombre', sombre, m)
img, meta = reduit(0.7); ecrire(nom + '-r70-miroir', img[:, ::-1], boites(meta, lambda b: {'x': img.shape[1] - b['x'] - b['l']}))
