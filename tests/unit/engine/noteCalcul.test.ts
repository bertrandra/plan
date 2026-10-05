import { describe, it, expect } from 'vitest';
import { coefficientsToiture, formaliteUrbanisme, mu1, neigeAuSol, noteDeCalcul, pressionDePointe } from '../../../src/engine/noteCalcul.js';
import type { ObjetPlan, Pergola } from '../../../src/model/types.js';

const abri = (fonction: string, L: number, l: number, p: Pergola): ObjetPlan => ({
  key: 'a', name: 'Abri', type: 'polygon', fonction,
  pts: [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: l }, { x: 0, y: l }], pergola: p
});
const zones = { zoneNeige: 'C1', zoneVent: 2, altitude: 300 } as const;

describe('neige (NF EN 1991-1-3, annexe nationale)', () => {
  it('donne s_k par region et le majore avec l\'altitude, sans saut entre les tranches', () => {
    expect(neigeAuSol('A1', 150)).toBeCloseTo(0.45);
    expect(neigeAuSol('C1', 300)).toBeCloseTo(0.75);
    expect(neigeAuSol('E', 600)).toBeCloseTo(2.2);
    for (const z of ['A2', 'E'] as const) for (const A of [500, 1000]) expect(neigeAuSol(z, A - 1e-6)).toBeCloseTo(neigeAuSol(z, A + 1e-6), 4);
  });

  it('reduit la neige sur un versant au-dela de 30°', () => {
    expect(mu1(10)).toBe(0.8);
    expect(mu1(45)).toBeCloseTo(0.4);
    expect(mu1(60)).toBe(0);
  });
});

describe('vent (NF EN 1991-1-4, annexe nationale)', () => {
  it('calcule la pression de pointe sous la hauteur minimale du terrain', () => {
    // Region 2, terrain IIIa : z = 3 m < zmin = 5 m.
    expect(pressionDePointe(2, 'IIIa', 3)).toBeCloseTo(0.498, 2);
    expect(pressionDePointe(4, 'II', 3)).toBeGreaterThan(pressionDePointe(1, 'II', 3));
    expect(pressionDePointe(2, 'II', 3)).toBeGreaterThan(pressionDePointe(2, 'IV', 3));
  });

  it('interpole les coefficients de toiture isolee selon la pente et l\'obstruction', () => {
    expect(coefficientsToiture(false, 7.5, 0)).toEqual({ bas: expect.closeTo(0.45), haut: expect.closeTo(0.8) });
    expect(coefficientsToiture(false, 0, 1).haut).toBeCloseTo(1.3);
    expect(coefficientsToiture(true, 30, 0)).toEqual({ bas: expect.closeTo(0.9), haut: expect.closeTo(1.0) });
  });
});

describe('urbanisme', () => {
  it('donne la formalite selon l\'emprise au sol', () => {
    expect(formaliteUrbanisme(4, false)).toMatch(/aucune formalité/);
    expect(formaliteUrbanisme(15, false)).toMatch(/déclaration préalable/);
    expect(formaliteUrbanisme(30, true)).toMatch(/adossée.*PLU/);
    expect(formaliteUrbanisme(30, false)).toMatch(/permis de construire/);
  });
});

describe('note de calcul', () => {
  it('ne calcule rien sans les regions de neige et de vent', () => {
    const n = noteDeCalcul(abri('pergola', 4, 3, {}))!;
    expect(n.manque).toEqual(['la région de neige', 'la région de vent']);
    expect(n.charges).toBeNull();
    expect(n.urbanisme).toMatch(/12,0 m²/);
  });

  it('ne met pas de neige sur une toile', () => {
    const n = noteDeCalcul(abri('pergola', 4, 3, { calcul: { ...zones } }))!;
    expect(n.charges!.s).toBe(0);
    expect(n.verifs.map(v => v.role)).toEqual(['chevron', 'poutre', 'poteau', 'contrefiche']);
    n.verifs.forEach(v => expect(v.taux).toBeLessThanOrEqual(1));
  });

  it('verifie un carport, et propose la section qui suffit quand la neige est forte', () => {
    const ok = noteDeCalcul(abri('carport', 3, 5, { calcul: { ...zones } }))!;
    expect(ok.charges!.s).toBeCloseTo(0.6);
    const lourd = noteDeCalcul(abri('carport', 3, 5, { calcul: { zoneNeige: 'E', zoneVent: 2, altitude: 800 } }))!;
    const chevron = lourd.verifs.find(v => v.role === 'chevron')!;
    expect(chevron.taux).toBeGreaterThan(1);
    expect(chevron.proposition).toMatch(/mm|aucune/);
    if (/mm/.test(chevron.proposition!)) {
      const sec = chevron.proposition!.replace(' mm', '').replace(' × ', 'x');
      const repris = noteDeCalcul(abri('carport', 3, 5, { sectionChevron: sec, calcul: { zoneNeige: 'E', zoneVent: 2, altitude: 800 } }))!;
      expect(repris.verifs.find(v => v.role === 'chevron')!.taux).toBeLessThanOrEqual(1);
    }
  });

  it('adossee : le mur reprend le vent et une charge par metre de lisse', () => {
    const n = noteDeCalcul(abri('pergola', 4, 3, { toit: 'appentis', materiau: 'aluminium', adossee: true, calcul: { ...zones } }))!;
    expect(n.ancrage!.horizontal).toBe(0);
    expect(n.chargeMur).toBeGreaterThan(0);
    expect(n.verifs.find(v => v.role === 'poteau')!.modele).toMatch(/L_f = 2,4/);
  });

  it('sans contrefiches, le poteau est une console : moment en pied et plot plus gros', () => {
    const avec = noteDeCalcul(abri('pergola', 4, 3, { calcul: { ...zones } }))!;
    const sans = noteDeCalcul(abri('pergola', 4, 3, { avecContrefiches: false, calcul: { ...zones } }))!;
    expect(avec.ancrage!.moment).toBe(0);
    expect(sans.ancrage!.moment).toBeGreaterThan(0);
    expect(sans.ancrage!.plot).toBeGreaterThanOrEqual(avec.ancrage!.plot);
  });

  it('souleve davantage sous un carport encombre', () => {
    const vide = noteDeCalcul(abri('carport', 3, 5, { calcul: { ...zones, obstruction: 0 } }))!;
    const plein = noteDeCalcul(abri('carport', 3, 5, { calcul: { ...zones, obstruction: 1 } }))!;
    expect(plein.charges!.cfHaut).toBeGreaterThan(vide.charges!.cfHaut);
    expect(plein.ancrage!.soulevement).toBeGreaterThan(vide.ancrage!.soulevement);
  });
});
