import { describe, it, expect, beforeAll } from 'vitest';
import { ajouterNomsDesRues3d, NOM_RUE_3D, HAUTEUR_NOM_RUE_3D_M } from '../../../src/three/rues3d.js';
import { SANS_OMBRE } from '../../../src/three/primitives.js';

// Le nom des rues au sol de la Vue 3D, verifie en structure avec un THREE et un canevas minimaux.

class Plan { constructor(public l: number, public h: number) {} }
class Mesh {
  name = ''; userData: Record<string, unknown> = {}; renderOrder = 0;
  position = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  rotation = { x: 0, y: 0, z: 0, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } };
  constructor(public geometry: Plan, public material: { p: Record<string, unknown> }) {}
}
beforeAll(() => {
  (globalThis as Record<string, unknown>).THREE = {
    Mesh, PlaneGeometry: Plan,
    MeshBasicMaterial: class { constructor(public p: Record<string, unknown>) {} },
    CanvasTexture: class { constructor(public image: unknown) {} },
  };
});
/** Un document dont le canevas mesure 10 px par caractere. */
const doc = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ measureText: (t: string) => ({ width: t.length * 10 }), strokeText() {}, fillText() {} }) }) } as unknown as Document;
const rues = [
  { nom: 'Allée des Limites', troncons: [[{ x: -20, y: -5 }, { x: 30, y: -5 }]] },
  { nom: 'Avenue', troncons: [[{ x: 0, y: 0 }, { x: 0, y: 300 }]] },
];

describe('ajouterNomsDesRues3d', () => {
  it('couche une plaque par etiquette, dans le sens de la voie, au ras du sol, sans ombre', () => {
    const ajoutes: Mesh[] = [];
    const n = ajouterNomsDesRues3d({ add: (m: Mesh) => ajoutes.push(m) } as never, (p) => ({ x: p.x, z: -p.y }), rues, { hauteurSol: (p) => p.x * 0.1, doc });
    // « Avenue » fait 300 m : deux etiquettes ; « Allee des Limites » une.
    expect(n).toBe(3);
    expect(ajoutes.every((m) => m.name === NOM_RUE_3D && m.userData[SANS_OMBRE] === true)).toBe(true);
    const limites = ajoutes[0]!;
    expect(limites.position.x).toBe(5);
    expect(limites.position.z).toBe(5);
    expect(limites.position.y).toBeCloseTo(0.5 + 0.08, 9);
    expect(limites.rotation.x).toBeCloseTo(-Math.PI / 2, 9);
    expect(limites.rotation.z).toBe(0);
    expect(limites.geometry.h).toBe(HAUTEUR_NOM_RUE_3D_M);
    expect(limites.geometry.l).toBeCloseTo(HAUTEUR_NOM_RUE_3D_M * ((17 * 10 + 24) / 64), 9);
    expect(ajoutes[1]!.rotation.z).toBeCloseTo(Math.PI / 2, 9);
    // Une image par nom, partagee par ses etiquettes ; elle ne s'ecrit pas dans la profondeur.
    expect(ajoutes[1]!.material).toBe(ajoutes[2]!.material);
    expect(ajoutes[1]!.material.p.depthWrite).toBe(false);
  });
  it('ne garde que les etiquettes posees sur le sol dessine', () => {
    const ajoutes: Mesh[] = [];
    // Le sol s'arrete a y = 60 : l'avenue (300 m) n'y garde que ses 60 premiers metres, une etiquette en leur milieu.
    const n = ajouterNomsDesRues3d({ add: (m: Mesh) => ajoutes.push(m) } as never, (p) => ({ x: p.x, z: -p.y }), rues, { doc, cadre: { xMin: -10, xMax: 10, yMin: -10, yMax: 60 } });
    expect(n).toBe(2);
    expect(ajoutes.map((m) => [m.position.x, m.position.z])).toEqual([[0, 5], [0, -30]]);
  });
});
