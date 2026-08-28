import { describe, it, expect } from 'vitest';
import { PileAnnulation, LIMITE_HISTORIQUE } from '../../src/core/history.js';

const inst = (n: number) => ({ objects: [n], measures: [] as never[] });

describe('pile d annulation', () => {
  it('depile dans l ordre inverse', () => {
    const p = new PileAnnulation<number, never>();
    p.empiler(inst(1));
    p.empiler(inst(2));
    expect(p.depiler()?.objects).toEqual([2]);
    expect(p.depiler()?.objects).toEqual([1]);
  });

  it('rend null quand elle est vide, sans lever', () => {
    const p = new PileAnnulation();
    expect(p.vide).toBe(true);
    expect(p.depiler()).toBeNull();
  });

  it('borne la profondeur en laissant tomber le plus ancien', () => {
    // Chaque instantane est une copie complete du plan : sans borne, une longue session
    // d'edition ferait grossir la memoire indefiniment.
    const p = new PileAnnulation<number, never>(3);
    [1, 2, 3, 4].forEach((n) => p.empiler(inst(n)));
    expect(p.taille).toBe(3);
    expect(p.depiler()?.objects).toEqual([4]);
    expect(p.depiler()?.objects).toEqual([3]);
    expect(p.depiler()?.objects).toEqual([2]);
    expect(p.vide).toBe(true);
  });

  it('garde soixante pas par defaut', () => {
    expect(LIMITE_HISTORIQUE).toBe(60);
    const p = new PileAnnulation<number, never>();
    for (let i = 0; i < 100; i++) p.empiler(inst(i));
    expect(p.taille).toBe(60);
    expect(p.depiler()?.objects).toEqual([99]);
  });

  it('se vide d un coup', () => {
    const p = new PileAnnulation<number, never>();
    p.empiler(inst(1));
    p.vider();
    expect(p.vide).toBe(true);
  });
});
