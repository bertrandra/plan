# Les six variantes de la maison du jeu final (celui qui ne sert a aucune mise au point) : d'autres
# vues et d'autres transformations que celles du jeu tenu a l'ecart.
#   python3 -I variantes_final.py <jeu final (sortie)> <jeu d'entrainement> <jeu tenu a l'ecart>
import sys, json
import numpy as np
from PIL import Image
dst = sys.argv[1]
def lire(dossier, nom):
    m = json.load(open(f'{dossier}/{nom}.json'))
    W, H = m['largeur'], m['hauteur']
    a = np.frombuffer(open(f'{dossier}/{nom}.rgba', 'rb').read(), dtype=np.uint8).reshape(H, W, 4)
    vu = np.frombuffer(open(f'{dossier}/{nom}.vu', 'rb').read(), dtype=np.uint8).reshape(H, W)
    return m, a, vu
def ecrire(nom, img, masque, gt, ign, pxm):
    h, w = img.shape[:2]
    open(f'{dst}/{nom}.rgba', 'wb').write(np.ascontiguousarray(img).tobytes())
    open(f'{dst}/{nom}.vu', 'wb').write(np.ascontiguousarray(masque).tobytes())
    json.dump({'nom': nom, 'groupe': 'maison', 'largeur': w, 'hauteur': h, 'pxParM': pxm, 'gt': gt, 'ignorer': ign}, open(f'{dst}/{nom}.json', 'w'), ensure_ascii=False)
    print(nom, w, h, len(gt))
def miroir(m, a, vu, nom):
    W = m['largeur']; f = lambda b: {**b, 'x': W - b['x'] - b['l']}
    ecrire(nom, a[:, ::-1], vu[:, ::-1], [f(b) for b in m['gt']], [f(b) for b in m['ignorer']], m['pxParM'])
def echelle(m, a, vu, k, nom, gamma=1.0):
    W, H = m['largeur'], m['hauteur']; w, h = round(W * k), round(H * k)
    im = np.asarray(Image.fromarray(a).resize((w, h), Image.LANCZOS)).copy()
    vm = (np.asarray(Image.fromarray(vu * 255).resize((w, h), Image.NEAREST)) > 0).astype(np.uint8)
    if gamma != 1.0:
        f = im[..., :3].astype(np.float32) / 255
        im[..., :3] = np.clip(np.power(f, gamma) * 255, 0, 255).astype(np.uint8)
        im[vm == 0, :3] = 255
    g = lambda b: {**b, 'x': round(b['x'] * k), 'y': round(b['y'] * k), 'l': round(b['l'] * k), 'h': round(b['h'] * k)}
    ecrire(nom, im, vm, [g(b) for b in m['gt']], [g(b) for b in m['ignorer']], None)
E, C = sys.argv[2], sys.argv[3]
miroir(*lire(E, 'maison-n'), 'maison-n-miroir')
miroir(*lire(E, 'maison-vue2'), 'maison-vue2-miroir')
echelle(*lire(E, 'maison-u'), 0.7, 'maison-u-70-clair', 0.75)      # 70 % de la taille, plus claire
echelle(*lire(E, 'maison-n'), 0.6, 'maison-n-60-sombre', 1.5)      # 60 %, plus sombre
miroir(*lire(C, 'maison-vue1'), 'maison-vue1-miroir')
echelle(*lire(C, 'maison-vue3'), 0.8, 'maison-vue3-80', 1.0)
