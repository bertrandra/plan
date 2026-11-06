import { describe, it, expect } from 'vitest';
import { bornesDeLOrbite, correctionDeLaCible, borner, liberer, decentrer, admettreDistance, DISTANCE_MIN_M, POLAIRE_MAX_RAD, VITESSE_ZOOM } from '../../../src/three/orbiteModeToit.js';
import type { SceneVue3d } from '../../../src/three/etat3d.js';
import type { PointScene } from '../../../src/three/poseFacade.js';

// L'orbite du mode Toit (audit de la camera, 6 novembre 2026) : sous l'horizon, ni trop pres ni trop loin, la cible au-dessus du sol et
// pres du batiment ; l'image decalee vers la partie libre, la cible au centre.

const boite = (x0: number, x1: number, z0: number, z1: number, h: number): PointScene[] =>
  [x0, x1].flatMap((x) => [z0, z1].flatMap((z) => [0, h].map((y) => ({ x, y, z }))));

describe('les bornes de l orbite du mode Toit', () => {
  it('se mesurent sur le batiment : 3 m au plus pres, 4 diametres au plus loin, la cible a 2 diametres du centre', () => {
    const b = bornesDeLOrbite(boite(-6, 6, -4, 4, 8), 0.5);
    const diametre = 2 * Math.hypot(6, 4, 4);
    expect(b.min).toBe(DISTANCE_MIN_M);
    expect(b.max).toBeCloseTo(4 * diametre, 6);
    expect(b.rayonCible).toBeCloseTo(2 * diametre, 6);
    expect(b.centre).toEqual({ x: 0, z: 0 });
    expect(b.sol).toBe(0.5);
  });

  it('un petit abri garde un recul utile (planchers)', () => {
    const b = bornesDeLOrbite(boite(0, 2, 0, 2, 2), 0);
    expect(b.max).toBe(20);
    expect(b.rayonCible).toBe(10);
  });

  it('la cible est ramenee au-dessus du sol et pres du batiment ; dans les bornes, rien ne bouge', () => {
    const b = bornesDeLOrbite(boite(-6, 6, -4, 4, 8), 1);
    expect(correctionDeLaCible({ x: 1, y: 3, z: 2 }, b)).toEqual({ x: 0, y: 0, z: 0 });
    expect(correctionDeLaCible({ x: 0, y: -6, z: 0 }, b).y).toBeCloseTo(7, 9);
    const loin = { x: 300, y: 2, z: 400 }, c = correctionDeLaCible(loin, b);
    expect(Math.hypot(loin.x + c.x, loin.z + c.z)).toBeCloseTo(b.rayonCible, 6);
  });
});

/** Une scene minimale : une camera qui retient son decalage, des controles qui retiennent leurs reglages et leurs ecouteurs. */
function scene() {
  const ecouteurs = new Set<() => void>();
  const vecteur = (x: number, y: number, z: number) => ({ x, y, z, set(a: number, b: number, c: number) { this.x = a; this.y = b; this.z = c; } });
  const camera = { position: vecteur(30, 20, 30), vue: null as number[] | null, maj: 0,
    setViewOffset(...a: number[]) { this.vue = a; }, clearViewOffset() { this.vue = null; }, updateProjectionMatrix() { this.maj++; } };
  const controls = { minDistance: 0, maxDistance: Infinity, maxPolarAngle: Math.PI, zoomSpeed: 2, screenSpacePanning: true, target: vecteur(0, -5, 0),
    addEventListener: (_: string, h: () => void) => { ecouteurs.add(h); }, removeEventListener: (_: string, h: () => void) => { ecouteurs.delete(h); },
    update() { for (const h of ecouteurs) h(); } };
  const sc = { camera, controls, renderer: { domElement: { clientWidth: 1000, clientHeight: 600 } } } as unknown as SceneVue3d;
  return { sc, camera, controls, ecouteurs };
}

describe('l orbite posee sur la scene, puis rendue', () => {
  it('borne, tient la cible au-dessus du sol (la camera suit du meme pas), puis rend les reglages d avant', () => {
    const { sc, camera, controls, ecouteurs } = scene();
    borner(sc, bornesDeLOrbite(boite(-6, 6, -4, 4, 8), 0));
    expect(controls.minDistance).toBe(DISTANCE_MIN_M);
    expect(controls.maxPolarAngle).toBe(POLAIRE_MAX_RAD);
    expect(controls.zoomSpeed).toBe(VITESSE_ZOOM);
    expect(controls.screenSpacePanning).toBe(false);
    expect(controls.target.y).toBe(0);
    expect(camera.position.y).toBe(25);
    expect(ecouteurs.size).toBe(1);
    admettreDistance(sc, 500);
    expect(controls.maxDistance).toBeGreaterThanOrEqual(500);
    decentrer(sc, { largeur: 1000, hauteur: 600, droite: 400, bas: 0 });
    expect(camera.vue).toEqual([1000, 600, 200, 0, 1000, 600]);
    expect(decentrer(sc, { largeur: 1000, hauteur: 600, droite: 400, bas: 0 })).toBe(false);
    liberer(sc);
    expect(controls.minDistance).toBe(0);
    expect(controls.maxDistance).toBe(Infinity);
    expect(controls.maxPolarAngle).toBe(Math.PI);
    expect(controls.zoomSpeed).toBe(2);
    expect(controls.screenSpacePanning).toBe(true);
    expect(ecouteurs.size).toBe(0);
    expect(camera.vue).toBeNull();
  });
});
