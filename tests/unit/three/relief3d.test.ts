import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import {
  hauteursComblees, creerSolRelief, solDeLaScene, geometrieSol, geometrieDalleSurSol, traitSurSol, sommetsDuSol, subdiviser, bornesCarre,
  DECALAGE_ORTHO_M, DECALAGE_TRAIT_SOL_M
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

  it('subdivise une dalle au metre, ses sommets 4 mm au-dessus du sol, ses uv ceux d un plan', () => {
    expect(subdiviser(0, 3, 1)).toEqual([0, 1, 2, 3]);
    expect(subdiviser(0, 2.5, 1)).toHaveLength(4);
    const geo = geometrieDalleSurSol({ xMin: 1, yMin: 1, largeur: 3, hauteur: 2 }, sol, versLocal);
    const pts = sommets(geo);
    expect(pts).toHaveLength(4 * 3);
    pts.forEach(p => expect(p.y).toBeCloseTo(sol.hauteur({ x: p.x, y: -p.z }) + DECALAGE_ORTHO_M, 6));
    const uv = geo.getAttribute('uv');
    // Le premier sommet est le coin nord-ouest (haut de l'image), le dernier le coin sud-est.
    expect([pts[0]?.x, -(pts[0]?.z ?? 0)]).toEqual([1, 3]);
    expect([uv.getX(0), uv.getY(0)]).toEqual([0, 1]);
    expect([uv.getX(11), uv.getY(11)]).toEqual([1, 0]);
  });

  it('coupe une dalle au calque, ses uv restant ceux de la tuile', () => {
    // Tuile de 4 x 4 m a (0, 0) ; calque de x 1 a 3, y 2 a 4 : la dalle n'en garde que ce rectangle.
    const geo = geometrieDalleSurSol({ xMin: 0, yMin: 0, largeur: 4, hauteur: 4 }, sol, versLocal, { xMin: 1, xMax: 3, yMin: 2, yMax: 4 });
    const pts = sommets(geo);
    const uv = geo.getAttribute('uv');
    expect([pts[0]?.x, -(pts[0]?.z ?? 0)]).toEqual([1, 4]);
    expect([uv.getX(0), uv.getY(0)]).toEqual([0.25, 1]);
    const n = pts.length - 1;
    expect([pts[n]?.x, -(pts[n]?.z ?? 0)]).toEqual([3, 2]);
    expect([uv.getX(n), uv.getY(n)]).toEqual([0.75, 0.5]);
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
