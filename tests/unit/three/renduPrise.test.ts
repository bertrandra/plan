import { describe, it, expect } from 'vitest';
import * as THREE_NS from 'three';
import { champVertical, ciblePrise, HAUTEUR_PRISE_M, rendreDepuisPrise, plansDeCoupeFacade, poseFacadeEntiere, RECUL_MAX_M, type CibleFacadeRendu, type PoseFacadeEntiere } from '../../../src/three/renduPrise.js';

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
  cam.lookAt(c.x, pose.hauteurM + (c.y - HAUTEUR_PRISE_M), c.z);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return [[cible.gauche, 0], [cible.droite, 0], [cible.gauche, cible.hautM], [cible.droite, cible.hautM]]
    .map(([q, h]) => new THREE_NS.Vector3((q as { x: number }).x, h as number, -(q as { y: number }).y).project(cam))
    .map((v) => ({ x: v.x, y: v.y, z: v.z }));
}

describe('le rendu de la facade en elevation (pour Claude)', () => {
  it('se pose en face du mur, sur sa normale, a l horizontale : perpendiculaire, sans inclinaison', () => {
    const pose = poseFacadeEntiere(MUR_SUD);
    // Mur sud : la camera est au sud, au droit du milieu (x = 10), et regarde plein nord.
    expect(pose.x).toBeCloseTo(10, 5);
    expect(pose.y).toBeLessThan(10);
    expect(pose.azimutDeg).toBeCloseTo(0, 5);
    expect(pose.inclinaisonDeg).toBe(0);
    // A mi-hauteur du mur : le pied et le haut s'equilibrent, les verticales restent verticales.
    expect(pose.hauteurM).toBeCloseTo(4.5, 6);
  });

  it('montre les quatre coins, symetriques a l ecran, avec de l air autour', () => {
    const pose = poseFacadeEntiere(MUR_SUD);
    expect(pose.entiere).toBe(true);
    const [bg, bd, hg, hd] = coinsALEcran(pose, MUR_SUD);
    for (const v of [bg, bd, hg, hd]) {
      expect(Math.abs(v?.x ?? 9)).toBeLessThan(1);
      expect(Math.abs(v?.y ?? 9)).toBeLessThan(1);
      expect(v?.z ?? 9).toBeLessThan(1);
    }
    // De face : le bas est aussi loin du centre que le haut, la gauche que la droite, et le mur est droit.
    expect((bg?.y ?? 0) + (hg?.y ?? 0)).toBeCloseTo(0, 6);
    expect((bg?.x ?? 0) + (bd?.x ?? 0)).toBeCloseTo(0, 6);
    expect(bg?.x).toBeCloseTo(hg?.x ?? 9, 6);
    expect(bd?.y).toBeCloseTo(bg?.y ?? 9, 6);
  });

  it('ne depend ni de la position ni du cap de la photo : une facade, une image', () => {
    const p = poseFacadeEntiere(MUR_SUD);
    expect(poseFacadeEntiere(MUR_SUD, undefined, 1024, 768)).toEqual(p);
  });

  it('un petit mur se voit de plus pres qu un grand, jamais sous le minimum', () => {
    const petit: CibleFacadeRendu = { gauche: { x: 9, y: 10 }, droite: { x: 11, y: 10 }, hautM: 2 };
    const pPetit = poseFacadeEntiere(petit), pGrand = poseFacadeEntiere(MUR_SUD);
    expect(pPetit.reculM).toBeLessThan(pGrand.reculM);
    expect(pPetit.reculM).toBeGreaterThanOrEqual(2);
  });

  it('un mur tres large demande un plus grand recul, borne par RECUL_MAX_M', () => {
    const large: CibleFacadeRendu = { gauche: { x: -10, y: 10 }, droite: { x: 30, y: 10 }, hautM: 9 };
    expect(poseFacadeEntiere(large).reculM).toBeGreaterThan(poseFacadeEntiere(MUR_SUD).reculM);
    const demesure = poseFacadeEntiere({ gauche: { x: -400, y: 10 }, droite: { x: 400, y: 10 }, hautM: 9 });
    expect(demesure.reculM).toBe(RECUL_MAX_M);
    expect(demesure.entiere).toBe(false);
  });

  it('suit le champ de l objectif : un champ plus large recule moins', () => {
    expect(poseFacadeEntiere(MUR_SUD, 90).reculM).toBeLessThan(poseFacadeEntiere(MUR_SUD, 50).reculM);
  });

  it('une facade orientee a l est se voit de l est : la normale se deduit des bouts, vue de dehors', () => {
    // De dehors (a l'est, face a l'ouest), la gauche est au sud.
    const est: CibleFacadeRendu = { gauche: { x: 15, y: 10 }, droite: { x: 15, y: 20 }, hautM: 7 };
    const pose = poseFacadeEntiere(est);
    expect(pose.azimutDeg).toBeCloseTo(270, 5);
    expect(pose.x).toBeGreaterThan(15);
    expect(pose.y).toBeCloseTo(15, 5);
    expect(pose.entiere).toBe(true);
  });

  it('une facade oblique est vue de face aussi : la camera est sur sa normale, pas sur l axe nord-sud', () => {
    // Mur a 45 degres, sud-est : sa normale sortante pointe vers le sud-est.
    const oblique: CibleFacadeRendu = { gauche: { x: 0, y: 10 }, droite: { x: 7, y: 17 }, hautM: 5 };
    const pose = poseFacadeEntiere(oblique);
    expect(pose.azimutDeg).toBeCloseTo(315, 5);
    const v = { x: pose.x - 3.5, y: pose.y - 13.5 };
    expect(v.x * 7 + v.y * 7).toBeCloseTo(0, 5);
    expect(pose.entiere).toBe(true);
  });
});

describe('les plans de coupe de la facade seule', () => {
  // Repere de la scene : x vers l'est, z vers le sud (z = -y du plan).
  const versLocal = (p: { x: number; y: number }) => ({ x: p.x, z: -p.y });
  const garde = (plans: ReturnType<typeof plansDeCoupeFacade>, p: { x: number; z: number }) => plans.every((q) => q.n.x * p.x + q.n.z * p.z + q.c >= 0);

  it('garde le mur et son debord, coupe une dependance qui avance devant lui', () => {
    const plans = plansDeCoupeFacade(MUR_SUD, versLocal);
    expect(plans).toHaveLength(3);
    // Mur sud a y = 10 : le mur est en z = -10 ; devant (dehors) est au sud, donc z plus grand.
    expect(garde(plans, { x: 10, z: -10 })).toBe(true);
    expect(garde(plans, { x: 10, z: -9.7 })).toBe(true);
    expect(garde(plans, { x: 10, z: -9 })).toBe(false);
    expect(garde(plans, { x: 10, z: -3 })).toBe(false);
    // Derriere le mur, l'interieur de la maison reste.
    expect(garde(plans, { x: 10, z: -14 })).toBe(true);
  });

  it('coupe ce qui depasse des bouts de la facade, garde sa rive', () => {
    const plans = plansDeCoupeFacade(MUR_SUD, versLocal);
    expect(garde(plans, { x: 4.8, z: -10 })).toBe(true);
    expect(garde(plans, { x: 15.2, z: -10 })).toBe(true);
    expect(garde(plans, { x: 3, z: -10 })).toBe(false);
    expect(garde(plans, { x: 17, z: -10 })).toBe(false);
  });

  it('suit l orientation du mur : un mur est coupe sur sa propre normale', () => {
    // Mur est (x = 20), de dehors la gauche est au sud : l'avant est a l'est.
    const est: CibleFacadeRendu = { gauche: { x: 20, y: 0 }, droite: { x: 20, y: 10 }, hautM: 6 };
    const plans = plansDeCoupeFacade(est, versLocal);
    expect(garde(plans, { x: 20, z: -5 })).toBe(true);
    expect(garde(plans, { x: 22, z: -5 })).toBe(false);
    expect(garde(plans, { x: 18, z: -5 })).toBe(true);
  });
});
