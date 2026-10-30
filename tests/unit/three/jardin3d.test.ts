import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE_NS from 'three';
import { ajouterEquipementJardin, ajouterVegetationBasse, semis, DENSITE_QUALITE, PLANTES_MAX, NOM_FEUILLAGE_BAS, NOM_FLEURS, NOM_GROUPE_PLANTES } from '../../../src/three/jardin3d.js';
import { synchroniserArbres, NOM_ARBRE, NOM_LOTS } from '../../../src/three/arbre3d.js';
import { poserModuleEzTreePourTest } from '../../../src/three/ezTree.js';
import { poserEspeces, type EspeceArbre } from '../../../src/model/especesArbre.js';
import { EXPORT_SEULEMENT, HORS_EXPORT } from '../../../src/three/primitives.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// Le jardin en 3D (lot L3) : la vegetation basse d'un massif plante, tiree de sa cle (elle ne tremble jamais), a la densite du
// niveau de qualite a l'ecran et a la densite de reference dans le .glb ; le mini-arbre ; le regard au ras du sol.

const contour: PtBrut[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }];
const versLocal = (p: { x: number; y: number }) => ({ x: p.x, z: -p.y });
const massif = { key: 'pb', type: 'polygon', fonction: 'massif', pts: contour } as unknown as ObjetPlan;
const lilas: EspeceArbre = { id: 'lilas', nom: 'Lilas', caduc: true, natures: [], hauteurM: 4, diametreM: 3.5, reglages: { seed: 1 } };

beforeAll(() => { (globalThis as unknown as { THREE: unknown }).THREE = THREE_NS; });
beforeEach(() => { poserEspeces([lilas]); poserModuleEzTreePourTest(null); });
afterEach(() => { poserEspeces([]); });

describe('le semis d un massif', () => {
  it('est le meme a chaque fois pour la meme cle, et change avec la cle', () => {
    expect(semis('pb', contour, 'fleurs', 1)).toEqual(semis('pb', contour, 'fleurs', 1));
    expect(semis('autre', contour, 'fleurs', 1).feuillage[0]).not.toEqual(semis('pb', contour, 'fleurs', 1).feuillage[0]);
  });

  it('reste dans le contour, a la densite de chaque contenu, et suit le niveau de qualite', () => {
    const s = semis('pb', contour, 'fleurs', 1);
    expect(s.feuillage.length).toBe(48);
    expect(s.fleurs.length).toBe(80);
    expect([...s.feuillage, ...s.fleurs].every((p) => pointInPolygon({ x: p.x, y: p.y }, contour))).toBe(true);
    expect(semis('pb', contour, 'arbustes', 1).fleurs).toHaveLength(0);
    expect(semis('pb', contour, 'fleurs', DENSITE_QUALITE.econome).feuillage.length).toBe(19);
    expect(semis('pb', contour, 'fleurs', DENSITE_QUALITE.soignee).feuillage.length).toBe(77);
    // Un grand massif ne depasse pas le plafond.
    const grand: PtBrut[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    expect(semis('g', grand, 'fleurs', 1.6).feuillage.length).toBe(PLANTES_MAX);
  });

  it('plante un potager en rangs', () => {
    const s = semis('pot', contour, 'potager', 1);
    const rangs = new Set(s.feuillage.map((p) => p.y.toFixed(2)));
    expect(rangs.size).toBe(4);
    expect(s.feuillage.length).toBeGreaterThan(30);
  });
});

describe('la vegetation basse dans la scene', () => {
  it('pose la maille de l ecran hors export et celle du .glb, invisible, a la densite de reference', () => {
    const scene = new THREE_NS.Scene();
    const n = ajouterVegetationBasse({ scene, versLocal, qualite: 'econome', dateStr: null }, massif, contour, { nature: 'plate-bande', contenu: 'fleurs' }, 0.12);
    const groupes = scene.children.filter((c) => c.name === NOM_GROUPE_PLANTES);
    expect(groupes).toHaveLength(2);
    const ecran = groupes.find((g) => g.userData[HORS_EXPORT])!, glb = groupes.find((g) => g.userData[EXPORT_SEULEMENT])!;
    expect(glb.visible).toBe(false);
    const nombre = (g: THREE_NS.Object3D, nom: string) => (g.getObjectByName(nom) as THREE_NS.InstancedMesh).count;
    expect(nombre(ecran, NOM_FEUILLAGE_BAS)).toBe(19);
    expect(nombre(glb, NOM_FEUILLAGE_BAS)).toBe(48);
    expect(nombre(glb, NOM_FLEURS)).toBe(80);
    expect(n).toBe(19 + 32);
  });

  it('ne pose rien quand la vegetation est retiree, mais garde le mini-arbre, groupe arbre dessine par les lots', () => {
    const scene = new THREE_NS.Scene();
    ajouterVegetationBasse({ scene, versLocal, qualite: 'normale', dateStr: null }, massif, contour, { nature: 'massif', contenu: 'mixte', vegetation: false, miniArbre: { espece: 'lilas', hauteurM: 1.8 } }, 0.6);
    expect(scene.getObjectByName(NOM_GROUPE_PLANTES)).toBeUndefined();
    const arbre = scene.getObjectByName(NOM_ARBRE)!;
    expect(arbre.parent!.position.y).toBe(0.6);
    expect(arbre.userData.arbre).toMatchObject({ espece: 'lilas', hauteur: 1.8 });
    synchroniserArbres(scene, null);
    expect(scene.getObjectByName(NOM_LOTS)).toBeUndefined(); // sans EZ-tree : le repli, tronc et boule
    expect(arbre.children.length).toBeGreaterThan(0);
  });
});

describe('les equipements du jardin', () => {
  it('un regard est une plaque dans son cadre, au ras du sol ; un eclairage, une borne et son globe', () => {
    const g = new THREE_NS.Group();
    expect(ajouterEquipementJardin(g, versLocal, 'regard', [{ x: 0, y: 0 }, { x: 0.6, y: 0 }, { x: 0.6, y: 0.6 }, { x: 0, y: 0.6 }], 0.02)).toBe(2);
    const b = new THREE_NS.Box3().setFromObject(g);
    expect(b.max.y).toBeCloseTo(0.035);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.x - b.min.x).toBeCloseTo(0.6);
    const e = new THREE_NS.Group();
    ajouterEquipementJardin(e, versLocal, 'eclairage', [{ x: 1, y: 1 }], 0.8);
    expect(e.getObjectByName('eclairage-globe')).toBeDefined();
    expect(new THREE_NS.Box3().setFromObject(e).max.y).toBeCloseTo(0.92);
  });
});
