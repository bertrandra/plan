# Monte, archive ou annote un jeu du banc. Les images ne sont pas dans le depot (photos privees,
# jeu public a telecharger) : le depot garde les annotations (annotations/<jeu>.json), ce script
# refait le dossier que lisent evaluer.mjs et ranger.mjs.
#
#   python3 -I jeu.py monter <annotations.json> <dossier-du-jeu> [--images <dossier de PNG>] [--cmp <dossier base/ du jeu CMP>]
#       Pour chaque echantillon annote : <images>/<nom>.png s'il existe (le canal alpha porte le masque
#       `vu` : 0 = remplissage), sinon <cmp>/<nom>.jpg pour une facade du jeu CMP. Ecrit <nom>.rgba,
#       <nom>.vu (si l'image a du remplissage ou si l'annotation le demande) et <nom>.json ; liste ce qui manque.
#   python3 -I jeu.py archiver <dossier-du-jeu> <dossier de PNG> [nom ...]
#       L'inverse : un PNG par echantillon (alpha = masque), pour garder les images hors du depot.
#   python3 -I jeu.py annoter <dossier-du-jeu> <annotations.json>
#       Range les <nom>.json d'un dossier dans un seul fichier d'annotations (un nouveau jeu).
import sys, os, json, glob
import numpy as np
from PIL import Image

def monter(pack, dst, images=None, cmp=None):
    os.makedirs(dst, exist_ok=True)
    manque, faits = [], 0
    for nom, m in json.load(open(pack, encoding='utf-8')).items():
        m = dict(m); avec_vu = m.pop('masque', False)
        png = f'{images}/{nom}.png' if images else None
        jpg = f'{cmp}/{nom}.jpg' if cmp else None
        if png and os.path.exists(png): im = Image.open(png).convert('RGBA')
        elif jpg and os.path.exists(jpg): im = Image.open(jpg).convert('RGBA')
        else:
            manque.append(nom); continue
        a = np.asarray(im).copy()
        if a.shape[1] != m['largeur'] or a.shape[0] != m['hauteur']:
            print(f'{nom} : image {a.shape[1]} x {a.shape[0]}, annotation {m["largeur"]} x {m["hauteur"]} - ecartee'); manque.append(nom); continue
        vu = (a[..., 3] > 0).astype(np.uint8)
        a[..., 3] = 255
        open(f'{dst}/{nom}.rgba', 'wb').write(a.tobytes())
        if avec_vu or vu.min() == 0: open(f'{dst}/{nom}.vu', 'wb').write(vu.tobytes())
        json.dump(m, open(f'{dst}/{nom}.json', 'w', encoding='utf-8'), ensure_ascii=False)
        faits += 1
    print(f'{faits} echantillons montes dans {dst}' + (f' ; {len(manque)} sans image : {" ".join(manque)}' if manque else ''))

def archiver(src, dst, noms):
    os.makedirs(dst, exist_ok=True)
    for f in sorted(glob.glob(f'{src}/*.json')):
        nom = os.path.basename(f)[:-5]
        if noms and nom not in noms: continue
        m = json.load(open(f, encoding='utf-8'))
        a = np.frombuffer(open(f'{src}/{nom}.rgba', 'rb').read(), dtype=np.uint8).reshape(m['hauteur'], m['largeur'], 4).copy()
        if os.path.exists(f'{src}/{nom}.vu'):
            a[..., 3] = np.frombuffer(open(f'{src}/{nom}.vu', 'rb').read(), dtype=np.uint8).reshape(m['hauteur'], m['largeur']) * 255
        Image.fromarray(a, 'RGBA').save(f'{dst}/{nom}.png', optimize=False)
        print(nom, m['largeur'], 'x', m['hauteur'])

def annoter(src, pack):
    tout = {}
    for f in sorted(glob.glob(f'{src}/*.json')):
        nom = os.path.basename(f)[:-5]
        m = json.load(open(f, encoding='utf-8'))
        # Un masque tout a 1 ne se lit pas dans l'alpha d'un PNG : on note que l'echantillon en porte un.
        if os.path.exists(f'{src}/{nom}.vu'): m['masque'] = True
        tout[nom] = m
    # Un echantillon par ligne : un diff montre quelle annotation a bouge.
    lignes = [json.dumps(nom, ensure_ascii=False) + ':' + json.dumps(m, ensure_ascii=False, separators=(',', ':')) for nom, m in tout.items()]
    open(pack, 'w', encoding='utf-8').write('{\n' + ',\n'.join(lignes) + '\n}\n')
    print(len(tout), 'annotations dans', pack)

if __name__ == '__main__':
    a = sys.argv[1:]
    def option(n):
        if n not in a: return None
        i = a.index(n); v = a[i + 1]; del a[i:i + 2]; return v
    images, cmp = option('--images'), option('--cmp')
    if len(a) >= 3 and a[0] == 'monter': monter(a[1], a[2], images, cmp)
    elif len(a) >= 3 and a[0] == 'archiver': archiver(a[1], a[2], a[3:])
    elif len(a) == 3 and a[0] == 'annoter': annoter(a[1], a[2])
    else: print('usage : python3 -I jeu.py monter|archiver|annoter ... (voir l\'en-tete du fichier)'); sys.exit(2)
