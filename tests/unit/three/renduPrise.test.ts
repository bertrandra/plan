import { describe, it, expect } from 'vitest';
import * as THREE_NS from 'three';
import { champVertical, ciblePrise, HAUTEUR_PRISE_M, rendreDepuisPrise, poseFacadeEntiere, RECUL_MAX_M, type CibleFacadeRendu, type PoseFacadeEntiere } from '../../../src/three/renduPrise.js';

// Le rendu du modele depuis une prise de vue (MD/spec-regles-toits.md §14.1) : la camera posee la ou le
// telephone etait, dans son axe ; sans Vue 3D ouverte, pas d'image.

describe('le rendu depuis une prise de vue', () => {
  it('convertit le champ horizontal de l objectif en champ vertical de la camera', () => {
    // Un 4:3 a 66 degres de large : 2 x atan(tan(33) x 0,75) = 51,9 degres de haut.
    expect(champVertical(66, 1024, 768)).toBeCloseTo(51.96, 1);
    expect(champVertical(90, 100, 100)).toBeCloseTo(90, 6);
  });

  it('vise devant la prise : vers le nord, l est, le sud, et au-dessus de l horizon', () => {
    const l = { x: 0, z: 0 };
    expect(ciblePrise({ x: 0, y: 0, azimutDeg: 0 }, l)).toEqual({ x: 0, y: HAUTEUR_PRISE_M, z: -10 });
    const est = ciblePrise({ x: 0, y: 0, azimutDeg: 90 }, l);
    expect(est.x).toBeCloseTo(10, 6);
    expect(est.z).toBeCloseTo(0, 6);
    const sud = ciblePrise({ x: 0, y: 0, azimutDeg: 180 }, l);
    expect(sud.z).toBeCloseTo(10, 6);
    const haut = ciblePrise({ x: 0, y: 0, azimutDeg: 0, inclinaisonDeg: 30 }, l);
    expect(haut.y).toBeCloseTo(HAUTEUR_PRISE_M + 5, 6);
    expect(haut.z).toBeCloseTo(-10 * Math.cos(Math.PI / 6), 6);
  });

  it('ne rend rien sans Vue 3D ouverte', () => {
    expect(rendreDepuisPrise({ x: 0, y: 0, azimutDeg: 0 })).toBe(null);
  });
});

// Le mur sud d'une maison de 10 m de large : de dehors (au sud, face au nord), la gauche est a l'ouest.
const MUR_SUD: CibleFacadeRendu = { gauche: { x: 5, y: 10 }, droite: { x: 15, y: 10 }, hautM: 9 };

/** Ou tombent les quatre coins du mur dans l'image de la camera posee : coordonnees de l'ecran, entre -1 et 1. */
function coinsALEcran(pose: PoseFacadeEntiere, cible: CibleFacadeRendu, champDeg = 66): { x: number; y: number; z: number }[] {
  const cam = new THREE_NS.PerspectiveCamera(champVertical(champDeg, 1024, 768), 1024 / 768, 0.05, 1000);
  cam.position.set(pose.x, pose.hauteurM, -pose.y);
  const c = ciblePrise({ x: pose.x, y: pose.y, azimutDeg: pose.azimutDeg, inclinaisonDeg: pose.inclinaisonDeg }, { x: pose.x, z: -pose.y });
  cam.lookAt(c.x, c.y, c.z);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return [[cible.gauche, 0], [cible.droite, 0], [cible.gauche, cible.hautM], [cible.droite, cible.hautM]]
    .map(([q, h]) => new THREE_NS.Vector3((q as { x: number }).x, h as number, -(q as { y: number }).y).project(cam))
    .map((v) => ({ x: v.x, y: v.y, z: v.z }));
}

describe('le rendu de la facade entiere (pour Claude)', () => {
  it('recule depuis la prise jusqu a voir le mur du pied au haut du pignon, de pres comme de loin', () => {
    // A 4 m et 7 m le mur de 9 m ne tient pas : la camera recule. A 12 m il tient deja.
    for (const [y, recule] of [[6, true], [3, true], [-2, false]] as const) {
      const pose = poseFacadeEntiere({ x: 10, y, azimutDeg: 0 }, MUR_SUD);
      expect(pose.entiere).toBe(true);
      expect(pose.reculM > 0).toBe(recule);
      // Les quatre coins sont dans l'image, avec de l'air autour, et devant la camera.
      for (const v of coinsALEcran(pose, MUR_SUD)) {
        expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
        expect(v.z).toBeLessThan(1);
      }
    }
  });

  it('regarde vers la facade : plein nord depuis le sud, et monte vers son milieu', () => {
    const pose = poseFacadeEntiere({ x: 10, y: 4, azimutDeg: 200 }, MUR_SUD);
    // Le cap de la prise (200 degres, de travers) n'y change rien : la camera vise la facade.
    expect(pose.azimutDeg).toBeCloseTo(0, 5);
    expect(pose.x).toBeCloseTo(10, 5);
    // Le milieu du mur (4,5 m) est plus haut que l'oeil (1,5 m) : la camera leve le regard.
    expect(pose.inclinaisonDeg).toBeGreaterThan(5);
    expect(pose.inclinaisonDeg).toBeLessThan(45);
  });

  it('ne depend pas de l inclinaison lue par le capteur, qui n etait pas fiable', () => {
    const a = poseFacadeEntiere({ x: 10, y: 4, azimutDeg: 0, inclinaisonDeg: -70 }, MUR_SUD);
    const b = poseFacadeEntiere({ x: 10, y: 4, azimutDeg: 0, inclinaisonDeg: 35 }, MUR_SUD);
    expect(a).toEqual(b);
  });

  it('ne recule pas quand le mur tient deja : un petit mur vu de loin', () => {
    const petit: CibleFacadeRendu = { gauche: { x: 9, y: 10 }, droite: { x: 11, y: 10 }, hautM: 3 };
    const pose = poseFacadeEntiere({ x: 10, y: -30, azimutDeg: 0 }, petit);
    expect(pose.reculM).toBe(0);
    expect(pose.entiere).toBe(true);
  });

  it('un mur plus large qu une facade de maison demande un plus grand recul, borne par RECUL_MAX_M', () => {
    const large: CibleFacadeRendu = { gauche: { x: -10, y: 10 }, droite: { x: 30, y: 10 }, hautM: 9 };
    const p1 = poseFacadeEntiere({ x: 10, y: 6, azimutDeg: 0 }, MUR_SUD);
    const p2 = poseFacadeEntiere({ x: 10, y: 6, azimutDeg: 0 }, large);
    expect(p2.reculM).toBeGreaterThan(p1.reculM);
    const demesure = poseFacadeEntiere({ x: 10, y: 6, azimutDeg: 0 }, { gauche: { x: -400, y: 10 }, droite: { x: 400, y: 10 }, hautM: 9 });
    expect(demesure.reculM).toBeLessThanOrEqual(RECUL_MAX_M + 0.5);
    expect(demesure.entiere).toBe(false);
  });

  it('une prise derriere le mur, ou collee a lui, se met face au mur', () => {
    const dedans = poseFacadeEntiere({ x: 10, y: 15, azimutDeg: 180 }, MUR_SUD);
    expect(dedans.azimutDeg).toBeCloseTo(0, 5);
    expect(dedans.y).toBeLessThan(10);
    expect(dedans.entiere).toBe(true);
    const colle = poseFacadeEntiere({ x: 10, y: 10.1, azimutDeg: 0 }, MUR_SUD);
    expect(colle.y).toBeLessThan(10);
  });

  it('suit le champ de l objectif : un champ plus large recule moins', () => {
    const etroit = poseFacadeEntiere({ x: 10, y: 6, azimutDeg: 0, champDeg: 50 }, MUR_SUD);
    const large = poseFacadeEntiere({ x: 10, y: 6, azimutDeg: 0, champDeg: 90 }, MUR_SUD);
    expect(large.reculM).toBeLessThan(etroit.reculM);
  });

  it('une facade orientee a l est se voit de l est : la normale se deduit des bouts, vue de dehors', () => {
    // De dehors (a l'est, face a l'ouest), la gauche est au sud.
    const est: CibleFacadeRendu = { gauche: { x: 15, y: 10 }, droite: { x: 15, y: 20 }, hautM: 7 };
    const pose = poseFacadeEntiere({ x: 22, y: 15, azimutDeg: 270 }, est);
    expect(pose.azimutDeg).toBeCloseTo(270, 5);
    expect(pose.x).toBeGreaterThan(15);
    expect(pose.entiere).toBe(true);
  });
});
