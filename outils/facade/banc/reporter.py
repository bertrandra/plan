# Reporte l'annotation d'un echantillon du banc (posee a la main) sur une autre elevation de la
# meme facade - par exemple celle que facade.html produit dans un navigateur (bouton « PNG ») :
# points homologues (SIFT), homographie robuste, puis chaque boite par ses quatre coins. L'ecart
# median des points est affiche : au-dela de quelques pixels, verifier l'apercu avant de s'en servir.
#   python3 -I reporter.py <jeu-source> <nom-source> <image.rgba> <largeur> <hauteur> <sortie.json> <nom> [apercu.png]
# Demande numpy et OpenCV (pip install opencv-python-headless).
import sys, json
import numpy as np, cv2
src, nom_src, rgba, W, H, sortie, nom = sys.argv[1:8]
W, H = int(W), int(H)
m = json.load(open(f'{src}/{nom_src}.json'))
a = np.frombuffer(open(f'{src}/{nom_src}.rgba', 'rb').read(), dtype=np.uint8).reshape(m['hauteur'], m['largeur'], 4)
b = np.frombuffer(open(rgba, 'rb').read(), dtype=np.uint8).reshape(H, W, 4)
ga = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2GRAY); gb = cv2.cvtColor(b[..., :3], cv2.COLOR_RGB2GRAY)
fa = 1600 / max(ga.shape); fb = 1600 / max(gb.shape)
pa = cv2.resize(ga, None, fx=fa, fy=fa, interpolation=cv2.INTER_AREA); pb = cv2.resize(gb, None, fx=fb, fy=fb, interpolation=cv2.INTER_AREA)
sift = cv2.SIFT_create(8000)
ka, da = sift.detectAndCompute(pa, None); kb, db = sift.detectAndCompute(pb, None)
paires = cv2.BFMatcher().knnMatch(da, db, k=2)
bons = [p[0] for p in paires if len(p) == 2 and p[0].distance < 0.7 * p[1].distance]
A = np.float32([ka[x.queryIdx].pt for x in bons]) / fa; Bp = np.float32([kb[x.trainIdx].pt for x in bons]) / fb
Hm, masque = cv2.findHomography(A, Bp, cv2.RANSAC, 6.0)
ok = masque.ravel() > 0
err = np.linalg.norm(cv2.perspectiveTransform(A[ok].reshape(-1, 1, 2), Hm).reshape(-1, 2) - Bp[ok], axis=1)
print(f'{len(bons)} paires, {ok.sum()} dans le modele, ecart median {np.median(err):.1f} px, 90e centile {np.percentile(err, 90):.1f} px')
def boite(g):
    c = np.float32([[g['x'], g['y']], [g['x'] + g['l'], g['y']], [g['x'] + g['l'], g['y'] + g['h']], [g['x'], g['y'] + g['h']]]).reshape(-1, 1, 2)
    q = cv2.perspectiveTransform(c, Hm).reshape(-1, 2)
    x0 = (q[0, 0] + q[3, 0]) / 2; x1 = (q[1, 0] + q[2, 0]) / 2; y0 = (q[0, 1] + q[1, 1]) / 2; y1 = (q[2, 1] + q[3, 1]) / 2
    r = dict(g); r.update(x=round(float(x0)), y=round(float(y0)), l=round(float(x1 - x0)), h=round(float(y1 - y0)))
    for k in ('lM', 'hM'): r.pop(k, None)
    return r
dans = lambda r: r['x'] + r['l'] > 0 and r['y'] + r['h'] > 0 and r['x'] < W and r['y'] < H
gt = [r for r in map(boite, m['gt']) if dans(r)]
ign = [r for r in map(boite, m.get('ignorer', [])) if dans(r)]
ech = float(np.sqrt(abs(np.linalg.det(Hm[:2, :2]))))
n = {'nom': nom, 'groupe': m['groupe'], 'largeur': W, 'hauteur': H, 'pxParM': None, 'gt': gt, 'ignorer': ign, 'source': f'annotation de {nom_src} reportee par homographie (echelle {ech:.3f})'}
json.dump(n, open(sortie, 'w'), ensure_ascii=False, indent=1)
print('echelle', round(ech, 3), '->', len(gt), 'ouvertures,', len(ign), 'zones ignorees ; px/m estime', round(m.get('pxParM') * ech, 1) if m.get('pxParM') else None)
if len(sys.argv) > 8:
    v = cv2.cvtColor(b[..., :3], cv2.COLOR_RGB2BGR).copy()
    for g in gt: cv2.rectangle(v, (g['x'], g['y']), (g['x'] + g['l'], g['y'] + g['h']), (0, 165, 255) if g.get('difficile') else (0, 220, 0), 5)
    for g in ign: cv2.rectangle(v, (g['x'], g['y']), (g['x'] + g['l'], g['y'] + g['h']), (255, 120, 0), 3)
    f = 1700 / max(v.shape[:2]); cv2.imwrite(sys.argv[8], cv2.resize(v, None, fx=f, fy=f, interpolation=cv2.INTER_AREA))
