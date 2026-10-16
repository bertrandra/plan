import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import * as THREE_NS from 'three';
import { ezPret, modeleArbre, libererModeles, poserModuleEzTreePourTest, NB_VARIANTES } from '../../../src/three/ezTree.js';
import type { EspeceArbre } from '../../../src/model/especesArbre.js';

let generations: number[] = [];
class FauxArbre extends THREE_NS.Group {
  options: Record<string, unknown> & { copy(s: Record<string, unknown>): void } = { seed: 0, copy(s) { Object.assign(this, s); } };
  branchesMesh = new THREE_NS.Mesh();
  leavesMesh = new THREE_NS.Mesh();
  triangleCount = 12;
  generate() {
    generations.push(this.options.seed as number);
    this.branchesMesh.geometry = new THREE_NS.BoxGeometry(2, 30, 2).translate(0, 15, 0);
    this.leavesMesh.geometry = new THREE_NS.BoxGeometry(20, 10, 14).translate(0, 25, 0);
    this.branchesMesh.material = new THREE_NS.MeshPhongMaterial();
    this.leavesMesh.material = new THREE_NS.MeshPhongMaterial({ alphaTest: 0.4, color: 0x88aa88 });
  }
}
const faux = { Tree: FauxArbre, TreePreset: {} } as unknown as typeof import('@dgreenheck/ez-tree');
const espece = (plus: Partial<EspeceArbre> = {}): EspeceArbre => ({ id: 'chene', nom: 'Chêne', caduc: true, natures: [], hauteurM: 10, diametreM: 8, reglages: { seed: 100, branch: { levels: 3 } }, ...plus });

beforeAll(() => { (globalThis as unknown as { THREE: unknown }).THREE = THREE_NS; });
beforeEach(() => { generations = []; poserModuleEzTreePourTest(faux); });
afterEach(() => poserModuleEzTreePourTest(null));

describe('le modele d\'une essence', () => {
  it('n\'existe pas sans EZ-tree', () => {
    poserModuleEzTreePourTest(null);
    expect(ezPret()).toBe(false);
    expect(modeleArbre(espece(), 0)).toBeNull();
  });

  it('mesure la boite des deux geometries : largeur (le plus grand cote en XZ) et hauteur', () => {
    const m = modeleArbre(espece(), 0)!;
    expect(m.largeur).toBe(20);
    expect(m.hauteur).toBe(30);
    expect(m.triangles).toBe(12);
  });

  it('se genere une fois par essence et variante, et se rend identique ensuite', () => {
    const a = modeleArbre(espece(), 1);
    expect(modeleArbre(espece(), 1)).toBe(a);
    expect(modeleArbre(espece(), 4)).toBe(a);
    expect(generations).toHaveLength(1);
  });

  it('tire une graine differente par variante, autour de celle de l\'essence', () => {
    for (let v = 0; v < NB_VARIANTES; v++) modeleArbre(espece(), v);
    expect(generations[0]).toBe(100);
    expect(new Set(generations).size).toBe(NB_VARIANTES);
  });

  it('se regenere quand l\'administrateur change les reglages, mais pas quand il change le nom', () => {
    const a = modeleArbre(espece(), 0);
    expect(modeleArbre(espece({ nom: 'Autre nom', hauteurM: 3 }), 0)).toBe(a);
    expect(modeleArbre(espece({ reglages: { seed: 100, branch: { levels: 2 } } }), 0)).not.toBe(a);
  });

  it('refait le materiau des feuilles : meme carte et meme teinte, la transparence d\'EZ-tree, sans son code de vent', () => {
    const m = modeleArbre(espece(), 0)!;
    const f = m.matFeuilles as THREE_NS.MeshPhongMaterial;
    expect(f.alphaTest).toBe(0.4);
    expect(f.color.getHex()).toBe(0x88aa88);
    expect(f.side).toBe(THREE_NS.DoubleSide);
    expect(f.onBeforeCompile.toString()).toBe(new THREE_NS.MeshPhongMaterial().onBeforeCompile.toString());
  });

  it('rend null, sans lever, quand la generation echoue', () => {
    class Casse extends FauxArbre { override generate() { throw new Error('reglages impossibles'); } }
    poserModuleEzTreePourTest({ Tree: Casse } as unknown as typeof import('@dgreenheck/ez-tree'));
    expect(modeleArbre(espece(), 0)).toBeNull();
  });

  it('se libere en bloc', () => {
    modeleArbre(espece(), 0);
    libererModeles();
    modeleArbre(espece(), 0);
    expect(generations).toHaveLength(2);
  });
});
