# Les familles de variantes de la mesure large, a partir du jeu d'entrainement : la meme image dans
# d'autres conditions. Une image seule bouge de 0,05 d'un cadrage a l'autre : on ne juge un
# changement que sur toutes les familles a la fois (rejouer.mjs).
#
#   python3 -I familles.py <jeu d'entrainement> <dossier de sortie>
#
# Ecrit un sous-dossier par famille :
#   miroir   chaque image retournee de gauche a droite (l'echelle fournie reste fournie)
#   demi     demi-resolution (moyenne de blocs), echelle non fournie sauf facades synthetiques
#   sombre   image assombrie (gamma 1,6, contraste reduit), echelle non fournie sauf synthetiques
#   r70m     70 % (bilineaire) puis miroir : famille de CONTROLE, on n'y regle rien
#   extra    sept variantes de la maison (sans echelle, demi avec echelle, sombre + demi, sombre +
#            miroir, 75 %)
#   decal    images rognees de quelques pixels en haut a gauche (la phase des grilles de reduction)
import sys, json, os, glob
import numpy as np
from PIL import Image
src, dst = sys.argv[1:3]

def lire(nom):
    m = json.load(open(f'{src}/{nom}.json', encoding='utf-8'))
    W, H = m['largeur'], m['hauteur']
    a = np.frombuffer(open(f'{src}/{nom}.rgba', 'rb').read(), dtype=np.uint8).reshape(H, W, 4)
    vu = np.frombuffer(open(f'{src}/{nom}.vu', 'rb').read(), dtype=np.uint8).reshape(H, W) if os.path.exists(f'{src}/{nom}.vu') else None
    return m, a, vu

def ecrire(fam, nom, groupe, img, masque, gt, ign, pxm):
    os.makedirs(f'{dst}/{fam}', exist_ok=True)
    h, w = img.shape[:2]
    open(f'{dst}/{fam}/{nom}.rgba', 'wb').write(np.ascontiguousarray(img).tobytes())
    if masque is not None: open(f'{dst}/{fam}/{nom}.vu', 'wb').write(np.ascontiguousarray(masque).tobytes())
    json.dump({'nom': nom, 'groupe': groupe, 'largeur': w, 'hauteur': h, 'pxParM': pxm, 'gt': gt, 'ignorer': ign}, open(f'{dst}/{fam}/{nom}.json', 'w', encoding='utf-8'), ensure_ascii=False)

def assombrir(a, vu):
    f = a.astype(np.float32) / 255
    s = (0.08 + 0.8 * np.power(f[..., :3], 1.6)) * 255
    o = a.copy(); o[..., :3] = np.clip(s, 0, 255).astype(np.uint8)
    if vu is not None: o[vu == 0, :3] = 255
    return o

def reduire(a, vu, w, h, filtre):
    return np.asarray(Image.fromarray(a).resize((w, h), filtre)), None if vu is None else (np.asarray(Image.fromarray(vu * 255).resize((w, h), Image.NEAREST)) > 0).astype(np.uint8)

noms = sorted(os.path.basename(f)[:-5] for f in glob.glob(f'{src}/*.json'))

# miroir, demi, sombre, r70m : toutes les images du jeu.
for nom in noms:
    m, a, vu = lire(nom)
    W, H = m['largeur'], m['hauteur']
    synth = m['groupe'] == 'synth'
    pxm = m.get('pxParM')
    ign = m.get('ignorer', [])
    mir = lambda b, w=W: {**b, 'x': w - b['x'] - b['l']}
    ecrire('miroir', nom, m['groupe'], a[:, ::-1], None if vu is None else vu[:, ::-1], [mir(b) for b in m['gt']], [mir(b) for b in ign], pxm)
    w2, h2 = W // 2, H // 2
    im, vm = reduire(a, vu, w2, h2, Image.BOX)
    # Les cotes des facades synthetiques sont notees : leurs annotations restent exactes.
    demi = (lambda b: {**b, 'x': b['x'] / 2, 'y': b['y'] / 2, 'l': b['l'] / 2, 'h': b['h'] / 2}) if synth else (lambda b: {**b, 'x': b['x'] // 2, 'y': b['y'] // 2, 'l': b['l'] // 2, 'h': b['h'] // 2})
    ecrire('demi', nom, m['groupe'], im, vm, [demi(b) for b in m['gt']], [demi(b) for b in ign], pxm / 2 if (synth and pxm) else None)
    ecrire('sombre', nom, m['groupe'], assombrir(a, vu), vu, m['gt'], ign, pxm if synth else None)
    w7, h7 = int(round(W * 0.7)), int(round(H * 0.7))
    im7, vm7 = reduire(a, vu, w7, h7, Image.BILINEAR)
    fx, fy = w7 / W, h7 / H
    r7 = lambda b: {**b, 'x': w7 - (b['x'] + b['l']) * fx, 'y': b['y'] * fy, 'l': b['l'] * fx, 'h': b['h'] * fy}
    ecrire('r70m', nom, m['groupe'], im7[:, ::-1], None if vm7 is None else vm7[:, ::-1], [r7(b) for b in m['gt']], [r7(b) for b in ign], pxm * fx if pxm else None)

# extra : la maison, le groupe qui pese 0,55, dans d'autres conditions.
if 'maison-u' in noms:
    m, a, vu = lire('maison-u'); W, H = m['largeur'], m['hauteur']
    d2 = lambda b: {**b, 'x': b['x'] // 2, 'y': b['y'] // 2, 'l': b['l'] // 2, 'h': b['h'] // 2}
    ecrire('extra', 'maison-u-sansech', 'maison', a, vu, m['gt'], m['ignorer'], None)
    i2, v2 = reduire(a, vu, W // 2, H // 2, Image.BOX)
    ecrire('extra', 'maison-u-demi-ech', 'maison', i2, v2, [d2(b) for b in m['gt']], [d2(b) for b in m['ignorer']], m['pxParM'] / 2)
    s2, sv2 = reduire(assombrir(a, vu), vu, W // 2, H // 2, Image.BOX)
    ecrire('extra', 'maison-u-sombre-demi', 'maison', s2, sv2, [d2(b) for b in m['gt']], [d2(b) for b in m['ignorer']], None)
for nom in ('maison-n', 'maison-vue2'):
    if nom not in noms: continue
    m, a, vu = lire(nom); W, H = m['largeur'], m['hauteur']
    mir = lambda b: {**b, 'x': W - b['x'] - b['l']}
    ecrire('extra', nom + '-sombre-miroir', 'maison', assombrir(a, vu)[:, ::-1], vu[:, ::-1], [mir(b) for b in m['gt']], [mir(b) for b in m['ignorer']], None)
    w, h = int(round(W * 0.75)), int(round(H * 0.75))
    i3, v3 = reduire(a, vu, w, h, Image.LANCZOS)
    ech = lambda b: {**b, 'x': b['x'] * (w / W), 'y': b['y'] * (h / H), 'l': b['l'] * (w / W), 'h': b['h'] * (h / H)}
    ecrire('extra', nom + '-q3', 'maison', i3, v3, [ech(b) for b in m['gt']], [ech(b) for b in m['ignorer']], None)

# decal : rognages de k pixels en haut a gauche. La liste est celle des mesures de reference.
DECALAGES = {'maison-u': (0, 1, 2, 3, 4, 5, 7, 10), 'maison-n': (0, 1, 2, 3, 4, 5), 'maison-vue2': (0, 1, 2), 'synth-uni': (0, 1, 2, 3)}
for nom in ('cmp_b0005', 'cmp_b0025', 'cmp_b0062', 'cmp_b0114', 'cmp_b0124', 'cmp_b0204', 'cmp_b0333'): DECALAGES[nom] = (0, 1, 2, 3)
for nom, ks in DECALAGES.items():
    if nom not in noms: continue
    m, a, vu = lire(nom)
    for k in ks:
        b = lambda g: {**g, 'x': g['x'] - k, 'y': g['y'] - k}
        os.makedirs(f'{dst}/decal', exist_ok=True)
        n = f'{nom}-moins{k}'
        open(f'{dst}/decal/{n}.rgba', 'wb').write(np.ascontiguousarray(a[k:, k:]).tobytes())
        if vu is not None: open(f'{dst}/decal/{n}.vu', 'wb').write(np.ascontiguousarray(vu[k:, k:]).tobytes())
        # Un rognage garde tous les champs de l'annotation (les cotes des facades synthetiques).
        json.dump({**m, 'nom': n, 'largeur': m['largeur'] - k, 'hauteur': m['hauteur'] - k, 'gt': [b(g) for g in m['gt']], 'ignorer': [b(g) for g in m.get('ignorer', [])]}, open(f'{dst}/decal/{n}.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('familles ecrites dans', dst, ':', ' '.join(sorted(os.listdir(dst))))
