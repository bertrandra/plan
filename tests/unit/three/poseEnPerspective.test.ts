import { describe, it, expect } from 'vitest';
import { decalageDeLaVue, poseEnPerspective, type PoseCamera, type PointScene, type Reserve } from '../../../src/three/poseFacade.js';

// Le mode Toit cadre la camera libre sur le batiment a l'entree, puis sur le corps choisi (audit de la navigation, 6 novembre 2026) :
// la maison tient dans la partie de l'image que le panneau laisse libre, vue de la meme direction qu'avant.

const boite = (x0: number, x1: number, z0: number, z1: number, h: number): PointScene[] =>
  [x0, x1].flatMap((x) => [z0, z1].flatMap((z) => [0, h].map((y) => ({ x, y, z }))));

/**
 * La projection de `p` par la camera `pose` (perspective, champ vertical `fov`), en pixels d'une image `l` x `h`, decalee de `reserve`
 * comme le fait `setViewOffset` (`decalageDeLaVue`) : l'axe tombe au milieu de la partie libre.
 */
function pixel(pose: PoseCamera, p: PointScene, fov: number, l: number, h: number, reserve?: Reserve) {
  const dec = decalageDeLaVue(reserve);
  const d = { x: pose.position.x - pose.cible.x, y: pose.position.y - pose.cible.y, z: pose.position.z - pose.cible.z };
  const n = Math.hypot(d.x, d.y, d.z), f = { x: -d.x / n, y: -d.y / n, z: -d.z / n };
  const r0 = { x: -f.z, y: 0, z: f.x }, lr = Math.hypot(r0.x, r0.z), r = { x: r0.x / lr, y: 0, z: r0.z / lr };
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const v = { x: p.x - pose.position.x, y: p.y - pose.position.y, z: p.z - pose.position.z };
  const prof = v.x * f.x + v.y * f.y + v.z * f.z, t = Math.tan((fov * Math.PI) / 360);
  const nx = (v.x * r.x + v.y * r.y + v.z * r.z) / (prof * t * (l / h)), ny = (v.x * u.x + v.y * u.y + v.z * u.z) / (prof * t);
  return { x: ((nx + 1) / 2) * l - dec.x, y: ((1 - ny) / 2) * h - dec.y };
}

describe('la camera libre cadree sur le batiment', () => {
  const maison = boite(-6, 6, 10, 18, 8), depuis: PoseCamera = { position: { x: 80, y: 60, z: 90 }, cible: { x: 0, y: 0, z: 0 } };

  it('garde la direction d ou l on regarde, et rapproche la camera d une maison lointaine', () => {
    const pose = poseEnPerspective(maison, depuis, 50, 1.6);
    const avant = Math.hypot(80, 60, 90), d0 = { x: 80 / avant, y: 60 / avant, z: 90 / avant };
    const v = { x: pose.position.x - pose.cible.x, y: pose.position.y - pose.cible.y, z: pose.position.z - pose.cible.z }, n = Math.hypot(v.x, v.y, v.z);
    expect(v.x / n).toBeCloseTo(d0.x, 6);
    expect(v.y / n).toBeCloseTo(d0.y, 6);
    expect(v.z / n).toBeCloseTo(d0.z, 6);
    expect(n).toBeLessThan(avant);
  });

  it('la maison tient dans la partie libre de l image, a cote du panneau, et s y centre', () => {
    const reserve: Reserve = { largeur: 1400, hauteur: 700, droite: 360, bas: 0 };
    const pose = poseEnPerspective(maison, depuis, 50, 2, reserve);
    const px = maison.map((p) => pixel(pose, p, 50, 1400, 700, reserve));
    for (const q of px) {
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(1400 - 360);
      expect(q.y).toBeGreaterThan(0);
      expect(q.y).toBeLessThan(700);
    }
    const milieu = (Math.min(...px.map((q) => q.x)) + Math.max(...px.map((q) => q.x))) / 2;
    expect(Math.abs(milieu - (1400 - 360) / 2)).toBeLessThan(120);
  });

  it('au telephone, le panneau en bas : la maison tient au-dessus de lui', () => {
    const reserve: Reserve = { largeur: 390, hauteur: 700, droite: 0, bas: 360 };
    const pose = poseEnPerspective(maison, depuis, 50, 390 / 700, reserve);
    for (const q of maison.map((p) => pixel(pose, p, 50, 390, 700, reserve))) {
      expect(q.y).toBeLessThan(700 - 360);
      expect(q.y).toBeGreaterThan(0);
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(390);
    }
  });

  it('la cible est le centre de la maison : l orbite tourne autour d elle, panneau ou non (audit de la camera, 6 novembre 2026)', () => {
    for (const reserve of [undefined, { largeur: 1400, hauteur: 700, droite: 360, bas: 0 }, { largeur: 390, hauteur: 700, droite: 0, bas: 360 }] as (Reserve | undefined)[]) {
      const pose = poseEnPerspective(maison, depuis, 50, 2, reserve);
      expect(pose.cible.x).toBeCloseTo(0, 6);
      expect(pose.cible.y).toBeCloseTo(4, 6);
      expect(pose.cible.z).toBeCloseTo(14, 6);
    }
  });

  it('le decalage de l image est la moitie de ce que le panneau recouvre', () => {
    expect(decalageDeLaVue(undefined)).toEqual({ x: 0, y: 0 });
    expect(decalageDeLaVue({ largeur: 1400, hauteur: 700, droite: 360, bas: 0 })).toEqual({ x: 180, y: 0 });
    expect(decalageDeLaVue({ largeur: 390, hauteur: 700, droite: 0, bas: 360 })).toEqual({ x: 0, y: 180 });
  });
});
