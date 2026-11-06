import { describe, it, expect } from 'vitest';
import { cadreOblique, deplacerZoom, projectionZoomee, zoomerAutour, ZOOM_FACADE_MIN_M, ZOOM_NEUTRE } from '../../../src/three/poseFacade.js';

// Le zoom de la vue de facade (decision du proprietaire, 6 novembre 2026) : le cadre de #600 reste, le pincement et la molette s'approchent
// autour du point vise, entre le cadre de depart et environ un metre de facade a l'ecran.

const mur = { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, n: { x: 0, y: -1 } };
const boite = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 7, z: -6 }];
/** Ou tombe (en coordonnees normalisees) un point de la scene, par une projection rangee comme `Matrix4.set`. */
const ecran = (p: number[], monde: number[], q: { x: number; y: number; z: number }) => {
  // monde : la camera dans la scene ; sa transposee (rotation pure) ramene la scene dans la camera.
  const d = [q.x - monde[3]!, q.y - monde[7]!, q.z - monde[11]!];
  const v = [0, 1, 2].map((c) => monde[c]! * d[0]! + monde[4 + c]! * d[1]! + monde[8 + c]! * d[2]!);
  return { x: p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]! + p[3]!, y: p[4]! * v[0]! + p[5]! * v[1]! + p[6]! * v[2]! + p[7]! };
};

describe('le zoom de la vue de facade', () => {
  const cadre = cadreOblique(mur.a, mur.b, mur.n, boite, { x: 0, y: 0 }, 1000, 600);

  it('garde le point vise sous le curseur', () => {
    const q = { x: 7, y: 3, z: 0 }, avant = ecran(cadre.projection, cadre.monde, q);
    const z = zoomerAutour(ZOOM_NEUTRE, 2, avant, cadre.zoomMax);
    const apres = ecran(projectionZoomee(cadre.projection, z), cadre.monde, q);
    expect(z.k).toBe(2);
    expect(apres.x).toBeCloseTo(avant.x, 9);
    expect(apres.y).toBeCloseTo(avant.y, 9);
  });

  it('ne s eloigne pas au-dela du cadre de depart, ne s approche pas en deca d un metre de facade', () => {
    expect(zoomerAutour({ k: 1.5, tx: 0.3, ty: 0 }, 0.1, { x: 0, y: 0 }, cadre.zoomMax)).toEqual({ k: 1, tx: 0, ty: 0 });
    const loin = zoomerAutour(ZOOM_NEUTRE, 1000, { x: 0, y: 0 }, cadre.zoomMax);
    expect(loin.k).toBe(cadre.zoomMax);
    // Au plus pres, un metre de facade tient la partie libre (ici l'image entiere, 600 px de haut).
    const p = projectionZoomee(cadre.projection, loin);
    const un = ecran(p, cadre.monde, { x: 3, y: 2, z: 0 }), deux = ecran(p, cadre.monde, { x: 3 + ZOOM_FACADE_MIN_M, y: 2, z: 0 });
    expect(((deux.x - un.x) / 2) * 1000).toBeCloseTo(600, 0);
  });

  it('reste dans le cadre de depart quand il glisse', () => {
    const z = deplacerZoom({ k: 2, tx: 0, ty: 0 }, { x: 5, y: -5 });
    expect(z).toEqual({ k: 2, tx: 1, ty: -1 });
    expect(deplacerZoom(ZOOM_NEUTRE, { x: 0.4, y: 0 })).toEqual(ZOOM_NEUTRE);
  });

  it('sans zoom, la projection est celle du cadre', () => {
    expect(projectionZoomee(cadre.projection, ZOOM_NEUTRE)).toEqual(cadre.projection);
  });
});
