// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { creerRepere, versMetres, matriceDesCalques, traitsALEcran } from '../../../src/render/repere.js';
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

describe('les calques dessines en metres (etape 2.3)', () => {
  it('un point du plan, en metres, l\'axe des y vers le bas ; la transformation du groupe le met ou le repere le dessine', () => {
    const scene = vue(100, 50, 12);
    const p = { x: 3.5, y: -2 }, m = versMetres(p);
    expect(m).toEqual({ x: 3.5, y: 2 });
    const [a, b, c, d, e, f] = /matrix\((.*)\)/.exec(matriceDesCalques(scene))![1]!.split(',').map(Number) as [number, number, number, number, number, number];
    const voulu = versEcran(scene, p);
    expect([a * m.x + c * m.y + e, b * m.x + d * m.y + f]).toEqual([voulu.x, voulu.y]);
  });

  it('les traits gardent leur epaisseur et leurs tirets a l\'ecran', () => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = '<line/><path/><polygon/><title>t</title>';
    traitsALEcran(g);
    expect([...g.children].map((e) => e.getAttribute('vector-effect'))).toEqual(['non-scaling-stroke', 'non-scaling-stroke', 'non-scaling-stroke', null]);
  });
});
