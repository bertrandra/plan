import { describe, it, expect } from 'vitest';
import { LARGEUR_CHEMIN_DEFAUT, largeurChemin, longueurChemin, surfaceChemin } from '../../../src/model/ouvrages/index.js';
import { longueurTrace } from '../../../src/geometry/courbe.js';
import { surfaceDe } from '../../../src/export/resume.js';

// Un chemin (decision du 27 octobre 2026) : une largeur par defaut, la meme partout, et une surface
// comptee sur le trace dessine.

const coude = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];

describe('la largeur d un chemin', () => {
  it('vaut 1 m quand le fichier n en dit rien', () => {
    expect(LARGEUR_CHEMIN_DEFAUT).toBe(1);
    expect(largeurChemin({})).toBe(1);
    expect(largeurChemin({ width: 0 })).toBe(1);
    expect(largeurChemin({ width: 0.6 })).toBe(0.6);
  });
});

describe('la longueur et la surface d un chemin', () => {
  it('droit : la ligne brisee, fois la largeur', () => {
    expect(longueurChemin({ pts: coude })).toBeCloseTo(7, 12);
    expect(surfaceChemin({ pts: coude, width: 1.5 })).toBeCloseTo(10.5, 12);
    expect(surfaceChemin({ pts: coude })).toBeCloseTo(7, 12);
    expect(surfaceChemin({})).toBe(0);
  });

  it('courbe : la longueur de la courbe dessinee, plus longue que ses cordes', () => {
    const L = longueurChemin({ pts: coude, curve: true });
    expect(L).toBe(longueurTrace(coude, true));
    expect(L).toBeGreaterThan(7);
    expect(surfaceChemin({ pts: coude, curve: true, width: 0.5 })).toBeCloseTo(L * 0.5, 12);
  });

  it('le resume compte la meme surface', () => {
    expect(surfaceDe({ type: 'path', pts: coude, curve: true, width: 0.5 })).toBe(surfaceChemin({ pts: coude, curve: true, width: 0.5 }));
    expect(surfaceDe({ type: 'path', pts: coude })).toBeCloseTo(7, 12);
  });
});
