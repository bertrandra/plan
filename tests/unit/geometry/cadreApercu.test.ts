import { describe, it, expect } from 'vitest';
import {
  LARGEUR_MIN_M, SEUIL_GLISSER_PX, borner, cadreComplet, deplacer, estComplet, estUnGlisser, grossissement,
  largeurMinimale, pointDuCadre, unitesParPixel, zoomer
} from '../../../src/geometry/cadreApercu.js';
import type { PtBrut } from '../../../src/model/types.js';

// Le cadre de l'apercu des parcelles (import cadastral) : tout voir, agrandir, deplacer, sans
// jamais sortir de ce qu'il y a a voir.

const carre = (x0: number, y0: number, l: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + l }, { x: x0, y: y0 + l }];
const proche = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('le cadre complet', () => {
  it('montre tous les points avec la marge d avant le zoom, le nord en haut', () => {
    // 100 x 50 m : marge 3 % de 150 = 4,5 m.
    const c = cadreComplet([{ x: -10, y: -20 }, { x: 90, y: 30 }]);
    proche(c.x, -14.5); proche(c.w, 109);
    // Y du dessin = -Y du plan : le haut du cadre est le nord (y = 30) moins la marge.
    proche(c.y, -34.5); proche(c.h, 59);
  });
  it('garde 2 m de marge au moins, et reste fini sans aucun point', () => {
    const c = cadreComplet([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    proche(c.w, 14);
    const vide = cadreComplet([]);
    expect(Number.isFinite(vide.w) && vide.w > 0).toBe(true);
  });
});

describe('les bornes du zoom', () => {
  const complet = { x: 0, y: 0, w: 200, h: 100 };
  it('ne va pas plus pres que la plus petite parcelle, ni sous 5 m', () => {
    expect(largeurMinimale(complet, [carre(0, 0, 40), carre(50, 0, 12)])).toBe(12);
    expect(largeurMinimale(complet, [carre(0, 0, 1)])).toBe(LARGEUR_MIN_M);
    expect(largeurMinimale({ x: 0, y: 0, w: 3, h: 3 }, [carre(0, 0, 1)])).toBe(3);
  });
  it('null est le complet ; un cadre trop grand y revient, un trop petit remonte au minimum', () => {
    expect(borner(null, complet, 10)).toEqual(complet);
    expect(borner({ x: -50, y: -50, w: 400, h: 200 }, complet, 10)).toEqual(complet);
    const petit = borner({ x: 100, y: 50, w: 1, h: 0.5 }, complet, 10);
    proche(petit.w, 10); proche(petit.h, 5);
  });
  it('garde la proportion du complet et ne sort jamais du complet', () => {
    const c = borner({ x: 190, y: -40, w: 50, h: 10 }, complet, 10);
    proche(c.h, 25);
    proche(c.x, 150); proche(c.y, 0);
  });
});

describe('agrandir et reduire', () => {
  const complet = { x: 0, y: 0, w: 200, h: 100 };
  it('autour du centre sans ancre, le centre reste le centre', () => {
    const c = zoomer(complet, complet, 10, 2);
    proche(c.w, 100); proche(c.h, 50); proche(c.x, 50); proche(c.y, 25);
    expect(grossissement(c, complet)).toBeCloseTo(2);
    expect(estComplet(c, complet)).toBe(false);
  });
  it('le point sous le pointeur reste sous le pointeur', () => {
    const avant = { x: 20, y: 10, w: 100, h: 50 };
    const ancre = { x: 40, y: 20 };
    const apres = zoomer(avant, complet, 10, 2, ancre);
    // La position relative de l'ancre dans le cadre ne change pas.
    proche((ancre.x - apres.x) / apres.w, (ancre.x - avant.x) / avant.w);
    proche((ancre.y - apres.y) / apres.h, (ancre.y - avant.y) / avant.h);
  });
  it('s arrete au minimum en avancant, au complet en reculant', () => {
    let c = complet;
    for (let k = 0; k < 30; k++) c = zoomer(c, complet, 10, 1.5);
    proche(c.w, 10);
    for (let k = 0; k < 30; k++) c = zoomer(c, complet, 10, 1 / 1.5);
    expect(c).toEqual(complet);
    expect(estComplet(c, complet)).toBe(true);
  });
});

describe('deplacer', () => {
  const complet = { x: 0, y: 0, w: 200, h: 100 };
  it('deplace un cadre agrandi, sans passer le bord', () => {
    const c = { x: 50, y: 25, w: 100, h: 50 };
    const d = deplacer(c, complet, 10, 30, -10);
    proche(d.x, 80); proche(d.y, 15);
    const bord = deplacer(c, complet, 10, 500, 500);
    proche(bord.x, 100); proche(bord.y, 50);
  });
  it('ne deplace rien quand tout est vu', () => {
    expect(deplacer(complet, complet, 10, 40, 40)).toEqual(complet);
  });
});

describe('de l ecran au dessin', () => {
  it('suit le cadrage centre de preserveAspectRatio (meet)', () => {
    // Un cadre 200 x 100 dans une boite 400 x 400 : 2 px par unite, 100 px de bande en haut et en bas.
    const cadre = { x: 10, y: 20, w: 200, h: 100 }, boite = { largeur: 400, hauteur: 400 };
    proche(unitesParPixel(cadre, boite), 0.5);
    const p = pointDuCadre(cadre, boite, 0, 100);
    proche(p.x, 10); proche(p.y, 20);
    const q = pointDuCadre(cadre, boite, 400, 300);
    proche(q.x, 210); proche(q.y, 120);
  });
});

describe('un toucher ou un glisser', () => {
  it('quelques pixels restent un toucher ; au-dela, un glisser', () => {
    expect(estUnGlisser(0, 0)).toBe(false);
    expect(estUnGlisser(3, 4)).toBe(false);
    expect(estUnGlisser(SEUIL_GLISSER_PX, 1)).toBe(true);
    expect(estUnGlisser(0, -20)).toBe(true);
  });
});
