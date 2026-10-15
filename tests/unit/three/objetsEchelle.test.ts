import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { placeEchelle, poserObjetsEchelle, SILHOUETTE_M } from '../../../src/three/objetsEchelle.js';
import { HORS_EXPORT } from '../../../src/three/primitives.js';
import type { PtBrut } from '../../../src/model/types.js';

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });

const p = (x: number, y: number): PtBrut => ({ x, y });
// Une parcelle de 20 x 30 m ; ses voisines a l'est, au nord et a l'ouest : la rue est au sud.
const parcelle = [p(0, 0), p(20, 0), p(20, 30), p(0, 30)];
const voisines = [[p(20, 0), p(40, 0), p(40, 30), p(20, 30)], [p(0, 30), p(20, 30), p(20, 60), p(0, 60)], [p(-20, 0), p(0, 0), p(0, 30), p(-20, 30)]];

describe('les objets d echelle (R5)', () => {
  it('trouvent le bord cote rue : celui qu aucune voisine ne borde', () => {
    const place = placeEchelle(parcelle, voisines);
    expect(place?.milieu).toEqual(p(10, 0));
    expect(place?.versRue.y).toBeCloseTo(-1);
  });

  it('sans voisinage, prennent le plus long bord', () => {
    const place = placeEchelle(parcelle, []);
    expect(Math.abs(place?.direction.y ?? 0)).toBeCloseTo(1);
  });

  it('posent la voiture dans la rue, le long du bord, et la silhouette dans la parcelle, hors export', () => {
    const scene = new THREE_NS.Scene();
    const place = placeEchelle(parcelle, voisines);
    if (!place) throw new Error('pas de place');
    const g = poserObjetsEchelle(scene, (q) => ({ x: q.x, z: -q.y }), place);
    expect(g.userData[HORS_EXPORT]).toBe(true);
    const voiture = g.getObjectByName('echelle-voiture'), silhouette = g.getObjectByName('echelle-silhouette');
    // La voiture au sud de la parcelle (z positif), son axe long le long du bord (est-ouest).
    expect(voiture?.position.z).toBeGreaterThan(0);
    expect(Math.abs(Math.cos(voiture?.rotation.y ?? 1))).toBeCloseTo(1);
    // La silhouette dans la parcelle (z negatif), a sa taille.
    expect(silhouette?.position.z).toBeLessThan(0);
    const boite = new THREE_NS.Box3().setFromObject(silhouette as THREE_NS.Object3D);
    expect(boite.max.y - boite.min.y).toBeCloseTo(SILHOUETTE_M, 2);
  });
});
