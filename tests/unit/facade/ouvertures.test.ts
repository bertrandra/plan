import { describe, it, expect } from 'vitest';
import { ouverturesAutomatiques, mursAOuvrir, niveaux, abscissesFenetres, hauteurDuMur } from '../../../src/facade/ouvertures.js';
import { facadesDuContour } from '../../../src/facade/geometrie.js';
import type { PtBrut } from '../../../src/model/types.js';

// La disposition automatique des ouvertures (MD/spec-toit-ign.md §6.3) : la meme qu'avant par
// defaut, et des dimensions communes qui la font varier.

const p = (x: number, y: number): PtBrut => ({ x, y });
const maison = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
const volumes = [{ pts: maison, hauteur: 6 }];

describe('ouverturesAutomatiques', () => {
  it('par defaut : 4 fenetres sur 12 m, 3 sur 8 m, par niveau, une porte au milieu du plus long mur', () => {
    const l = ouverturesAutomatiques(maison, volumes, 6, { etages: 2 });
    expect(l.filter((o) => o.type === 'porte')).toHaveLength(1);
    expect(l).toHaveLength(28);
    const porte = l.find((o) => o.type === 'porte')!;
    expect(porte).toMatchObject({ cote: 0, y: 0, l: 0.9, h: 2.1 });
    const f = l.filter((o) => o.type === 'fenetre');
    expect(f.every((o) => o.l === 1 && o.h === 1.2)).toBe(true);
    expect(new Set(f.map((o) => o.y))).toEqual(new Set([0.9, 3.9]));
  });

  it('prend les dimensions communes, et serre l entraxe sans jamais faire chevaucher les fenetres', () => {
    const l = ouverturesAutomatiques(maison, volumes, 6, { etages: 1, largeur: 1.5, hauteur: 1, appui: 1.1, entraxe: 1.2 });
    const f = l.filter((o) => o.type === 'fenetre');
    expect(f.every((o) => o.l === 1.5 && o.h === 1 && o.y === 1.1)).toBe(true);
    // L'entraxe demande (1,2 m) est plus petit que la fenetre : ramene a largeur + 0,2.
    // Sur le long mur sans porte (cote 2), l'entraxe se lit de fenetre en fenetre.
    const surLong = l.filter((o) => o.cote === 2).sort((a, b) => a.x - b.x);
    for (let i = 1; i < surLong.length; i++) expect(surLong[i]!.x - surLong[i - 1]!.x).toBeCloseTo(1.7, 9);
  });

  it('laisse les murs photographies et les murs etroits, et n en met pas sous 2,2 m de niveau', () => {
    expect(ouverturesAutomatiques(maison, volumes, 6, { cotesReleves: [0, 1, 2, 3] })).toEqual([]);
    expect(mursAOuvrir(maison, 6, [0, 2]).map((f) => f.cote)).toEqual([1, 3]);
    expect(ouverturesAutomatiques([p(0, 0), p(3, 0), p(3, 1.5), p(0, 1.5)], [{ pts: [p(0, 0), p(3, 0), p(3, 1.5), p(0, 1.5)], hauteur: 2 }], 2)).toEqual([]);
    expect(niveaux(2, null).n).toBe(0);
    expect(abscissesFenetres(12)).toHaveLength(4);
  });
});

describe('hauteurDuMur', () => {
  it('prend la hauteur mesuree du mur du volume quand elle existe, sinon l egout du volume', () => {
    const facades = facadesDuContour(maison, 6);
    const sud = facades.find((f) => f.cote === 0)!, nord = facades.find((f) => f.cote === 2)!;
    expect(hauteurDuMur(sud, volumes)).toBe(6);
    const mesure = [{ pts: maison, hauteur: 4, hauteursMurs: [4, 4.2, 7.2, 4] }];
    expect(hauteurDuMur(sud, mesure)).toBe(4);
    expect(hauteurDuMur(nord, mesure)).toBe(7.2);
    // Les fenetres suivent : deux niveaux au nord, un au sud.
    const o = ouverturesAutomatiques(maison, mesure, 4);
    expect(Math.max(...o.filter((x) => x.cote === 2).map((x) => x.y))).toBeGreaterThan(3);
    expect(Math.max(...o.filter((x) => x.cote === 0).map((x) => x.y))).toBeLessThan(3);
  });
});
