import { describe, it, expect } from 'vitest';
import { ajusterToit, ECHANTILLONS_MIN, ECART_MAX_M, type EchantillonHauteur } from '../../../src/facade/toitLidar.js';
import { hauteurSurPans, facettesToit, plansDuToit, hauteurToitEn } from '../../../src/facade/toit.js';
import type { PtBrut, Toit } from '../../../src/model/types.js';

// Le toit ajuste sur des hauteurs mesurees (MD/spec-toit-ign.md §10) : on fabrique les mesures
// qu'un MNH donnerait sur un toit connu, avec du bruit, et l'on verifie que l'ajustement retrouve
// la forme, la hauteur et l'egout.

const p = (x: number, y: number): PtBrut => ({ x, y });
const maison = [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];
/** Un bruit reproductible, dans [-a, a]. */
function bruit(graine: number, a: number): () => number {
  let s = graine;
  return () => { s = (s * 16807) % 2147483647; return ((s / 2147483647) * 2 - 1) * a; };
}
/** Les mesures d'un MNH tous les 50 cm sous le contour, pour un toit donne au-dessus d'un egout. */
function mesures(pts: PtBrut[], toit: Toit, egout: number, amplitudeBruit = 0.08, graine = 7): EchantillonHauteur[] {
  const b = bruit(graine, amplitudeBruit);
  const plans = plansDuToit(pts, toit);
  const pans = toit.forme === 'croupes' ? facettesToit(pts, toit).pans : null;
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
  const out: EchantillonHauteur[] = [];
  for (let x = Math.min(...xs) + 0.75; x < Math.max(...xs) - 0.7; x += 0.5) {
    for (let y = Math.min(...ys) + 0.75; y < Math.max(...ys) - 0.7; y += 0.5) {
      const z = pans ? hauteurSurPans(pans, { x, y }) ?? 0 : hauteurToitEn(plans, { x, y });
      out.push({ x, y, z: egout + z + b() });
    }
  }
  return out;
}

describe('hauteurSurPans', () => {
  it('lit la hauteur sur le pan qui contient le point, et rien hors du contour', () => {
    const pans = facettesToit(maison, { forme: 'croupes', hauteur: 3, angleFaitage: 0 }).pans;
    // Au centre d'un rectangle de 8 m de large, les croupes culminent a 3 m.
    expect(hauteurSurPans(pans, p(6, 4))).toBeCloseTo(3, 6);
    // A 1 m du long mur, la pente est de 3/4 : 0,75 m.
    expect(hauteurSurPans(pans, p(6, 1))).toBeCloseTo(0.75, 6);
    expect(hauteurSurPans(pans, p(-1, 4))).toBe(null);
  });
});

describe('ajusterToit', () => {
  it('retrouve un toit a deux pans dans l axe du long mur, sa hauteur et son egout', () => {
    const r = ajusterToit(maison, mesures(maison, { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, 5.6))!;
    expect(r).not.toBeNull();
    expect(r.toit).toMatchObject({ forme: 'deux-pans', angleFaitage: 0, source: 'lidar' });
    expect(r.toit.hauteur).toBeCloseTo(3, 0.5);
    expect(Math.abs(r.toit.hauteur - 3)).toBeLessThan(0.15);
    expect(Math.abs(r.egout - 5.6)).toBeLessThan(0.15);
    expect(r.ecart).toBeLessThan(0.1);
    expect(r.echantillons).toBeGreaterThan(ECHANTILLONS_MIN);
  });

  it('distingue le faitage en travers (pignons sur les longs murs)', () => {
    const r = ajusterToit(maison, mesures(maison, { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 90 }, 6))!;
    expect(r.toit).toMatchObject({ forme: 'deux-pans', angleFaitage: 90 });
    expect(Math.abs(r.toit.hauteur - 2.5)).toBeLessThan(0.15);
  });

  it('prefere les croupes au quatre pans quand les mesures ne les departagent pas', () => {
    const r = ajusterToit(maison, mesures(maison, { forme: 'croupes', hauteur: 3, angleFaitage: 0 }, 6))!;
    expect(r.toit.forme).toBe('croupes');
    expect(Math.abs(r.toit.hauteur - 3)).toBeLessThan(0.15);
  });

  it('rend un toit plat pour un toit-terrasse, et pour un toit trop bas', () => {
    const plat = ajusterToit(maison, mesures(maison, { forme: 'plat', hauteur: 0, angleFaitage: 0 }, 7))!;
    expect(plat.toit).toMatchObject({ forme: 'plat', hauteur: 0, source: 'lidar' });
    expect(Math.abs(plat.egout - 7)).toBeLessThan(0.1);
    const bas = ajusterToit(maison, mesures(maison, { forme: 'deux-pans', hauteur: 0.3, angleFaitage: 0 }, 7))!;
    expect(bas.toit.forme).toBe('plat');
  });

  it('ecarte un arbre qui deborde sur le toit, puis refait l ajustement', () => {
    const m = mesures(maison, { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 }, 5);
    // Un arbre de 4 m au-dessus du toit sur un coin : un dixieme des mesures.
    const avecArbre = m.map(e => (e.x < 3 && e.y < 3 ? { ...e, z: e.z + 4 } : e));
    const r = ajusterToit(maison, avecArbre)!;
    expect(r.toit).toMatchObject({ forme: 'deux-pans', angleFaitage: 0 });
    expect(Math.abs(r.toit.hauteur - 3)).toBeLessThan(0.2);
    expect(r.echantillons).toBeLessThan(m.length);
  });

  it('renonce quand aucune forme simple n explique les mesures, ou qu il y en a trop peu', () => {
    // Deux corps a des hauteurs tres differentes sous un seul contour : rien de simple ne colle.
    const m = mesures(maison, { forme: 'plat', hauteur: 0, angleFaitage: 0 }, 5).map(e => (e.x > 6 ? { ...e, z: e.z + 3.5 } : e));
    expect(ajusterToit(maison, m)).toBe(null);
    expect(ECART_MAX_M).toBe(0.8);
    expect(ajusterToit(maison, mesures(maison, { forme: 'plat', hauteur: 0, angleFaitage: 0 }, 5).slice(0, ECHANTILLONS_MIN - 1))).toBe(null);
    expect(ajusterToit([p(0, 0), p(1, 0)], [])).toBe(null);
  });

  it('renonce a une pente qui n est pas celle d une couverture', () => {
    // 6 m de faitage sur 4 m de demi-largeur : 56 degres, au-dela de l'ecretage BD TOPO.
    expect(ajusterToit(maison, mesures(maison, { forme: 'deux-pans', hauteur: 6.2, angleFaitage: 0 }, 5))).toBe(null);
  });
});
