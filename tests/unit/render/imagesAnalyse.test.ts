import { describe, it, expect } from 'vitest';
import { cadrageCarre, couleurHauteur, dimensionsAnalyse, tuilesDuCadrage, COTE_ANALYSE_PX, MARGE_CARTE_M } from '../../../src/render/imagesAnalyse.js';
import type { TuileOrtho } from '../../../src/render/ortho.js';

// Les images de l'analyse par Claude, la part sans canevas : la reduction a 1 024 px, le carre
// autour du contour, la rampe de couleurs de la carte LiDAR, les tuiles de l'orthophoto a poser.

describe('les images de l analyse', () => {
  it('reduit a 1 024 px de grand cote, sans jamais agrandir', () => {
    expect(dimensionsAnalyse(4000, 3000)).toEqual({ l: COTE_ANALYSE_PX, h: 768 });
    expect(dimensionsAnalyse(600, 800)).toEqual({ l: 600, h: 800 });
    expect(dimensionsAnalyse(3000, 4000, 512)).toEqual({ l: 384, h: 512 });
  });

  it('cadre un carre centre sur le contour, avec sa marge, y vers le bas', () => {
    const cad = cadrageCarre([{ x: 10, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 26 }, { x: 10, y: 26 }], 512);
    expect(cad.coteM).toBe(10 + 2 * MARGE_CARTE_M);
    expect(cad.xMin).toBe(15 - cad.coteM / 2);
    expect(cad.yMin).toBe(23 - cad.coteM / 2);
    // Le coin nord-ouest du contour est en haut a gauche de l'image, a la marge pres.
    const p = cad.px({ x: 10, y: 26 });
    expect(p.x).toBeCloseTo(MARGE_CARTE_M * 512 / cad.coteM, 6);
    // Le carre fait 16 m de cote pour un contour de 6 m de haut : 5 m de marge au nord, soit 160 px.
    expect(p.y).toBeCloseTo((cad.yMin + cad.coteM - 26) * 512 / cad.coteM, 6);
    expect(p.y).toBe(160);
  });

  it('va du bleu en bas au rouge en haut', () => {
    expect(couleurHauteur(0)).toEqual([40, 60, 200]);
    expect(couleurHauteur(1)).toEqual([220, 50, 40]);
    const [r, g, b] = couleurHauteur(0.5);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(couleurHauteur(-1)).toEqual(couleurHauteur(0));
  });

  it('ne garde que les tuiles chargees qui touchent le carre', () => {
    const tuile = (xMin: number, yMin: number, dataUri: string | null): TuileOrtho => ({ z: 19, x: 0, y: 0, dataUri, xMin, yMin, largeur: 40, hauteur: 40 });
    const cad = cadrageCarre([{ x: 50, y: 50 }, { x: 60, y: 50 }, { x: 60, y: 60 }, { x: 50, y: 60 }]);
    const t = tuilesDuCadrage([tuile(0, 0, 'data:a'), tuile(40, 40, 'data:b'), tuile(40, 40, null), tuile(200, 200, 'data:c')], cad);
    expect(t.map((x) => x.dataUri)).toEqual(['data:b']);
  });
});
