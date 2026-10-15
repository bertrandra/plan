import { describe, it, expect } from 'vitest';
import type * as THREE_NS from 'three';
import { detacherCartesSansImage, masquerGabarits } from '../../../src/three/exportGlb.js';
import { EXPORT_SEULEMENT, HORS_EXPORT } from '../../../src/three/primitives.js';

// Une scene factice : `traverse` et le drapeau `isMesh` suffisent a la fonction.
function scene(meshes: { material: unknown }[]): THREE_NS.Object3D {
  return { traverse: (f: (o: unknown) => void) => meshes.forEach(m => f({ isMesh: true, ...m })) } as unknown as THREE_NS.Object3D;
}

describe('export GLB — textures jamais arrivees', () => {
  it('retire le temps de l export les cartes sans image, puis les remet', () => {
    const absente = { isTexture: true, image: undefined };
    const chargee = { isTexture: true, image: { width: 64 } };
    const m1 = { map: absente }, m2 = { map: chargee }, m3 = { map: absente };
    const s = scene([{ material: m1 }, { material: [m2, m3] }]);
    const d = detacherCartesSansImage(s);
    // La meme texture partagee par deux materiaux compte une fois.
    expect(d.nombre).toBe(1);
    expect(m1.map).toBeNull();
    expect(m3.map).toBeNull();
    expect(m2.map).toBe(chargee);
    d.remettre();
    expect(m1.map).toBe(absente);
    expect(m3.map).toBe(absente);
  });

  it('ne touche a rien quand toutes les images sont la', () => {
    const chargee = { isTexture: true, image: {} };
    const m = { map: chargee };
    expect(detacherCartesSansImage(scene([{ material: m }])).nombre).toBe(0);
    expect(m.map).toBe(chargee);
  });
});

describe('export GLB — ce que l ecran remplace', () => {
  it('montre le dessin d avant sans sa marque (elle partirait dans les extras du noeud), cache celui de l ecran, puis remet tout', () => {
    const modele = { userData: { [EXPORT_SEULEMENT]: true } as Record<string, unknown>, visible: false };
    const ecran = { userData: { [HORS_EXPORT]: true } as Record<string, unknown>, visible: true };
    const s = { traverse: (f: (o: unknown) => void) => [modele, ecran].forEach(f) } as unknown as THREE_NS.Object3D;
    const remettre = masquerGabarits(s);
    expect(modele.visible).toBe(true);
    expect(modele.userData).toEqual({});
    expect(ecran.visible).toBe(false);
    remettre();
    expect(modele.visible).toBe(false);
    expect(modele.userData[EXPORT_SEULEMENT]).toBe(true);
    expect(ecran.visible).toBe(true);
  });
});
