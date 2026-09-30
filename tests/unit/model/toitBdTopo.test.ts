import { describe, it, expect } from 'vitest';
import { toitBdTopo, toitActualise, attributsToitBdTopo, type AttributsToit } from '../../../src/model/toitBdTopo.js';
import { facettesToit, penteDeg, plansDuToit, hauteurToitEn, COULEUR_TOIT_DEFAUT } from '../../../src/facade/toit.js';
import type { PtBrut, Toit } from '../../../src/model/types.js';

const p = (x: number, y: number): PtBrut => ({ x, y });
const maison = [p(0, 0), p(10, 0), p(10, 6), p(0, 6)];
const L = [p(0, 0), p(12, 0), p(12, 6), p(3, 6), p(3, 12), p(0, 12)];
const attr = (min: number | null, max: number | null, legere = false): AttributsToit => ({ altitudeToitMinM: min, altitudeToitMaxM: max, constructionLegere: legere });
const zMax = (pts: PtBrut[], t: Toit) => Math.max(...facettesToit(pts, t).pans.flatMap((pan) => pan.contour.map((q) => q.z)));

describe('le toit deduit de la BD TOPO (spec-toit-ign §4)', () => {
  it('lit les attributs bruts, virgule decimale comprise', () => {
    expect(attributsToitBdTopo({ altitude_minimale_toit: '48,2', altitude_maximale_toit: 51.7, construction_legere: 'True' })).toEqual(attr(48.2, 51.7, true));
    expect(attributsToitBdTopo({})).toEqual(attr(null, null, false));
  });

  it('regle 7 : des croupes a la hauteur lue, pente deduite du contour', () => {
    const t = toitBdTopo(maison, attr(100, 103));
    expect(t).toEqual({ forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'bdtopo' });
    expect(penteDeg(maison, t)).toBeCloseTo(45, 6);
    expect(zMax(maison, t)).toBeCloseTo(3, 6);
  });

  it('regle 2 : une construction legere a un toit plat', () => {
    expect(toitBdTopo(maison, attr(100, 103, true)).forme).toBe('plat');
  });

  it('regle 3 : sans altitudes, une pente de 35° et une hauteur dite estimee', () => {
    const t = toitBdTopo(maison, attr(100, null));
    expect(t.forme).toBe('croupes');
    expect(t.estime).toBe(true);
    expect(t.hauteur).toBeCloseTo(3 * Math.tan((35 * Math.PI) / 180), 2);
  });

  it('regles 4 et 5 : trop bas ou trop peu pentu, un toit plat', () => {
    expect(toitBdTopo(maison, attr(100, 100.4)).forme).toBe('plat');
    // 0,5 m sur 3 m de demi-largeur : 9,5°.
    expect(toitBdTopo(maison, attr(100, 100.5)).forme).toBe('plat');
    expect(toitBdTopo(maison, attr(100, 100.6)).forme).toBe('croupes');
  });

  it('regle 6 : trop raide, ecrete a 45°', () => {
    const t = toitBdTopo(maison, attr(100, 108));
    expect(t).toMatchObject({ forme: 'croupes', hauteur: 8, pente: 45 });
    // A 45° sur 3 m de demi-largeur, le toit culmine a 3 m, sous l'ecretage : rien n'est coupe.
    expect(zMax(maison, t)).toBeCloseTo(3, 6);
  });

  it('sur un L, chaque aile a son faitage, le plus haut a H', () => {
    const t = toitBdTopo(L, attr(50, 53));
    expect(zMax(L, t)).toBeCloseTo(3, 6);
    // L'aile etroite (3 m) culmine a mi-hauteur.
    const aile = facettesToit(L, t).pans.flatMap((pan) => pan.contour).filter((q) => q.y > 7);
    expect(Math.max(...aile.map((q) => q.z))).toBeCloseTo(1.5, 6);
  });
});

describe('les croupes en 3D', () => {
  it('sur un rectangle, les memes hauteurs que le quatre pans', () => {
    const croupes: Toit = { forme: 'croupes', hauteur: 3, angleFaitage: 0 };
    const quatre = plansDuToit(maison, { forme: 'quatre-pans', hauteur: 3, angleFaitage: 0 });
    const { pans, pignons } = facettesToit(maison, croupes);
    expect(pans).toHaveLength(4);
    expect(pignons).toHaveLength(0);
    pans.flatMap((pan) => pan.contour).forEach((q) => expect(q.z).toBeCloseTo(hauteurToitEn(quatre, q), 9));
  });

  it('ecrete : un pan horizontal a la hauteur, rien au-dessus', () => {
    const t: Toit = { forme: 'croupes', hauteur: 2, angleFaitage: 0, pente: 45 };
    const { pans } = facettesToit(maison, t);
    const z = pans.flatMap((pan) => pan.contour.map((q) => q.z));
    expect(Math.max(...z)).toBeCloseTo(2, 9);
    expect(pans.some((pan) => pan.contour.every((q) => Math.abs(q.z - 2) < 1e-9))).toBe(true);
    // L'emprise est toujours entierement couverte.
    const aire = pans.reduce((s, pan) => s + Math.abs(pan.contour.reduce((a, q, i) => {
      const r = pan.contour[(i + 1) % pan.contour.length]!;
      return a + q.x * r.y - r.x * q.y;
    }, 0)) / 2, 0);
    expect(aire).toBeCloseTo(60, 6);
  });

  it('la couverture est rouge par defaut', () => {
    expect(COULEUR_TOIT_DEFAUT).toBe('#B0432F');
  });
});

describe('l actualisation (spec-toit-ign §5.3)', () => {
  const photo: Toit = { forme: 'deux-pans', hauteur: 2.8, angleFaitage: 90, source: 'photo' };
  it('garde un toit lu sur une photo ou saisi', () => {
    expect(toitActualise(photo, maison, attr(100, 103))).toBe(photo);
    const saisi: Toit = { forme: 'plat', hauteur: 0, angleFaitage: 0, source: 'saisie' };
    expect(toitActualise(saisi, maison, attr(100, 103))).toBe(saisi);
  });

  it('recalcule un toit BD TOPO en gardant sa couleur, et en pose un la ou il n y en a pas', () => {
    const ancien: Toit = { forme: 'croupes', hauteur: 2.1, angleFaitage: 0, source: 'bdtopo', estime: true, couleur: '#445566' };
    expect(toitActualise(ancien, maison, attr(100, 103))).toEqual({ forme: 'croupes', hauteur: 3, angleFaitage: 0, source: 'bdtopo', couleur: '#445566' });
    expect(toitActualise(undefined, maison, attr(100, 103)).hauteur).toBe(3);
  });
});
