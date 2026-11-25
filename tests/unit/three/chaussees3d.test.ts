import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { ajouterChaussees3d, geometrieChaussees, couleurChaussee, NOM_CHAUSSEES_3D, DECALAGE_CHAUSSEE_M, ATTENUATION_3D } from '../../../src/three/chaussees3d.js';
import { ajouterNomsDesRues3d } from '../../../src/three/rues3d.js';
import { SANS_OMBRE, HORS_EXPORT, COUCHES_SOL } from '../../../src/three/primitives.js';
import { JETONS } from '../../../src/styles/jetons.js';
import type { ChausseeRue, PtBrut } from '../../../src/model/types.js';

// Les rues dessinees en Vue 3D (option « Rues », MD/spec-rues.md §7) : des rubans drapes sur le relief, en une maille mate.

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });
const versLocal = (p: PtBrut) => ({ x: p.x, z: -p.y });
/** Un sol en pente : un metre de plus tous les dix metres vers l'est. */
const pente = (p: PtBrut) => p.x / 10;
const rue: ChausseeRue = { nature: 'Route à 1 chaussée', largeurM: 6, pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }] };

describe('geometrieChaussees', () => {
  it('drape chaque sommet du ruban sur le sol, recoupe pour suivre la pente, avec un disque a chaque bout', () => {
    const geo = geometrieChaussees([rue], versLocal, pente)!;
    const pos = geo.getAttribute('position');
    expect(pos.count % 3).toBe(0);
    let xMin = Infinity, xMax = -Infinity;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      // Chaque sommet a la hauteur du sol sous lui, plus le decalage.
      expect(pos.getY(k)).toBeCloseTo(pente({ x, y: -z }) + DECALAGE_CHAUSSEE_M, 5);
      expect(Math.abs(z)).toBeLessThanOrEqual(3 + 1e-6);
      xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
    }
    // Les disques des bouts depassent d'une demi-largeur.
    expect(xMin).toBeCloseTo(-3, 5);
    expect(xMax).toBeCloseTo(43, 5);
    // Des mailles de 2 m au plus : vingt en long, trois en travers, deux triangles chacune ; douze triangles par disque.
    expect(pos.count).toBe((20 * 3 * 2 + 2 * 12) * 3);
    // Les faces regardent le ciel.
    const n = geo.getAttribute('normal');
    for (let k = 0; k < n.count; k++) expect(n.getY(k)).toBeGreaterThan(0.9);
  });
  it('decoupe au sol dessine : hors de lui, ni ruban ni disque', () => {
    const geo = geometrieChaussees([rue], versLocal, () => 0, { xMin: -10, xMax: 20, yMin: -10, yMax: 10 })!;
    const pos = geo.getAttribute('position');
    let xMax = -Infinity;
    for (let k = 0; k < pos.count; k++) xMax = Math.max(xMax, pos.getX(k));
    expect(xMax).toBeCloseTo(20, 5);
    expect(geometrieChaussees([rue], versLocal, () => 0, { xMin: 100, xMax: 200, yMin: 100, yMax: 200 })).toBeNull();
    expect(geometrieChaussees([], versLocal, () => 0)).toBeNull();
  });
});

describe('ajouterChaussees3d', () => {
  it('pose une maille mate dans la couche des chemins, sans ombre portee, hors de l export', () => {
    const scene = new THREE_NS.Scene();
    const m = ajouterChaussees3d(scene, versLocal, [rue], { hauteurSol: pente, couleur: '#F2C14E' })!;
    expect(scene.children).toEqual([m]);
    expect(m.name).toBe(NOM_CHAUSSEES_3D);
    expect(m.userData[SANS_OMBRE]).toBe(true);
    expect(m.userData[HORS_EXPORT]).toBe(true);
    const mat = m.material as THREE_NS.MeshStandardMaterial;
    expect(mat.roughness).toBe(1);
    expect(mat.metalness).toBe(0);
    // La couleur du jeton, assombrie de ce que l'eclairage lui rend.
    const attendue = new THREE_NS.Color('#F2C14E').multiplyScalar(ATTENUATION_3D);
    expect(mat.color.equals(attendue)).toBe(true);
    expect(mat.polygonOffset).toBe(true);
    expect(mat.polygonOffsetFactor).toBe(-COUCHES_SOL.chemin);
    expect(ajouterChaussees3d(scene, versLocal, [])).toBeNull();
  });
  it('prend la couleur du jeton --chaussee hors navigateur', () => {
    expect(couleurChaussee()).toBe(JETONS.clair.chaussee);
  });
});

describe('le nom des rues sur les rues dessinees', () => {
  const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ measureText: (t: string) => ({ width: t.length * 10 }), strokeText() {}, fillText() {} }) }) } as unknown as Document;
  const rues = [{ nom: 'Allée des Limites', troncons: [[{ x: -20, y: 0 }, { x: 30, y: 0 }]] }];
  it('se couche sur le ruban, incline dans le sens de la pente, au-dessus de lui', () => {
    const scene = new THREE_NS.Scene();
    expect(ajouterNomsDesRues3d(scene, versLocal, rues, { hauteurSol: pente, doc, surChaussees: true })).toBe(1);
    const plaque = scene.children[0] as THREE_NS.Mesh;
    // Le nom est au milieu de la rue (x = 5) : le sol y est a 0,5 m.
    expect(plaque.position.y).toBeCloseTo(0.5 + DECALAGE_CHAUSSEE_M + 0.08, 6);
    // L'axe de la plaque suit la voie et monte avec elle (un pour dix), sa normale regarde le ciel.
    const axe = new THREE_NS.Vector3(1, 0, 0).applyQuaternion(plaque.quaternion);
    expect(axe.y / axe.x).toBeCloseTo(0.1, 6);
    expect(axe.z).toBeCloseTo(0, 6);
    expect(new THREE_NS.Vector3(0, 0, 1).applyQuaternion(plaque.quaternion).y).toBeGreaterThan(0.99);
    expect((plaque.material as THREE_NS.Material).polygonOffsetFactor).toBe(-(COUCHES_SOL.chemin + 1));
  });
  it('sans rues dessinees, reste comme avant : a plat a la hauteur du sol sous lui', () => {
    const scene = new THREE_NS.Scene();
    ajouterNomsDesRues3d(scene, versLocal, rues, { hauteurSol: pente, doc });
    const plaque = scene.children[0] as THREE_NS.Mesh;
    expect(plaque.position.y).toBeCloseTo(0.5 + 0.08, 6);
    expect(plaque.rotation.x).toBeCloseTo(-Math.PI / 2, 9);
    expect((plaque.material as THREE_NS.Material).polygonOffset).toBe(false);
  });
});
