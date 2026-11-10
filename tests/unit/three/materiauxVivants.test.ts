import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE_NS from 'three';
import { pixelsNormales, animerMateriaux, retirerReliefsEcran, inscrireHauteurs, RELIEF_ECRAN } from '../../../src/three/materiauxVivants.js';

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });

/** Une image en gris de `cote` pixels, une bande claire verticale au milieu. */
function bande(cote: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(cote * cote * 4);
  for (let y = 0; y < cote; y++) for (let x = 0; x < cote; x++) {
    const g = x >= cote / 2 - 1 && x <= cote / 2 ? 230 : 120, k = (y * cote + x) * 4;
    px[k] = px[k + 1] = px[k + 2] = g; px[k + 3] = 255;
  }
  return px;
}
const n = (px: Uint8ClampedArray, cote: number, x: number, y: number) => {
  const k = (y * cote + x) * 4;
  return [((px[k] ?? 0) / 255) * 2 - 1, ((px[k + 1] ?? 0) / 255) * 2 - 1, ((px[k + 2] ?? 0) / 255) * 2 - 1];
};

describe('le relief des textures dessinees (R3)', () => {
  it('un fond uni est plat : la normale regarde droit devant', () => {
    const cote = 16, px = pixelsNormales(bande(cote), cote, false, 3);
    const [x, y, z] = n(px, cote, 2, 5);
    expect(Math.abs(x ?? 1)).toBeLessThan(0.02);
    expect(Math.abs(y ?? 1)).toBeLessThan(0.02);
    expect(z).toBeGreaterThan(0.98);
  });

  it('un joint clair en creux penche les normales vers lui, l inverse sinon', () => {
    const cote = 16;
    const creux = pixelsNormales(bande(cote), cote, true, 3), bosse = pixelsNormales(bande(cote), cote, false, 3);
    // Juste a gauche de la bande : en creux, la paroi regarde vers la droite (vers le joint) ; en bosse, vers la gauche.
    expect(n(creux, cote, cote / 2 - 2, 5)[0]).toBeGreaterThan(0.2);
    expect(n(bosse, cote, cote / 2 - 2, 5)[0]).toBeLessThan(-0.2);
  });

  it('ne pose de relief que sur les textures dessinees, et le retire le temps d un export', () => {
    const scene = new THREE_NS.Scene();
    const dessinee = new THREE_NS.Texture(), photo = new THREE_NS.Texture();
    inscrireHauteurs(dessinee, bande(8), 8, true, 3);
    const mA = new THREE_NS.MeshStandardMaterial({ map: dessinee }), mB = new THREE_NS.MeshStandardMaterial({ map: photo });
    scene.add(new THREE_NS.Mesh(new THREE_NS.BoxGeometry(), mA), new THREE_NS.Mesh(new THREE_NS.BoxGeometry(), mB));
    // Sans document (tests), la carte ne peut pas etre dessinee : rien n'est pose, rien ne casse.
    expect(animerMateriaux(scene)).toBe(0);
    // Avec une carte posee a la main, comme apres `animerMateriaux` dans un navigateur :
    const carte = new THREE_NS.Texture();
    mA.normalMap = carte; mA.userData[RELIEF_ECRAN] = true;
    const remettre = retirerReliefsEcran(scene);
    expect(mA.normalMap).toBeNull();
    expect(mB.normalMap).toBeNull();
    remettre();
    expect(mA.normalMap).toBe(carte);
  });
});
