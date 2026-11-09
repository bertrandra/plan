# Variantes de controle de la facade de l'utilisateur, pour le jeu cache : miroir, demi-resolution,
# assombrie. Un detecteur aux seuils ajustes a une image y trebuche.
import sys, json
import numpy as np
from PIL import Image
src, dst = sys.argv[1:3]
m = json.load(open(f'{src}/maison-u.json'))
W, H = m['largeur'], m['hauteur']
a = np.frombuffer(open(f'{src}/maison-u.rgba', 'rb').read(), dtype=np.uint8).reshape(H, W, 4)
vu = np.frombuffer(open(f'{src}/maison-u.vu', 'rb').read(), dtype=np.uint8).reshape(H, W)
def ecrire(nom, img, masque, f, gt, ign, pxm):
    h, w = img.shape[:2]
    open(f'{dst}/{nom}.rgba', 'wb').write(np.ascontiguousarray(img).tobytes())
    open(f'{dst}/{nom}.vu', 'wb').write(np.ascontiguousarray(masque).tobytes())
    json.dump({'nom': nom, 'groupe': 'maison', 'largeur': w, 'hauteur': h, 'pxParM': pxm, 'gt': gt, 'ignorer': ign}, open(f'{dst}/{nom}.json', 'w'), ensure_ascii=False)
    print(nom, w, h)
miroir = lambda b: {**b, 'x': W - b['x'] - b['l']}
ecrire('maison-u-miroir', a[:, ::-1], vu[:, ::-1], 1, [miroir(b) for b in m['gt']], [miroir(b) for b in m['ignorer']], m['pxParM'])
im = Image.fromarray(a).resize((W // 2, H // 2), Image.BOX)
vm = Image.fromarray(vu * 255).resize((W // 2, H // 2), Image.NEAREST)
demi = lambda b: {**b, 'x': b['x'] // 2, 'y': b['y'] // 2, 'l': b['l'] // 2, 'h': b['h'] // 2}
ecrire('maison-u-demi', np.asarray(im), (np.asarray(vm) > 0).astype(np.uint8), 0.5, [demi(b) for b in m['gt']], [demi(b) for b in m['ignorer']], None)
# Assombrie : gamma 1,6 et contraste reduit (un jour gris, une photo sous-exposee).
f = a.astype(np.float32) / 255
s = (0.08 + 0.8 * np.power(f[..., :3], 1.6)) * 255
sombre = a.copy(); sombre[..., :3] = np.clip(s, 0, 255).astype(np.uint8)
sombre[vu == 0, :3] = 255
ecrire('maison-u-sombre', sombre, vu, 1, m['gt'], m['ignorer'], None)
