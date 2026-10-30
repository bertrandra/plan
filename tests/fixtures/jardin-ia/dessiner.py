# Dessine l'orthophoto de SYNTHESE d'un jardin (lot L3) : aucune photo reelle, un jardin invente, pour la verification de l'API
# Claude (scripts/verifier-api-claude.mjs) et les tests. Les positions sont celles de reponse-synthetique.json (parts de l'image).
#   python3 -I tests/fixtures/jardin-ia/dessiner.py
from PIL import Image, ImageDraw
import os, random
T = 512
im = Image.new('RGB', (T, T), (96, 140, 64))
d = ImageDraw.Draw(im)
random.seed(7)
for _ in range(4000):
    x, y = random.randrange(T), random.randrange(T)
    g = random.randint(-14, 14)
    d.point((x, y), (96 + g, 140 + g, 64 + g // 2))
P = lambda u, v: (u * T, v * T)
# La parcelle (contour jaune) et la maison (blanche).
d.rectangle([P(0.33, 0.12), P(0.67, 0.4)], fill=(205, 196, 186))
d.line([P(0.06, 0.06), P(0.94, 0.06), P(0.94, 0.94), P(0.06, 0.94), P(0.06, 0.06)], fill=(255, 235, 59), width=3)
d.line([P(0.33, 0.12), P(0.67, 0.12), P(0.67, 0.4), P(0.33, 0.4), P(0.33, 0.12)], fill=(255, 255, 255), width=2)
# La haie a l'ouest, le chemin de gravier, la terrasse, la piscine, la plate-bande, les arbres, le regard.
d.rectangle([P(0.065, 0.1), P(0.1, 0.9)], fill=(46, 86, 38))
d.rectangle([P(0.485, 0.4), P(0.515, 0.94)], fill=(214, 204, 182))
d.rectangle([P(0.36, 0.4), P(0.64, 0.5)], fill=(170, 130, 90))
d.rectangle([P(0.62, 0.6), P(0.82, 0.72)], fill=(70, 160, 210))
d.rectangle([P(0.2, 0.78), P(0.4, 0.84)], fill=(120, 84, 52))
for _ in range(60):
    u, v = random.uniform(0.2, 0.4), random.uniform(0.78, 0.84)
    d.ellipse([P(u - 0.004, v - 0.004), P(u + 0.004, v + 0.004)], fill=random.choice([(216, 67, 79), (242, 197, 61), (229, 143, 182)]))
for (u, v, r) in [(0.25, 0.55, 0.07), (0.82, 0.25, 0.05)]:
    d.ellipse([P(u - r + 0.03, v - r + 0.02), P(u + r + 0.03, v + r + 0.02)], fill=(60, 90, 45))
    d.ellipse([P(u - r, v - r), P(u + r, v + r)], fill=(52, 104, 40))
d.rectangle([P(0.44, 0.52), P(0.46, 0.54)], fill=(120, 124, 128))
# L'echelle : 5 m sur 30 m de cote.
d.rectangle([(8, T - 30), (8 + T * 5 / 30, T - 26)], fill=(17, 17, 17))
im.save(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jardin-test.jpg'), quality=85)
