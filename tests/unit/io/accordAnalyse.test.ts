import { describe, it, expect } from 'vitest';
import { creerMemoireAccords, type StockageAccords } from '../../../src/io/accordAnalyse.js';

// L'accord d'envoyer ses photos a l'analyse, garde par projet sur l'appareil (decision D2).

function stockage(): StockageAccords & { m: Map<string, string> } {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

describe('la memoire des accords', () => {
  it('garde l accord par projet, et le retire', () => {
    const s = stockage();
    const mem = creerMemoireAccords(s);
    expect(mem.lire('projet:p1')).toBe(null);
    mem.ecrire('projet:p1', { t: '2026-10-13T10:00:00.000Z', partage: true });
    expect(mem.lire('projet:p1')).toEqual({ t: '2026-10-13T10:00:00.000Z', partage: true });
    expect(mem.lire('projet:p2')).toBe(null);
    mem.ecrire('projet:p1', null);
    expect(mem.lire('projet:p1')).toBe(null);
    expect(s.m.size).toBe(0);
  });

  it('ignore une valeur illisible, un stockage absent ou qui leve', () => {
    const s = stockage();
    s.m.set('plan.accordAnalyse.projet:p1', '{pas du json');
    s.m.set('plan.accordAnalyse.projet:p2', JSON.stringify({ t: 3 }));
    const mem = creerMemoireAccords(s);
    expect(mem.lire('projet:p1')).toBe(null);
    expect(mem.lire('projet:p2')).toBe(null);
    expect(creerMemoireAccords(null).lire('projet:p1')).toBe(null);
    const leve: StockageAccords = { getItem: () => { throw new Error('bloque'); }, setItem: () => { throw new Error('plein'); }, removeItem: () => {} };
    expect(() => creerMemoireAccords(leve).ecrire('projet:p1', { t: 'x', partage: false })).not.toThrow();
    expect(creerMemoireAccords(leve).lire('projet:p1')).toBe(null);
  });
});
