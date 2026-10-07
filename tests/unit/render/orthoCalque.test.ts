// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/shell/dialogs.js', () => ({ showToast: () => {}, showErrBanner: () => {} }));

import { ortho, placerOrthophoto, type ContexteOrtho } from '../../../src/render/ortho.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// L'orthophoto du plan 2D couvre le calque des parcelles affichees (parcelles + 10 m) et pas au-dela :
// la meme emprise que le sol de la Vue 3D.

const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];

function monter(voisinageVisible: boolean) {
  const groupe = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const objets = [
    { key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: carre(0, 0, 20) },
    { key: 'v', type: 'polygon', fonction: 'terrain', voisinage: true, pts: carre(100, 0, 20) }
  ] as unknown as ObjetPlan[];
  const ctx = {
    orthoGroup: () => groupe, toScreen: (p: PtBrut) => ({ x: p.x * 2, y: -p.y * 2 }), render: vi.fn(),
    etat: { objects: objets, voisinageVisible, scene: { scale: 2 } }
  } as unknown as ContexteOrtho;
  ortho.actif = true;
  ortho.tuiles = [{ z: 18, x: 1, y: 1, dataUri: 'data:,', xMin: -50, yMin: -50, largeur: 300, hauteur: 300 }];
  ortho.couverture = { xMin: -50, xMax: 250, yMin: -50, yMax: 250 };
  ortho.version++;
  placerOrthophoto(ctx);
  return groupe;
}

describe('l orthophoto du plan 2D', () => {
  it('est coupee au calque des parcelles affichees', () => {
    const g = monter(true);
    const rect = g.querySelector('clipPath rect')!;
    // Calque : x de -10 a 130, y de -10 a 30 ; a l'echelle 2, le coin haut-gauche est (-20, -60).
    expect([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['-20', '-60', '280', '80']);
    expect(g.querySelector('g.tuilesOrtho')!.getAttribute('clip-path')).toBe('url(#coupeCalqueOrtho)');
    expect(g.querySelectorAll('g.tuilesOrtho image')).toHaveLength(1);
  });

  it('suit le voisinage masque', () => {
    const rect = monter(false).querySelector('clipPath rect')!;
    expect([rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['80', '80']);
  });
});
