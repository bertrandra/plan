import { describe, it, expect } from 'vitest';
import { rabouter, longueur, pointA, angleLisible, etiquettesDesRues, decouper, LONGUEUR_MIN_ETIQUETTE_M, PAS_ETIQUETTE_M } from '../../../src/model/rues.js';

const p = (x: number, y: number) => ({ x, y });

describe('rabouter', () => {
  it('met bout a bout les troncons d une rue, en retournant ceux qui vont a l envers', () => {
    const lignes = rabouter([[p(10, 0), p(20, 0)], [p(0, 0), p(10, 0)], [p(30, 0), p(20, 0)]]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.map((q) => q.x)).toEqual([0, 10, 20, 30]);
  });
  it('garde separes les troncons qui ne se touchent pas, et ignore un troncon d un seul point', () => {
    expect(rabouter([[p(0, 0), p(10, 0)], [p(50, 0), p(60, 0)], [p(5, 5)]])).toHaveLength(2);
  });
});

describe('longueur, pointA, angleLisible', () => {
  it('mesure et parcourt une polyligne', () => {
    const l = [p(0, 0), p(10, 0), p(10, 10)];
    expect(longueur(l)).toBe(20);
    expect(pointA(l, 5)).toEqual({ x: 5, y: 0, dx: 1, dy: 0 });
    expect(pointA(l, 15)).toEqual({ x: 10, y: 5, dx: 0, dy: 1 });
    expect(pointA(l, 99)).toMatchObject({ x: 10, y: 10 });
  });
  it('un nom ne se lit jamais la tete en bas', () => {
    expect(angleLisible(1, 0)).toBe(0);
    expect(angleLisible(-1, 0)).toBe(0);
    expect(angleLisible(0, 1)).toBe(90);
    expect(angleLisible(0, -1)).toBe(90);
    expect(angleLisible(-1, -1)).toBeCloseTo(45, 9);
  });
});

describe('etiquettesDesRues', () => {
  it('un nom au milieu d une rue, aucun sur un bout trop court, plusieurs sur une longue rue', () => {
    const e = etiquettesDesRues([
      { nom: 'Allée des Limites', troncons: [[p(0, 0), p(40, 0)], [p(40, 0), p(80, 0)]] },
      { nom: 'Impasse', troncons: [[p(0, 50), p(LONGUEUR_MIN_ETIQUETTE_M - 1, 50)]] },
      { nom: 'Avenue', troncons: [[p(0, 100), p(PAS_ETIQUETTE_M * 3, 100)]] },
    ]);
    const limites = e.filter((x) => x.nom === 'Allée des Limites');
    expect(limites).toEqual([{ nom: 'Allée des Limites', x: 40, y: 0, angleDeg: 0 }]);
    expect(e.some((x) => x.nom === 'Impasse')).toBe(false);
    expect(e.filter((x) => x.nom === 'Avenue').map((x) => x.x)).toEqual([60, 180, 300]);
  });
  it('l angle suit la voie, lisible, meme tracee de droite a gauche ou vers le sud', () => {
    const [a] = etiquettesDesRues([{ nom: 'R', troncons: [[p(50, 50), p(0, 0)]] }]);
    expect(a!.angleDeg).toBeCloseTo(45, 9);
    const [b] = etiquettesDesRues([{ nom: 'R', troncons: [[p(0, 50), p(0, 0)]] }]);
    expect(b!.angleDeg).toBe(90);
  });
});

describe('decouper et cadre', () => {
  const cadre = { xMin: 0, xMax: 100, yMin: 0, yMax: 100 };
  it('garde les morceaux d une polyligne dans le rectangle, chacun d un seul tenant', () => {
    expect(decouper([p(-50, 50), p(150, 50)], cadre)).toEqual([[p(0, 50), p(100, 50)]]);
    // Sort puis revient : deux morceaux.
    const m = decouper([p(10, 10), p(10, 150), p(90, 150), p(90, 10)], cadre);
    expect(m).toEqual([[p(10, 10), p(10, 100)], [p(90, 100), p(90, 10)]]);
    expect(decouper([p(200, 200), p(300, 300)], cadre)).toEqual([]);
    expect(decouper([p(10, 10), p(50, 10), p(50, 50)], cadre)).toEqual([[p(10, 10), p(50, 10), p(50, 50)]]);
  });
  it('le nom se pose au milieu de ce qu on voit de la rue', () => {
    const rues = [{ nom: 'Longue', troncons: [[p(-1000, 50), p(60, 50)]] }];
    expect(etiquettesDesRues(rues)[0]!.x).not.toBeGreaterThan(0);
    const vus = etiquettesDesRues(rues, cadre);
    expect(vus).toEqual([{ nom: 'Longue', x: 30, y: 50, angleDeg: 0 }]);
  });
});
