import { describe, it, expect } from 'vitest';
import { creerRepere } from '../../../src/render/repere.js';
import { versEcran } from '../../../src/geometry/vue.js';

// Le repere du dessin (MD/roadmap-architecture.md, etape 6.5) : un deplacement n'est qu'un decalage, un zoom en pose un autre.

const vue = (x: number, y: number, scale = 10, W = 800, H = 600) => ({ scale, origine: { x, y }, W, H });

describe('le repere du dessin du plan', () => {
  it('garde son origine tant que l\'echelle et la taille ne changent pas : la vue n\'en differe que du decalage', () => {
    const r = creerRepere();
    const a = r.suivre(vue(100, 50));
    expect([a.dx, a.dy]).toEqual([0, 0]);
    const b = r.suivre(vue(130, 20));
    expect(b.scene).toBe(a.scene);
    expect([b.dx, b.dy]).toEqual([30, -30]);
    // Un point dessine dans le repere, decale, tombe la ou la vue le met.
    const p = { x: 3.5, y: -2 };
    const dessine = versEcran(b.scene, p), voulu = versEcran(vue(130, 20), p);
    expect([dessine.x + b.dx, dessine.y + b.dy]).toEqual([voulu.x, voulu.y]);
  });

  it('pose un nouveau repere a un zoom ou a un changement de taille', () => {
    const r = creerRepere();
    const a = r.suivre(vue(100, 50));
    const b = r.suivre(vue(90, 40, 12));
    expect(b.scene).not.toBe(a.scene);
    expect([b.dx, b.dy]).toEqual([0, 0]);
    const c = r.suivre(vue(90, 40, 12, 390));
    expect(c.scene).not.toBe(b.scene);
  });

  it('avant le premier rendu, ou pendant un zoom pas encore rendu, la scene du dessin est la vue', () => {
    const r = creerRepere();
    const v = vue(1, 2);
    expect(r.scene(v)).toBe(v);
    r.suivre(v);
    const zoom = vue(1, 2, 20);
    expect(r.scene(zoom)).toBe(zoom);
  });
});
