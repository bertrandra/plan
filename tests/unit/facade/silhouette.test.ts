import { describe, it, expect } from 'vitest';
import { silhouetteDuMur } from '../../../src/facade/profil.js';
import { hauteurDuToitEn } from '../../../src/facade/toitCorps.js';
import { facadesDuContour } from '../../../src/facade/geometrie.js';
import type { CorpsToit, PtBrut } from '../../../src/model/types.js';

const p = (x: number, y: number): PtBrut => ({ x, y });

// Un deux-pans de 10 m sur 6 : faitage le long de x, au milieu de la largeur, a 8 m ; egouts a 5 m.
const corps: CorpsToit = { pts: [p(0, 0), p(10, 0), p(10, 6), p(0, 6)], posFaitage: 3, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };
const murs = facadesDuContour(corps.pts, 5);
const bout = murs.find((f) => Math.abs(f.gauche.x - f.droite.x) < 1e-9 && f.gauche.x === 0)!;
const longPan = murs.find((f) => Math.abs(f.gauche.y - f.droite.y) < 1e-9 && f.gauche.y === 0)!;

describe('hauteurDuToitEn', () => {
  it('lit l egout, le faitage, et rien hors des corps', () => {
    expect(hauteurDuToitEn([corps], p(5, 0))).toBeCloseTo(5, 6);
    expect(hauteurDuToitEn([corps], p(5, 3))).toBeCloseTo(8, 6);
    expect(hauteurDuToitEn([corps], p(5, 20))).toBeNull();
  });
  it('garde le plus haut de deux corps qui se chevauchent', () => {
    const bas: CorpsToit = { ...corps, faitage: 4, egouts: [3, 3] };
    expect(hauteurDuToitEn([bas, corps], p(5, 3))).toBeCloseTo(8, 6);
  });
});

describe('silhouetteDuMur', () => {
  it('un mur de bout prend le triangle du pignon jusqu au faitage', () => {
    const s = silhouetteDuMur(bout, [corps], 20, 5);
    expect(s[0]).toEqual({ x: 0, y: 0 });
    expect(s[1]).toEqual({ x: 6, y: 0 });
    const haut = Math.max(...s.map((q) => q.y));
    // La pointe tombe au faitage, a la pente pres sur 10 cm.
    expect(haut).toBeGreaterThan(7.8);
    expect(haut).toBeLessThanOrEqual(8 + 1e-9);
    // Les deux bouts du haut sont aux egouts.
    expect(s[2]!.y).toBeCloseTo(5, 1);
    expect(s[s.length - 1]!.y).toBeCloseTo(5, 1);
  });
  it('un long pan s arrete a l egout, en quatre points', () => {
    const s = silhouetteDuMur(longPan, [corps], 20, 9);
    expect(s).toHaveLength(4);
    for (const q of s.slice(2)) expect(q.y).toBeLessThan(5.05);
  });
  it('coupe au haut de la photo, et prend le repli hors des corps', () => {
    expect(Math.max(...silhouetteDuMur(bout, [corps], 6, 5).map((q) => q.y))).toBe(6);
    const loin = facadesDuContour([p(20, 0), p(24, 0), p(24, 3), p(20, 3)], 4)[0]!;
    expect(silhouetteDuMur(loin, [corps], 20, 4).slice(2).every((q) => q.y === 4)).toBe(true);
  });
});
