import { describe, it, expect } from 'vitest';
import { reconstruireCorps, ajusterCorps, detecterPignons, corpsAvecPignons, meilleureCoupe, hauteurCorps, hauteursMursCorps, empreintePignon, repere, point, SURPLUS_PIGNON_M, PROFONDEUR_PIGNON_MIN_M } from '../../../src/facade/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../src/model/toitMesure.js';
import type { GrilleRelief } from '../../../src/model/relief.js';
import type { PtBrut } from '../../../src/model/types.js';

// Les corps et pignons reconstruits sur le toit mesure (MD/spec-toit-ign.md §13) : on fabrique la
// grille qu'un MNH donnerait sur une maison connue, et l'on verifie que Plan retrouve ses corps, leurs
// faitages, leurs egouts et leurs pignons.

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, h: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + h), p(x0, y0 + h)];
const dans = (x: number, y: number, r: readonly PtBrut[]) => x > r[0]!.x && x < r[2]!.x && y > r[0]!.y && y < r[2]!.y;
/** La grille a 50 cm sous un contour, `z(x, y)` donne la hauteur ; 0 hors du batiment. */
function mesure(contour: readonly PtBrut[], z: (x: number, y: number) => number) {
  const xs = contour.map((q) => q.x), ys = contour.map((q) => q.y);
  const pas = 0.5, x0 = Math.min(...xs) - 0.75, y0 = Math.max(...ys) + 0.75;
  const nx = Math.round((Math.max(...xs) + 0.75 - x0) / pas) + 1, ny = Math.round((y0 - (Math.min(...ys) - 0.75)) / pas) + 1;
  const zs: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) zs.push(z(x0 + i * pas, y0 - j * pas));
  const g: GrilleRelief = { pas, x0, y0, nx, ny, z: zs };
  return toitMesureDepuisGrille(g, contour)!;
}
/** Un deux-pans de 12 x 8, faitage en y = `yf` a `F` m, egouts `e0` (y = 0) et `e1` (y = 8). */
const deuxPans = (F: number, e0: number, e1: number, yf = 4) => (_x: number, y: number) => (y <= yf ? e0 + ((F - e0) * y) / yf : e1 + ((F - e1) * (8 - y)) / (8 - yf));
const maison = rect(0, 0, 12, 8);

describe('ajusterCorps', () => {
  it('retrouve un deux-pans symetrique : sens du faitage, position, hauteur et egouts', () => {
    const m = mesure(maison, (x, y) => (dans(x, y, maison) ? deuxPans(8, 5, 5)(x, y) : 0));
    const c = ajusterCorps(m, maison, maison)!;
    const r = repere(c.pts);
    expect(r.L).toBeCloseTo(12, 1);
    expect(c.faitage).toBeCloseTo(8, 0);
    expect(Math.abs(c.faitage - 8)).toBeLessThan(0.25);
    expect(Math.abs(c.posFaitage - 4)).toBeLessThan(0.3);
    c.egouts.forEach((e) => expect(Math.abs(e - 5)).toBeLessThan(0.3));
    expect(c.pignons).toEqual([]);
  });

  it('retrouve un faitage decale et deux egouts differents, et un appentis', () => {
    const m = mesure(maison, (x, y) => (dans(x, y, maison) ? deuxPans(7.5, 5.5, 4.5, 2.5)(x, y) : 0));
    const c = ajusterCorps(m, maison, maison)!;
    const r = repere(c.pts);
    // Le faitage a 2,5 m du cote y = 0, quel que soit le sens dans lequel le rectangle est rendu.
    const yFaitage = point(r, r.L / 2, c.posFaitage).y;
    expect(Math.abs(yFaitage - 2.5)).toBeLessThan(0.35);
    const eY0 = point(r, 0, 0).y < 1 ? c.egouts[0] : c.egouts[1];
    expect(Math.abs(eY0 - 5.5)).toBeLessThan(0.35);
    // Un appentis : de 3 m (y = 0) a 6 m (y = 8).
    const a = ajusterCorps(mesure(maison, (x, y) => (dans(x, y, maison) ? 3 + (3 * y) / 8 : 0)), maison, maison)!;
    const ra = repere(a.pts);
    expect(a.posFaitage === 0 || Math.abs(a.posFaitage - ra.W) < 0.01).toBe(true);
    expect(Math.abs(a.faitage - 6)).toBeLessThan(0.3);
    expect(Math.abs(Math.min(...a.egouts) - 3)).toBeLessThan(0.3);
  });

  it('rend un toit plat, et donne la hauteur du toit en tout point de sa largeur', () => {
    const c = ajusterCorps(mesure(maison, (x, y) => (dans(x, y, maison) ? 6 : 0)), maison, maison)!;
    expect(c.faitage).toBe(6);
    expect(c.egouts).toEqual([6, 6]);
    expect(hauteurCorps({ posFaitage: 4, faitage: 8, egouts: [5, 6] }, 8, 0)).toBe(5);
    expect(hauteurCorps({ posFaitage: 4, faitage: 8, egouts: [5, 6] }, 8, 2)).toBe(6.5);
    expect(hauteurCorps({ posFaitage: 4, faitage: 8, egouts: [5, 6] }, 8, 8)).toBe(6);
    expect(hauteursMursCorps({ ...c, egouts: [5, 6] })).toEqual([5, 5, 6, 5]);
  });
});

describe('les pignons qui partent du faitage', () => {
  // Le deux-pans de 12 x 8, et deux pignons de 3 m sur le pan y = 0, a x de 1 a 4 et de 8 a 11 :
  // leur faitage horizontal a 8 m, du mur jusqu'au faitage du corps.
  const avecPignons = (x: number, y: number) => {
    if (!dans(x, y, maison)) return 0;
    const base = deuxPans(8, 5, 5)(x, y);
    for (const [a, b] of [[1, 4], [8, 11]] as const) {
      if (x > a && x < b && y < 4) return Math.max(base, 5 + (3 * (1.5 - Math.abs(x - (a + b) / 2))) / 1.5);
    }
    return base;
  };
  it('les trouve sur le mur de leur pan, avec leur largeur, leur hauteur et leur profondeur', () => {
    const m = mesure(maison, avecPignons);
    const c = corpsAvecPignons(m, maison, maison)!;
    expect(c.pignons).toHaveLength(2);
    const r = repere(c.pts);
    const centres = c.pignons.map((g) => point(r, (g.debut + g.fin) / 2, g.pan === 0 ? 0 : r.W)).sort((a, b) => a.x - b.x);
    expect(Math.abs(centres[0]!.x - 2.5)).toBeLessThan(0.5);
    expect(Math.abs(centres[1]!.x - 9.5)).toBeLessThan(0.5);
    centres.forEach((q) => expect(q.y).toBeCloseTo(0, 1));
    c.pignons.forEach((g) => {
      // Large de 3 m a son pied ; reperee la ou elle depasse le pan de 80 cm, un peu moins.
      expect(g.fin - g.debut).toBeGreaterThanOrEqual(1.5);
      expect(g.fin - g.debut).toBeLessThanOrEqual(3.2);
      // Le faitage lu au 80e centile du profil le long du mur : a un demi-metre pres sur un pignon net.
      expect(Math.abs(g.faitage - 8)).toBeLessThanOrEqual(0.6);
      expect(g.profondeur).toBeGreaterThanOrEqual(PROFONDEUR_PIGNON_MIN_M);
    });
    // Le corps, reajuste sans eux, garde son egout a 5 m.
    expect(Math.abs(c.egouts[c.pignons[0]!.pan] - 5)).toBeLessThan(0.4);
    // L'empreinte d'un pignon : du mur jusqu'a sa profondeur.
    expect(empreintePignon(c, c.pignons[0]!)).toHaveLength(4);
    expect(SURPLUS_PIGNON_M).toBe(0.8);
  });

  it('pas de pignon sur un toit simple, ni le long d un mur interieur', () => {
    const m = mesure(maison, (x, y) => (dans(x, y, maison) ? deuxPans(8, 5, 5)(x, y) : 0));
    expect(detecterPignons(m, ajusterCorps(m, maison, maison)!, maison)).toEqual([]);
    // Le meme toit a pignons, dans un contour qui continue au sud (y < 0) : le mur y = 0 n'est plus une facade.
    const grand = rect(0, -6, 12, 14);
    const m2 = mesure(grand, (x, y) => (y < 0 ? (dans(x, y, grand) ? 3 : 0) : avecPignons(x, y)));
    expect(detecterPignons(m2, ajusterCorps(m2, maison, grand)!, grand)).toEqual([]);
  });
});

describe('reconstruireCorps', () => {
  it('coupe un corps haut et une annexe basse a la marche, et rend chacun son toit', () => {
    // 16 x 8 : un deux-pans a 8 m sur x < 10, une annexe a toit plat a 3 m au-dela.
    const L = rect(0, 0, 16, 8);
    const m = mesure(L, (x, y) => (!dans(x, y, L) ? 0 : x < 10 ? deuxPans(8, 5, 5)(x, y) : 3));
    const corps = reconstruireCorps(m, L)!;
    expect(corps).toHaveLength(2);
    const hauts = corps.map((c) => c.faitage).sort((a, b) => a - b);
    expect(hauts[0]).toBeCloseTo(3, 0);
    expect(Math.abs(hauts[1]! - 8)).toBeLessThan(0.3);
  });

  it('coupe la ou deux toits expliquent nettement mieux qu un seul, et renonce sur un contour de biais', () => {
    // Un deux-pans a 8 m sur x < 8, un appentis de 3 a 5 m au-dela, sans marche nette au raccord.
    const L = rect(0, 0, 14, 8);
    const z = (x: number, y: number) => (!dans(x, y, L) ? 0 : x < 8 ? deuxPans(8, 5, 5)(x, y) : 3 + (2 * y) / 8);
    const m = mesure(L, z);
    expect(meilleureCoupe(m, L, L)).not.toBeNull();
    expect(reconstruireCorps(m, [p(0, 0), p(10, 0), p(10, 6), p(4, 9)])).toBeNull();
  });
});
