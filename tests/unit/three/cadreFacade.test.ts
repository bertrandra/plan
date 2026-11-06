import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CADRE_FACADE_MIN_M, MARGE_FACADE_PX, cadreOblique, type CadreOblique, type PointScene, type Reserve } from '../../../src/three/poseFacade.js';
import { cibleDesPoignees, ecarterAEcran, poigneesDe, pointsDuCadreDeFacade, type Point3 } from '../../../src/facade/modeToit/poignees.js';
import { facadesDuBatiment } from '../../../src/facade/modeToit/facadesDesCorps.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';
import type { CibleElement } from '../../../src/facade/modeToit/elements.js';

// La vue de facade du mode Toit (retour du proprietaire sur la 5.12.0 : « le zoom est trop fort, je ne peux pas atteindre une poignee ») :
// sur AE 101, chaque facade de chaque corps, rien de choisi ou un pignon choisi, dans les trois classes d'ecran : toutes les poignees sont
// dans la partie libre de l'image, a une cible tactile de ses bords.

const ae101 = JSON.parse(readFileSync(new URL('../../fixtures/toits/vesinet-ae101.json', import.meta.url), 'utf8')) as { contour: PtBrut[]; corpsAvecFaits: CorpsToit[] };
const corps = ae101.corpsAvecFaits;
const versScene = (p: Point3): PointScene => ({ x: p.x, y: p.z, z: -p.y });

/** Un point de la scene a l'ecran, par la camera de facade (pose et projection, par lignes). */
function pixel(c: CadreOblique, q: PointScene, W: number, H: number): { x: number; y: number } {
  const m = c.monde, P = c.projection;
  const dx = q.x - (m[3] as number), dz = q.z - (m[11] as number);
  const xv = dx * (m[0] as number) + dz * (m[8] as number), zv = dx * (m[2] as number) + dz * (m[10] as number);
  const nx = (P[0] as number) * xv + (P[2] as number) * zv + (P[3] as number), ny = (P[5] as number) * q.y + (P[6] as number) * zv + (P[7] as number);
  return { x: ((nx + 1) / 2) * W, y: ((1 - ny) / 2) * H };
}

const CLASSES: { nom: string; W: number; H: number; reserve: Reserve }[] = [
  { nom: 'large', W: 1371, H: 688, reserve: { largeur: 1371, hauteur: 688, droite: 400, bas: 0 } },
  { nom: 'moyen', W: 820, H: 1124, reserve: { largeur: 820, hauteur: 1124, droite: 0, bas: 560 } },
  { nom: 'compact', W: 390, H: 788, reserve: { largeur: 390, hauteur: 788, droite: 0, bas: 410 } }
];

describe('le cadre de la vue de facade', () => {
  const murs = facadesDuBatiment(corps, ae101.contour);
  const choix: (CibleElement | null)[] = [null, ...corps.flatMap((c, rang) => c.pignons.map((_, i) => ({ type: 'pignon' as const, rang, i })))];

  for (const k of CLASSES) {
    it(`${k.nom} : chaque poignee de chaque facade d AE 101 est dans la partie libre, a une cible tactile du bord`, () => {
      const L = k.W - k.reserve.droite, Hl = k.H - k.reserve.bas;
      let vues = 0;
      for (const f of murs) for (const sel of choix) {
        const pts = pointsDuCadreDeFacade(corps, f, sel);
        expect(pts.length).toBeGreaterThan(0);
        const cadre = cadreOblique(f.a, f.b, f.n, pts.map(versScene), { x: 0, y: 0 }, k.W, k.H, k.reserve);
        const oeil = { x: (f.a.x + f.b.x) / 2 + f.n.x * 50, y: (f.a.y + f.b.y) / 2 + f.n.y * 50, z: 1.6 };
        const cible = cibleDesPoignees(corps, sel, { dessus: false, facade: f, oeil });
        for (const p of cible ? poigneesDe(corps, cible) : []) {
          const q = pixel(cadre, versScene(p.point), k.W, k.H);
          expect(q.x).toBeGreaterThanOrEqual(44);
          expect(q.x).toBeLessThanOrEqual(L - 44);
          expect(q.y).toBeGreaterThanOrEqual(44);
          expect(q.y).toBeLessThanOrEqual(Hl - 44);
          vues++;
        }
      }
      expect(vues).toBeGreaterThan(40);
    });
  }

  it('une petite saillie ne remplit pas l ecran : le cadre a au moins CADRE_FACADE_MIN_M de cote, et la marge en pixels', () => {
    const f = { a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, n: { x: 0, y: -1 } };
    const pts: PointScene[] = [{ x: -0.5, y: 0, z: 0 }, { x: 0.5, y: 2, z: 0 }];
    const c = cadreOblique(f.a, f.b, f.n, pts, { x: 0, y: 0 }, 1000, 600);
    const a = pixel(c, { x: -0.5, y: 0, z: 0 }, 1000, 600), b = pixel(c, { x: 0.5, y: 0, z: 0 }, 1000, 600);
    expect(Math.abs(b.x - a.x)).toBeLessThanOrEqual((600 - 2 * MARGE_FACADE_PX) / CADRE_FACADE_MIN_M + 1e-6);
  });
});

describe('les poignees ecartees a l ecran', () => {
  it('deux poignees confondues ou trop proches se separent, chacune a l ecart de toutes, dans les bornes ; une poignee hors image ne bouge pas', () => {
    const p = ecarterAEcran([{ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 110, y: 100 }, { x: NaN, y: NaN }], 44, { x0: 44, y0: 44, x1: 400, y1: 400 });
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot((p[i]!.x - p[j]!.x), (p[i]!.y - p[j]!.y))).toBeGreaterThanOrEqual(44 - 1e-6);
    for (const q of p.slice(0, 3)) { expect(q.x).toBeGreaterThanOrEqual(44); expect(q.y).toBeGreaterThanOrEqual(44); }
    expect(p[0]).toEqual({ x: 100, y: 100 });
    expect(Number.isNaN(p[3]!.x)).toBe(true);
  });

  it('des poignees deja eloignees ne bougent pas', () => {
    const l = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    expect(ecarterAEcran(l, 44)).toEqual(l);
  });
});
