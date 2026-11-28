import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE_NS from 'three';
import {
  ajouterChaussees3d, geometrieChaussees, geometrieTrottoirs, couleurChaussee, couleurRue, JETONS_RUE_3D, NOM_CHAUSSEES_3D, NOM_TROTTOIRS_3D, NOM_BORDURES_3D, DECALAGE_CHAUSSEE_M,
  HAUTEUR_TROTTOIR_M, LARGEUR_BORDURE_M, ATTENUATION_3D,
} from '../../../src/three/chaussees3d.js';
import { ajouterNomsDesRues3d, hauteurPlaque, HAUTEUR_NOM_RUE_3D_M } from '../../../src/three/rues3d.js';
import { SANS_OMBRE, HORS_EXPORT, COUCHES_SOL } from '../../../src/three/primitives.js';
import { JETONS } from '../../../src/styles/jetons.js';
import { profilerRues } from '../../../src/model/trottoirs.js';
import type { ChausseeRue, PtBrut } from '../../../src/model/types.js';

// Les rues dessinees en Vue 3D (option « Rues », MD/spec-rues.md §7) : des rubans drapes sur le relief, en une maille mate.

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });
const versLocal = (p: PtBrut) => ({ x: p.x, z: -p.y });
/** Un sol en pente : un metre de plus tous les dix metres vers l'est. */
const pente = (p: PtBrut) => p.x / 10;
const chaussee: ChausseeRue = { nature: 'Route à 1 chaussée', largeurM: 6, pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }] };
/** Sans parcelle connue : la chaussee d'avant, sur l'axe, a sa largeur lue. */
const rue = profilerRues([chaussee], [])[0]!;

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
    expect(couleurChaussee()).toBe(JETONS.clair['chaussee-3d']);
  });
  it('lit les jetons de la Vue 3D, les memes en sombre : la scene a son soleil, pas le theme du plan', () => {
    // Un navigateur en theme sombre, sans feuille de style (hors page) : les valeurs de jetons.ts.
    vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q.includes('dark'), media: q }) });
    try {
      for (const couleurs of ['plan', 'reelles'] as const) {
        for (const partie of ['chaussee', 'trottoir', 'bordure'] as const) {
          const nom = JETONS_RUE_3D[couleurs][partie];
          expect(couleurRue(partie, couleurs)).toBe(JETONS.sombre[nom]);
          expect(JETONS.sombre[nom]).toBe(JETONS.clair[nom]);
        }
      }
      // La chaussee « Reelle » du plan sombre est presque noire ; celle de la 3D reste l'enrobe du plan clair.
      expect(couleurRue('chaussee', 'reelles')).not.toBe(JETONS.sombre['chaussee-reelle']);
      expect(couleurRue('bordure', 'plan')).not.toBe(JETONS.sombre['chaussee-bord']);
    } finally { vi.unstubAllGlobals(); }
  });
  it('les pierres claires de la 3D sont un peu plus chaudes que celles du plan : le ciel de la scene les bleuit', () => {
    const chaleur = (h: string) => parseInt(h.slice(1, 3), 16) - parseInt(h.slice(5, 7), 16);
    expect(chaleur(JETONS.clair['trottoir-3d'])).toBeGreaterThan(chaleur(JETONS.clair.trottoir));
    expect(chaleur(JETONS.clair['trottoir-reel-3d'])).toBeGreaterThan(chaleur(JETONS.clair['trottoir-reel']));
    expect(chaleur(JETONS.clair['bordure-reelle-3d'])).toBeGreaterThan(chaleur(JETONS.clair['bordure-reelle']));
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

describe('les trottoirs en Vue 3D', () => {
  const parcelles = [{ pts: [{ x: -10, y: 5 }, { x: 50, y: 5 }, { x: 50, y: 30 }, { x: -10, y: 30 }], projet: true }];
  const profils = profilerRues([{ ...chaussee, pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }], parcelles);
  it('drape le dessus 15 cm au-dessus de la chaussee, jusqu a la limite, avec une face de bordure', () => {
    const { dalles, bordures } = geometrieTrottoirs(profils, versLocal, pente);
    const pos = dalles!.getAttribute('position');
    let yMax = -Infinity, dessus = 0;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = -pos.getZ(k), h = pos.getY(k) - pente({ x, y });
      // Le trottoir est au nord de l'axe, entre la chaussee (3 m) et la limite (5 m).
      expect(y).toBeGreaterThan(3 - 1e-6);
      expect(y).toBeLessThanOrEqual(5 + 1e-6);
      yMax = Math.max(yMax, y);
      if (Math.abs(h - (DECALAGE_CHAUSSEE_M + HAUTEUR_TROTTOIR_M)) < 1e-5) dessus++;
      // Les autres sommets sont ceux de la face qui descend au sol a la limite.
      else { expect(h).toBeCloseTo(0, 5); expect(y).toBeCloseTo(5, 5); }
    }
    expect(yMax).toBeCloseTo(5, 5);
    expect(dessus).toBeGreaterThan(0);
    // La bordure : du bord de la chaussee (a sa hauteur) au dessus du trottoir, sur 15 cm de large.
    const b = bordures!.getAttribute('position');
    for (let k = 0; k < b.count; k++) {
      const y = -b.getZ(k), h = b.getY(k) - pente({ x: b.getX(k), y });
      expect(y).toBeGreaterThan(3 - 1e-6);
      expect(y).toBeLessThanOrEqual(3 + LARGEUR_BORDURE_M + 1e-6);
      expect(h).toBeGreaterThan(DECALAGE_CHAUSSEE_M - 1e-6);
    }
  });
  it('pose trois mailles aux couleurs choisies, hors export', () => {
    const scene = new THREE_NS.Scene();
    ajouterChaussees3d(scene, versLocal, profils, { couleurs: 'reelles' });
    expect(scene.children.map((m) => m.name)).toEqual([NOM_CHAUSSEES_3D, NOM_TROTTOIRS_3D, NOM_BORDURES_3D]);
    const couleur = (i: number) => ((scene.children[i] as THREE_NS.Mesh).material as THREE_NS.MeshStandardMaterial).color;
    expect(couleur(0).equals(new THREE_NS.Color(JETONS.clair['chaussee-reelle-3d']).multiplyScalar(ATTENUATION_3D))).toBe(true);
    expect(couleur(1).equals(new THREE_NS.Color(JETONS.clair['trottoir-reel-3d']).multiplyScalar(ATTENUATION_3D))).toBe(true);
    expect(couleur(2).equals(new THREE_NS.Color(JETONS.clair['bordure-reelle-3d']).multiplyScalar(ATTENUATION_3D))).toBe(true);
    expect(scene.children.every((m) => m.userData[HORS_EXPORT] === true && m.userData[SANS_OMBRE] === true)).toBe(true);
    expect(couleurRue('trottoir')).toBe(JETONS.clair['trottoir-3d']);
    expect(couleurRue('bordure')).toBe(JETONS.clair['bordure-3d']);
  });
  it('pose le nom au milieu de la chaussee, sa plaque dans sa largeur', () => {
    const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ measureText: (t: string) => ({ width: t.length * 10 }), strokeText() {}, fillText() {} }) }) } as unknown as Document;
    const etroite = profilerRues([{ ...chaussee, pts: [{ x: -20, y: 0 }, { x: 30, y: 0 }] }], [
      { pts: [{ x: -30, y: 4 }, { x: 40, y: 4 }, { x: 40, y: 30 }, { x: -30, y: 30 }], projet: true },
      { pts: [{ x: -30, y: -2 }, { x: 40, y: -2 }, { x: 40, y: -30 }, { x: -30, y: -30 }], projet: false }]);
    const scene = new THREE_NS.Scene();
    ajouterNomsDesRues3d(scene, versLocal, [{ nom: 'Allée des Limites', troncons: [[{ x: -20, y: 0 }, { x: 30, y: 0 }]] }], { hauteurSol: pente, doc, surChaussees: true, profils: etroite });
    const plaque = scene.children[0] as THREE_NS.Mesh;
    // 6 m entre les limites, l'axe a 1 m au sud du milieu : la chaussee de 3,20 m centree en y = 1.
    expect(-plaque.position.z).toBeCloseTo(1, 6);
    (plaque.geometry as THREE_NS.PlaneGeometry).computeBoundingBox();
    const bb = (plaque.geometry as THREE_NS.PlaneGeometry).boundingBox!;
    expect(bb.max.y - bb.min.y).toBeCloseTo(hauteurPlaque({ nom: '', x: 0, y: 0, angleDeg: 0, largeurM: 3.2 }), 6);
    expect(hauteurPlaque({ nom: '', x: 0, y: 0, angleDeg: 0, largeurM: 3.2 })).toBeCloseTo(2.8, 6);
    expect(hauteurPlaque({ nom: '', x: 0, y: 0, angleDeg: 0 })).toBe(HAUTEUR_NOM_RUE_3D_M);
  });
});
