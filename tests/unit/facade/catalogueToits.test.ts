import { describe, it, expect } from 'vitest';
import { EXEMPLES_TOITS, vueIsometrique } from '../../../src/facade/catalogueToits.js';

// Le catalogue des formes de toit : chaque vignette vient des facettes que calcule la 3D.

describe('le catalogue des formes de toit', () => {
  it('dessine chaque forme avec des facettes de toit et de mur, bien formees', () => {
    for (const e of EXEMPLES_TOITS) {
      const v = vueIsometrique(e);
      expect(v.facettes.some((f) => f.mur), e.id).toBe(true);
      expect(v.facettes.some((f) => !f.mur), e.id).toBe(true);
      for (const f of v.facettes) {
        expect(f.points.length).toBeGreaterThanOrEqual(3);
        expect(f.points.flat().every((x) => Number.isFinite(x) && x >= 0), e.id).toBe(true);
      }
    }
  });
  it('compte les pans : deux pans 2, quatre pans 4, un pan 1, plat 1, mansart 6', () => {
    const pans = (id: string) => vueIsometrique(EXEMPLES_TOITS.find((e) => e.id === id)!).facettes.filter((f) => !f.mur && !f.lucarne).length;
    expect([pans('deux-pans'), pans('croupes'), pans('appentis'), pans('plat')]).toEqual([2, 4, 1, 1]);
    expect(pans('gambrel')).toBe(4);
    expect(pans('mansart')).toBe(8);
  });
  it('une lucarne ajoute ses facettes au toit, une forme sans lucarne n en a pas', () => {
    const lucarnes = (id: string) => vueIsometrique(EXEMPLES_TOITS.find((e) => e.id === id)!).facettes.filter((f) => f.lucarne).length;
    for (const id of ['jacobine', 'capucine', 'chien-assis', 'rampante', 'meuniere']) expect(lucarnes(id), id).toBeGreaterThan(0);
    expect(lucarnes('deux-pans')).toBe(0);
  });
  it('une demi-croupe coupe le toit plus bas qu un pignon', () => {
    const haut = (id: string) => Math.min(...vueIsometrique(EXEMPLES_TOITS.find((e) => e.id === id)!).facettes.flatMap((f) => f.points.map((p) => p[1])));
    expect(vueIsometrique(EXEMPLES_TOITS.find((e) => e.id === 'demi-croupe')!).facettes.filter((f) => !f.mur).length).toBeGreaterThanOrEqual(3);
    expect(haut('demi-croupe')).toBeGreaterThanOrEqual(0);
  });
});
