import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE_NS from 'three';
import { ajouterArbre3d, actualiserSaison, synchroniserArbres, arbreDeLInstance, donneesDe, NOM_ARBRE, NOM_TRONC, NOM_FEUILLAGE, NOM_LOTS, NOM_LOT_BRANCHES, NOM_LOT_FEUILLES } from '../../../src/three/arbre3d.js';
import { poserModuleEzTreePourTest } from '../../../src/three/ezTree.js';
import { poserEspeces, type EspeceArbre } from '../../../src/model/especesArbre.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Un arbre en 3D (MD/spec-arbres-3d.md) : le groupe que le plan pose, les lots d'instances qui le
// dessinent, le repli sans EZ-tree, la saison. EZ-tree est remplace par un faux generateur (le vrai
// charge des images, ce que Node ne sait pas) qui compte ses generations.

let generations = 0;
class FauxArbre extends THREE_NS.Group {
  options: Record<string, unknown> & { copy(s: Record<string, unknown>): void } = { seed: 0, copy(s) { Object.assign(this, s); } };
  branchesMesh = new THREE_NS.Mesh();
  leavesMesh = new THREE_NS.Mesh();
  triangleCount = 4;
  generate() {
    generations++;
    // Un modele de 10 de large (x de -5 a 5) et 20 de haut.
    this.branchesMesh.geometry = new THREE_NS.BoxGeometry(1, 20, 1).translate(0, 10, 0);
    this.leavesMesh.geometry = new THREE_NS.BoxGeometry(10, 8, 10).translate(0, 14, 0);
    this.branchesMesh.material = new THREE_NS.MeshPhongMaterial();
    this.leavesMesh.material = new THREE_NS.MeshPhongMaterial({ alphaTest: 0.5 });
  }
}
const fauxEz = { Tree: FauxArbre, TreePreset: {} } as unknown as typeof import('@dgreenheck/ez-tree');

const chene: EspeceArbre = { id: 'chene', nom: 'Chêne', caduc: true, natures: [], hauteurM: 15, diametreM: 10, reglages: { seed: 5 } };
const pin: EspeceArbre = { id: 'pin', nom: 'Pin', caduc: false, natures: [], hauteurM: 12, diametreM: 6, reglages: { seed: 9 } };

const arbre = (cle: string, plus: Partial<ObjetPlan> = {}): ObjetPlan => ({
  key: cle, type: 'circle', name: 'Arbre', center: { x: 4, y: 2 }, r: 0.3, fonction: 'arbre', ...plus
} as unknown as ObjetPlan);
const ctx = (scene: THREE_NS.Object3D, dateStr: string | null = '2026-06-21') => ({ scene, toLocal: (p: { x: number; y: number }) => ({ x: p.x, z: -p.y }), dateStr });

beforeAll(() => { (globalThis as unknown as { THREE: unknown }).THREE = THREE_NS; });
beforeEach(() => { generations = 0; poserEspeces([chene, pin]); poserModuleEzTreePourTest(fauxEz); });
afterEach(() => { poserEspeces([]); poserModuleEzTreePourTest(null); });

describe('un arbre du plan', () => {
  it('est un groupe sans maille quand EZ-tree le dessine, pose au pied de l\'arbre', () => {
    const scene = new THREE_NS.Scene();
    const g = ajouterArbre3d(ctx(scene), arbre('a', { especeArbre: 'pin', diametreArbre: 4 }), 9);
    expect(g.name).toBe(NOM_ARBRE);
    expect(g.children).toHaveLength(0);
    expect([g.position.x, g.position.z]).toEqual([4, -2]);
    expect(donneesDe(g)).toMatchObject({ lot: true, espece: 'pin', caduc: false, diametre: 4, hauteur: 9 });
  });

  it('prend la hauteur et le diametre de l\'essence quand l\'objet n\'en dit pas', () => {
    const g = ajouterArbre3d(ctx(new THREE_NS.Scene()), arbre('a', { especeArbre: 'chene' }), 0);
    expect(donneesDe(g)).toMatchObject({ hauteur: 15, diametre: 10 });
  });

  it('suit la premiere essence quand l\'objet n\'en porte pas, ou une essence disparue', () => {
    expect(donneesDe(ajouterArbre3d(ctx(new THREE_NS.Scene()), arbre('a'), 5))?.espece).toBe('chene');
    expect(donneesDe(ajouterArbre3d(ctx(new THREE_NS.Scene()), arbre('b', { especeArbre: 'disparu' }), 5))?.espece).toBe('chene');
  });

  it('se dessine en repli sans EZ-tree : un tronc et une boule, nu en hiver pour un caduc', () => {
    poserModuleEzTreePourTest(null);
    const g = ajouterArbre3d(ctx(new THREE_NS.Scene(), '2026-01-15'), arbre('a', { especeArbre: 'chene' }), 8);
    expect(donneesDe(g)?.lot).toBe(false);
    expect(g.getObjectByName(NOM_TRONC)).toBeTruthy();
    expect(g.getObjectByName(NOM_FEUILLAGE)?.visible).toBe(false);
    expect(ajouterArbre3d(ctx(new THREE_NS.Scene(), '2026-07-01'), arbre('b', { especeArbre: 'chene' }), 8).getObjectByName(NOM_FEUILLAGE)?.visible).toBe(true);
  });

  it('se dessine en repli sans aucune essence', () => {
    poserEspeces([]);
    const g = ajouterArbre3d(ctx(new THREE_NS.Scene()), arbre('a'), 6);
    expect(donneesDe(g)).toMatchObject({ lot: false, espece: '' });
    expect(g.getObjectByName(NOM_TRONC)).toBeTruthy();
  });
});

describe('les lots d\'instances', () => {
  function poser(n: number, plus: (i: number) => Partial<ObjetPlan> = () => ({})) {
    const scene = new THREE_NS.Scene();
    const groupes = Array.from({ length: n }, (_, i) => ajouterArbre3d(ctx(scene), arbre('arbre-' + i, { especeArbre: 'pin', diametreArbre: 5, ...plus(i) }), 10));
    return { scene, groupes };
  }

  it('dessinent des arbres de meme essence et meme variante en deux mailles instanciees', () => {
    const { scene, groupes } = poser(1);
    expect(synchroniserArbres(scene, '2026-06-21')).toBe(1);
    const lots = scene.getObjectByName(NOM_LOTS)!;
    expect(lots.children.map((c) => c.name)).toEqual([NOM_LOT_BRANCHES, NOM_LOT_FEUILLES]);
    expect((lots.children[0] as THREE_NS.InstancedMesh).count).toBe(1);
    expect(groupes).toHaveLength(1);
  });

  it('partagent la geometrie et le materiau du modele : une generation par essence et variante, pas par arbre', () => {
    const { scene } = poser(30);
    synchroniserArbres(scene, '2026-06-21');
    const lots = scene.getObjectByName(NOM_LOTS)!.children as THREE_NS.InstancedMesh[];
    const parNom = lots.filter((l) => l.name === NOM_LOT_BRANCHES);
    // Trois variantes au plus, et jamais plus de generations que de lots.
    expect(parNom.length).toBeLessThanOrEqual(3);
    expect(generations).toBeLessThanOrEqual(3);
    expect(parNom.reduce((n, l) => n + l.count, 0)).toBe(30);
    expect(new Set(parNom.map((l) => l.material)).size).toBe(parNom.length);
  });

  it('mettent chaque arbre a sa taille : largeur au diametre, hauteur a la hauteur', () => {
    const { scene } = poser(1);
    synchroniserArbres(scene, '2026-06-21');
    const lot = scene.getObjectByName(NOM_LOT_BRANCHES) as THREE_NS.InstancedMesh;
    const m = new THREE_NS.Matrix4(), p = new THREE_NS.Vector3(), q = new THREE_NS.Quaternion(), s = new THREE_NS.Vector3();
    lot.getMatrixAt(0, m);
    m.decompose(p, q, s);
    // Modele : 10 de large, 20 de haut (une boite de 1 de large pour les branches, 10 pour les feuilles : la plus large compte).
    expect(s.x).toBeCloseTo(5 / 10);
    expect(s.y).toBeCloseTo(10 / 20);
    expect([p.x, p.y, p.z]).toEqual([4, 0, -2]);
  });

  it('laissent de cote un arbre que `visible` refuse, et le reprennent apres', () => {
    const { scene, groupes } = poser(3);
    groupes[1]!.visible = false;
    synchroniserArbres(scene, '2026-06-21', (o) => o.visible);
    const n = () => (scene.getObjectByName(NOM_LOT_BRANCHES) as THREE_NS.InstancedMesh | undefined)?.count ?? 0;
    const total = () => (scene.getObjectByName(NOM_LOTS)!.children as THREE_NS.InstancedMesh[]).filter((c) => c.name === NOM_LOT_BRANCHES).reduce((a, l) => a + l.count, 0);
    expect(total()).toBe(2);
    groupes[1]!.visible = true;
    synchroniserArbres(scene, '2026-06-21', (o) => o.visible);
    expect(total()).toBe(3);
    expect(n()).toBeGreaterThan(0);
  });

  it('se refont sans en garder d\'anciens', () => {
    const { scene } = poser(2);
    synchroniserArbres(scene, '2026-06-21');
    synchroniserArbres(scene, '2026-06-21');
    expect(scene.children.filter((c) => c.name === NOM_LOTS)).toHaveLength(1);
  });

  it('ne laissent rien sans arbre', () => {
    const scene = new THREE_NS.Scene();
    expect(synchroniserArbres(scene, null)).toBe(0);
    expect(scene.getObjectByName(NOM_LOTS)).toBeUndefined();
  });

  it('retrouvent l\'arbre du plan que touche un rayon : l\'instance i est le i-eme groupe', () => {
    const { scene, groupes } = poser(4);
    synchroniserArbres(scene, '2026-06-21');
    const lot = (scene.getObjectByName(NOM_LOTS)!.children as THREE_NS.InstancedMesh[]).find((c) => c.name === NOM_LOT_BRANCHES)!;
    const proprietaires = lot.userData.proprietaires as THREE_NS.Object3D[];
    expect(proprietaires.every((g) => groupes.includes(g as THREE_NS.Group))).toBe(true);
    expect(arbreDeLInstance(lot, 0)).toBe(proprietaires[0]);
    expect(arbreDeLInstance(lot, 99)).toBeNull();
    expect(arbreDeLInstance(new THREE_NS.Mesh(), 0)).toBeNull();
  });

  it('teintent les feuilles arbre par arbre, pas le bois', () => {
    const { scene } = poser(1, () => ({ couleurArbre: '#ff0000' }));
    synchroniserArbres(scene, '2026-06-21');
    const feuilles = scene.getObjectByName(NOM_LOT_FEUILLES) as THREE_NS.InstancedMesh;
    const bois = scene.getObjectByName(NOM_LOT_BRANCHES) as THREE_NS.InstancedMesh;
    const c = new THREE_NS.Color();
    feuilles.getColorAt(0, c);
    expect(c.getHex()).toBe(0xff0000);
    expect(bois.instanceColor).toBeNull();
  });
});

describe('la saison', () => {
  it('ote les feuilles d\'un caduc de novembre a mars, pas celles d\'un persistant', () => {
    const scene = new THREE_NS.Scene();
    ajouterArbre3d(ctx(scene), arbre('c', { especeArbre: 'chene' }), 10);
    ajouterArbre3d(ctx(scene), arbre('p', { especeArbre: 'pin' }), 10);
    synchroniserArbres(scene, '2026-01-15');
    const feuilles = (scene.getObjectByName(NOM_LOTS)!.children as THREE_NS.InstancedMesh[]).filter((c) => c.name === NOM_LOT_FEUILLES);
    const de = (caduc: boolean) => feuilles.find((f) => f.userData.caduc === caduc)!;
    expect(de(true).visible).toBe(false);
    expect(de(false).visible).toBe(true);
    expect(actualiserSaison(scene, '2026-07-01')).toBe(1);
    expect(de(true).visible).toBe(true);
    expect(actualiserSaison(scene, '2026-07-01')).toBe(0);
    expect(actualiserSaison(scene, '2026-12-01')).toBe(1);
  });

  it('suit aussi le feuillage d\'un arbre en repli', () => {
    poserModuleEzTreePourTest(null);
    const scene = new THREE_NS.Scene();
    ajouterArbre3d(ctx(scene, '2026-07-01'), arbre('c', { especeArbre: 'chene' }), 10);
    expect(actualiserSaison(scene, '2026-01-01')).toBe(1);
    expect(scene.getObjectByName(NOM_FEUILLAGE)?.visible).toBe(false);
  });
});
