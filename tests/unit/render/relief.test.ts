// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { courbesDeNiveau, dessinerCourbesRelief, etiquetteNiveau, milieuPolyligne } from '../../../src/render/relief.js';
import { SVG_RELIEF, poserEncres } from '../../../src/render/theme.js';
import { creerScene, versEcran } from '../../../src/geometry/vue.js';
import { creerSvg } from '../../../src/render/svg.js';
import { estCourbeMaitresse } from '../../../src/model/relief.js';
import type { ObjetPlan, Relief } from '../../../src/model/types.js';

// Les courbes de niveau a l'ecran (MD/spec-relief.md §5.3) : sur une grille plane qui descend vers
// l'est, des droites nord-sud a l'equidistance, une maitresse sur quatre etiquetee en NGF, et rien
// quand la preference d'affichage est fermee.

/** Une grille plane z = a·x + b·y + c, au pas donne, coin nord-ouest en (x0, y0). */
function plane(a: number, b: number, c: number, nx = 10, ny = 8, pas = 1, x0 = 0.5, y0 = 7.5): Relief {
  const z: (number | null)[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) z.push(Math.round((a * (x0 + i * pas) + b * (y0 - j * pas) + c) * 100) / 100);
  return { source: 'lidar-hd', couche: 'test', dateLecture: '2026-10-06', dateDonnees: '2021-06-01', origine: 'LiDAR HD', precision: 'de l ordre de 10 cm (IGN)', systemeAltimetrique: 'NGF-IGN69', pas, x0, y0, nx, ny, z, zRef: c };
}
const parcellePts = [{ x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 6 }, { x: 1, y: 6 }];
const projet = (relief: Relief | null): ObjetPlan[] => [
  { key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain', pts: parcellePts, relief } as ObjetPlan
];
const scene = () => ({ ...creerScene(), W: 800, H: 600 });

describe('les courbes de niveau d une grille plane', () => {
  it('sont des droites perpendiculaires a la pente, a l equidistance, une maitresse sur quatre', () => {
    // Descend vers l'est de 10 % : les courbes sont des nord-sud (x constant).
    const r = plane(-0.1, 0, 100);
    const { equidistance, courbes } = courbesDeNiveau(r, parcellePts);
    // Denivele de la parcelle (x de 1 a 8) : 0,7 m, sous 1 m : 10 cm.
    expect(equidistance).toBe(0.1);
    expect(courbes.length).toBeGreaterThan(5);
    courbes.forEach(c => {
      const xs = c.pts.map(p => p.x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
      // Chaque courbe passe la ou le plan vaut son niveau : x = (100 - niveau) / 0,1.
      expect(xs[0]).toBeCloseTo((100 - c.niveau) / 0.1, 6);
      expect(c.maitresse).toBe(estCourbeMaitresse(c.niveau, equidistance));
    });
    const niveaux = [...new Set(courbes.map(c => c.niveau))].sort((a, b) => a - b);
    niveaux.forEach((n, i) => { if (i > 0) expect(n - (niveaux[i - 1] as number)).toBeCloseTo(0.1, 9); });
    const maitresses = niveaux.filter(n => estCourbeMaitresse(n, equidistance));
    // Sur neuf niveaux (99,1 a 99,9), deux multiples de 0,4 : 99,2 et 99,6.
    expect(maitresses).toEqual([99.2, 99.6]);
  });

  it('suivent l equidistance reglee quand il y en a une', () => {
    const r = plane(-0.1, 0, 100);
    r.affichage = { equidistance: 0.25 };
    const { equidistance, courbes } = courbesDeNiveau(r, parcellePts);
    expect(equidistance).toBe(0.25);
    expect([...new Set(courbes.map(c => c.niveau))].sort()).toEqual([99.25, 99.5, 99.75]);
  });
});

describe('dessinerCourbesRelief', () => {
  it('pose des polylignes en pixels, les maitresses en trait fort avec leur altitude NGF', () => {
    const r = plane(-0.1, 0, 100);
    const g = creerSvg('g');
    const sc = scene();
    dessinerCourbesRelief(g, projet(r), sc);
    const lignes = [...g.querySelectorAll('polyline')];
    expect(lignes.length).toBeGreaterThan(5);
    lignes.forEach(l => expect(l.getAttribute('stroke')).toBe(SVG_RELIEF));
    const fortes = lignes.filter(l => l.getAttribute('stroke-width') === '1.2');
    const fines = lignes.filter(l => l.getAttribute('stroke-width') === '0.7');
    expect(fortes.length + fines.length).toBe(lignes.length);
    expect(fortes.length).toBeGreaterThan(0);
    // La courbe 99,50 passe en x = 5 m : a l'ecran, l'abscisse de ce point.
    const x99_5 = versEcran(sc, { x: 5, y: 0 }).x;
    const l = lignes.find(p => (p.getAttribute('points') || '').startsWith(x99_5.toFixed(1) + ','));
    expect(l).toBeDefined();
    const textes = [...g.querySelectorAll('text')].map(t => t.textContent);
    expect(textes).toEqual(['99,20', '99,60']);
    g.querySelectorAll('text').forEach(t => expect(t.getAttribute('paint-order')).toBe('stroke'));
  });

  it('ne dessine rien sans relief ni quand la preference est fermee, et vide le groupe', () => {
    const g = creerSvg('g');
    dessinerCourbesRelief(g, projet(plane(-0.1, 0, 100)), scene());
    expect(g.children.length).toBeGreaterThan(0);
    const ferme = plane(-0.1, 0, 100);
    ferme.affichage = { courbes: false };
    dessinerCourbesRelief(g, projet(ferme), scene());
    expect(g.children).toHaveLength(0);
    dessinerCourbesRelief(g, projet(null), scene());
    expect(g.children).toHaveLength(0);
  });

  it('suit l encre de la palette', () => {
    poserEncres({ ink: '#000000', rule: '#111111', paper: '#FFFFFF', accent: '#222222', 'panel-bg': '#333333', 'on-ink': '#444444', relief: '#ABCDEF' });
    try {
      const g = creerSvg('g');
      dessinerCourbesRelief(g, projet(plane(-0.1, 0, 100)), scene());
      expect(g.querySelector('polyline')?.getAttribute('stroke')).toBe('#ABCDEF');
    } finally { poserEncres(); }
  });
});

describe('les petites briques', () => {
  it('ecrivent l altitude a la francaise et trouvent le milieu d une polyligne', () => {
    expect(etiquetteNiveau(167.5)).toBe('167,50');
    expect(milieuPolyligne([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }])).toEqual({ x: 2, y: 0 });
    expect(milieuPolyligne([{ x: 0, y: 0 }, { x: 4, y: 0 }])).toEqual({ x: 2, y: 0 });
  });
});
