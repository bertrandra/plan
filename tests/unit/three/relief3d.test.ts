import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import {
  hauteursComblees, creerSolRelief, solDeLaScene, geometrieSol, traitSurSol, sommetsDuSol, bornesCarre, empriseSol,
  decoupesTuiles, tailleTextureSol, DECALAGE_TRAIT_SOL_M, TEXTURE_SOL_MAX_PX
} from '../../../src/three/relief3d.js';
import { versLocalDepuis } from '../../../src/three/primitives.js';
import { zLocal } from '../../../src/model/relief.js';
import type { Relief } from '../../../src/model/types.js';

// Le sol en relief de la Vue 3D (three/relief3d.ts, MD/spec-relief.md §5.5) : sur des grilles planes
// dont on connait tout, le maillage du sol, la dalle orthophoto, le trait qui suit le sol, et la
// pose des objets. three.js r128 est pose sur le global `THREE`, comme le fait la page.

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });

/** Une grille plane z = a·x + b·y + c, `nx × ny` au pas donne, centre nord-ouest en (x0, y0) ; zRef = c. */
function plane(a: number, b: number, c: number, nx = 10, ny = 8, pas = 1, x0 = 0.5, y0 = 7.5): Relief {
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * pas, y = y0 - j * pas;
    z.push(Math.round((a * x + b * y + c) * 100) / 100);
  }
  return { source: 'rge-alti', couche: 'test', dateLecture: '2026-10-06', origine: 'test', precision: 'Emq < 30 cm', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: c };
}

/** La hauteur attendue du sol dessine : le plan, borne au centre des cellules du bord (le sol continue plat au-dela). */
const attendu = (a: number, b: number, x: number, y: number) => a * Math.min(Math.max(x, 0.5), 9.5) + b * Math.min(Math.max(y, 0.5), 7.5);

const sommets = (geo: THREE_NS.BufferGeometry) => {
  const pos = geo.getAttribute('position');
  return Array.from({ length: pos.count }, (_, k) => ({ x: pos.getX(k), y: pos.getY(k), z: pos.getZ(k) }));
};

describe('la grille comblee', () => {
  it('rend zLocal de chaque cellule, et comble un trou par sa voisine', () => {
    const r = plane(0.1, 0.04, 100);
    const h = hauteursComblees(r);
    expect(h[0]).toBeCloseTo(0.05 + 0.3, 9);
    r.z[3 * r.nx + 4] = null;
    const comble = hauteursComblees(r)[3 * r.nx + 4] ?? NaN;
    const voisines = [3 * r.nx + 3, 3 * r.nx + 5, 2 * r.nx + 4, 4 * r.nx + 4].map(k => (r.z[k] ?? NaN) - 100);
    expect(voisines).toContain(comble);
  });

  it('rend un sol a zero quand la grille ne dit rien', () => {
    const r = plane(0, 0, 50);
    r.z.fill(null);
    expect(Array.from(hauteursComblees(r))).toEqual(new Array(r.nx * r.ny).fill(0));
  });
});

describe('le lecteur du sol', () => {
  const r = plane(0.1, 0.04, 100);
  const sol = creerSolRelief(r);

  it('lit zLocal dans la grille, continue plat au-dela du bord, et ne rend jamais null', () => {
    expect(sol.hauteur({ x: 3.25, y: 4.1 })).toBeCloseTo(zLocal(r, 3.25, 4.1) ?? NaN, 9);
    expect(sol.hauteur({ x: -5, y: 3 })).toBeCloseTo(sol.hauteur({ x: 0.5, y: 3 }), 9);
    expect(sol.hauteur({ x: 4, y: 30 })).toBeCloseTo(sol.hauteur({ x: 4, y: 7.5 }), 9);
    const troue = plane(0.1, 0.04, 100);
    troue.z[3 * troue.nx + 4] = null;
    expect(Number.isFinite(creerSolRelief(troue).hauteur({ x: 4.5, y: 4.5 }))).toBe(true);
  });

  it('trouve le point le plus bas sous un contour : un sommet, ou une cellule creuse a l interieur', () => {
    const carre = [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }];
    expect(sol.basSous(carre)).toBeCloseTo(0.2 + 0.08, 9);
    const creux = plane(0.1, 0.04, 100);
    // La cellule (3, 4) a son centre en (3,5 ; 3,5), dans le carre : un metre plus bas que le plan.
    creux.z[4 * creux.nx + 3] = 99;
    expect(creerSolRelief(creux).basSous(carre)).toBeCloseTo(-1, 9);
    expect(creerSolRelief(creux).basSous([])).toBe(0);
  });

  it('n existe que si un relief est la et que « Sol en relief » est coche', () => {
    expect(solDeLaScene(null)).toBeNull();
    expect(solDeLaScene(undefined)).toBeNull();
    expect(solDeLaScene({ ...r, affichage: { sol3d: false } })).toBeNull();
    expect(solDeLaScene(r)).not.toBeNull();
    expect(solDeLaScene({ ...r, affichage: { courbes: false } })).not.toBeNull();
  });
});

describe('le maillage du sol', () => {
  const a = 0.1, b = 0.04;
  const r = plane(a, b, 100);
  const cen = { x: 5, y: 4 };
  const versLocal = versLocalDepuis(cen);

  it('a un sommet par cellule plus un anneau, chacun a la hauteur du sol a 1 mm pres', () => {
    const geo = geometrieSol(creerSolRelief(r), bornesCarre(cen, 30), versLocal);
    const pts = sommets(geo);
    expect(pts).toHaveLength((r.nx + 2) * (r.ny + 2));
    pts.forEach(p => {
      const x = cen.x + p.x, y = cen.y - p.z;
      expect(Math.abs(p.y - attendu(a, b, x, y))).toBeLessThan(1e-3);
    });
  });

  it('prolonge le sol plat jusqu au carre du plan vert', () => {
    const { xs, ys } = sommetsDuSol(r, bornesCarre(cen, 30));
    expect([xs[0], xs.at(-1)]).toEqual([cen.x - 30, cen.x + 30]);
    expect([ys[0], ys.at(-1)]).toEqual([cen.y + 30, cen.y - 30]);
    // Une grille plus large que le carre : l'anneau depasse la grille d'un pas.
    const petit = sommetsDuSol(r, bornesCarre(cen, 1));
    expect(petit.xs[0]).toBeCloseTo(0.5 - 0.5 - 1, 9);
    expect(petit.xs.at(-1)).toBeCloseTo(9.5 + 0.5 + 1, 9);
  });

  it('regarde le ciel : toutes les normales montent', () => {
    const geo = geometrieSol(creerSolRelief(r), bornesCarre(cen, 30), versLocal);
    const n = geo.getAttribute('normal');
    for (let k = 0; k < n.count; k++) expect(n.getY(k)).toBeGreaterThan(0.9);
  });
});

describe('la dalle orthophoto et le trait au sol', () => {
  const r = plane(0.1, 0.04, 100);
  const sol = creerSolRelief(r);
  const versLocal = versLocalDepuis({ x: 0, y: 0 });

  it('donne au sol des uv sur son emprise : u d ouest en est, v du sud au nord', () => {
    const cen = { x: 0, y: 0 };
    const bornes = bornesCarre(cen, 30);
    const geo = geometrieSol(sol, bornes, versLocal);
    const a = empriseSol(r, bornes);
    const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
    for (let k = 0; k < pos.count; k++) {
      // Le repere de la scene : x vers l'est, z vers le sud (versLocalDepuis).
      const x = cen.x + pos.getX(k), y = cen.y - pos.getZ(k);
      expect(uv.getX(k)).toBeCloseTo((x - a.xMin) / (a.xMax - a.xMin), 6);
      expect(uv.getY(k)).toBeCloseTo((y - a.yMin) / (a.yMax - a.yMin), 6);
    }
    // L'emprise est celle de l'anneau : un pas au-dela de la grille, ou les bornes si elles vont plus loin.
    const { xs, ys } = sommetsDuSol(r, bornes);
    expect([a.xMin, a.xMax, a.yMax, a.yMin]).toEqual([xs[0], xs.at(-1), ys[0], ys.at(-1)]);
  });

  it('decoupe chaque tuile au calque et la place sur la texture, le nord en haut', () => {
    const tuile = (xMin: number, yMin: number, l: number, dataUri: string | null = 'data:,') => ({ z: 19, x: 0, y: 0, dataUri, xMin, yMin, largeur: l, hauteur: l });
    const bornes = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
    const emprise = { xMin: -10, xMax: 30, yMin: -10, yMax: 30 };
    const d = decoupesTuiles([tuile(0, 0, 10), tuile(5, 5, 10), tuile(50, 50, 10), tuile(0, 0, 10, null)], bornes, emprise, { largeur: 400, hauteur: 400 });
    expect(d).toHaveLength(2);
    // Entiere dans le calque : toute l'image, posee a 10 px/m, le haut (y = 10) a 200 px du haut de la texture (y = 30).
    expect(d[0]!.source).toEqual([0, 0, 1, 1]);
    expect(d[0]!.destination).toEqual([100, 200, 100, 100]);
    // A cheval : seul son quart sud-ouest (x 5..10, y 5..10) ; dans l'image, c'est en bas a gauche.
    expect(d[1]!.source).toEqual([0, 0.5, 0.5, 0.5]);
    expect(d[1]!.destination).toEqual([150, 200, 50, 50]);
  });

  it('taille la texture en puissances de deux, 4 096 px au plus, 64 au moins', () => {
    expect(TEXTURE_SOL_MAX_PX).toBe(4096);
    expect(tailleTextureSol({ xMin: 0, xMax: 100, yMin: 0, yMax: 50 }, 2.56)).toEqual({ largeur: 256, hauteur: 128 });
    expect(tailleTextureSol({ xMin: 0, xMax: 1000, yMin: 0, yMax: 1000 }, 25.6)).toEqual({ largeur: 4096, hauteur: 4096 });
    expect(tailleTextureSol({ xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, 1)).toEqual({ largeur: 64, hauteur: 64 });
  });

  it('pose un point par metre le long d un contour, 2 cm au-dessus du sol, ferme ou non', () => {
    const carre = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }];
    const ferme = traitSurSol(carre, sol, versLocal);
    expect(ferme).toHaveLength(4 * 3 + 1);
    expect(ferme[0]?.equals(ferme.at(-1) ?? new THREE_NS.Vector3())).toBe(true);
    ferme.forEach(p => expect(p.y).toBeCloseTo(sol.hauteur({ x: p.x, y: -p.z }) + DECALAGE_TRAIT_SOL_M, 6));
    const ouvert = traitSurSol(carre, sol, versLocal, 0.008, false);
    expect(ouvert).toHaveLength(3 * 3 + 1);
    expect(ouvert.at(-1)?.y).toBeCloseTo(sol.hauteur({ x: 0, y: 3 }) + 0.008, 6);
  });
});
