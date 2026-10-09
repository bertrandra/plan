import { describe, it, expect } from 'vitest';
import { centreSouhaite, facadeAuSoleil, maisonDe, RETRAIT_PISCINE_M } from '../../../src/model/placement.js';
import { creerCreation } from '../../../src/model/creation.js';
import { pointInPolygon } from '../../../src/geometry/basic.js';
import { distancePointContour } from '../../../src/geometry/proximite.js';
import type { ObjetPlan, PtBrut } from '../../../src/model/types.js';

// La place d'un ouvrage neuf (model/placement.ts) : contre la maison au soleil, au jardin, pres de
// la rue, sur la terrasse — et le centre de la parcelle quand rien ne guide.

const rect = (x0: number, y0: number, l: number, h: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x0 + l, y: y0 }, { x: x0 + l, y: y0 + h }, { x: x0, y: y0 + h }];
const parcelle = (): ObjetPlan => ({ key: 'parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 30, 40) } as unknown as ObjetPlan);
// La maison au nord de la parcelle, 12 x 8 m : sa facade sud est le cote y = 24.
const maison = (): ObjetPlan => ({ key: 'maison', type: 'polygon', fonction: 'batiment', elevation: 6, pts: rect(9, 24, 12, 8) } as unknown as ObjetPlan);
const annexe = (): ObjetPlan => ({ key: 'abri', type: 'polygon', fonction: 'batiment', elevation: 2.5, pts: rect(1, 1, 3, 2) } as unknown as ObjetPlan);
const voisin = (): ObjetPlan => ({ key: 'bati-v', type: 'polygon', fonction: 'batiment', voisinage: true, elevation: 6, pts: rect(40, 0, 20, 20) } as unknown as ObjetPlan);

describe('maisonDe et facadeAuSoleil', () => {
  it('prend le plus grand batiment du projet dans la parcelle, pas une annexe ni un voisin', () => {
    expect(maisonDe([parcelle(), annexe(), maison(), voisin()])?.key).toBe('maison');
    expect(maisonDe([parcelle(), voisin()])).toBeNull();
    const f = facadeAuSoleil([parcelle(), maison()])!;
    expect(f.milieu).toEqual({ x: 15, y: 24 });
    expect(f.n.y).toBeCloseTo(-1, 9);
    expect(f.L).toBe(12);
  });
});

describe('centreSouhaite', () => {
  it('colle la terrasse a la facade sud de la maison, et la pergola et le parasol sur la terrasse', () => {
    const objets = [parcelle(), maison()];
    const t = centreSouhaite('terrasse', { objets }, 4, 3)!;
    expect(t.x).toBeCloseTo(15, 9);
    expect(t.y).toBeCloseTo(24 - 1.5 - 0.1, 9);
    // Sans terrasse, la pergola va la ou la terrasse irait.
    expect(centreSouhaite('pergola', { objets }, 4, 3)!.y).toBeCloseTo(22.4, 9);
    const terrasse = { key: 't', type: 'polygon', fonction: 'terrasse', pts: rect(5, 5, 6, 4) } as unknown as ObjetPlan;
    expect(centreSouhaite('pergola', { objets: [...objets, terrasse] }, 4, 3)).toEqual({ x: 8, y: 7 });
    expect(centreSouhaite('parasol', { objets: [...objets, terrasse] }, 3, 3)).toEqual({ x: 8, y: 7 });
  });

  it('met la piscine au jardin : loin des limites, hors de l ombre de la maison, au sud', () => {
    const objets = [parcelle(), maison()];
    const p = centreSouhaite('piscine', { objets }, 8, 4)!;
    expect(pointInPolygon(p, rect(0, 0, 30, 40))).toBe(true);
    expect(distancePointContour(p, rect(0, 0, 30, 40))).toBeGreaterThanOrEqual(RETRAIT_PISCINE_M + 4);
    expect(distancePointContour(p, rect(9, 24, 12, 8))).toBeGreaterThanOrEqual(8);
    expect(p.y).toBeLessThan(24);
  });

  it('met le carport pres de la rue, et ne devine rien sans rue, sans maison, sans parcelle', () => {
    const objets = [parcelle(), maison()];
    // Le cote 0 (y = 0) est sur rue : un metre en retrait, au milieu.
    expect(centreSouhaite('carport', { objets, coteRue: 0 }, 3, 5)).toEqual({ x: 15, y: 3.5 });
    expect(centreSouhaite('carport', { objets, coteRue: null }, 3, 5)).toBeNull();
    expect(centreSouhaite('terrasse', { objets: [parcelle()] }, 4, 3)).toBeNull();
    expect(centreSouhaite('piscine', { objets: [] }, 8, 4)).toBeNull();
  });
});

describe('a la creation', () => {
  function monter(objets: ObjetPlan[], coteRue: number | null = 0) {
    const etat = { objects: objets, selectedKey: null, terrasseSelectedKey: null } as never;
    const rien = () => {};
    const c = creerCreation(etat, { pushHistory: rien, createObjectDOM: rien, rebuildHandles: rien, reapplyStackingOrder: rien, rebuildSelector: rien, render: rien, detruireVue: rien, serializeObjects: () => [], normalizeObjects: () => [], showToast: rien, showConfirm: rien, coteRue: () => coteRue } as never);
    return { c, etat: etat as { objects: ObjetPlan[] } };
  }
  const centreDe = (o: ObjetPlan) => { const pts = (o as { pts: PtBrut[] }).pts; return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }; };

  it('la terrasse nait contre la maison, la piscine au jardin, le carport pres de la rue', () => {
    const { c, etat } = monter([parcelle(), maison()]);
    c.ajouterTerrasse({});
    const t = centreDe(etat.objects[2]!);
    expect(t.x).toBeCloseTo(15, 9);
    expect(t.y).toBeCloseTo(22.4, 9);
    c.ajouterPiscine('rectangle');
    const p = centreDe(etat.objects[3]!);
    expect(p.y).toBeLessThan(20);
    expect(distancePointContour(p, rect(9, 24, 12, 8))).toBeGreaterThan(6);
    c.ajouterAbri('carport');
    expect(centreDe(etat.objects[4]!)).toEqual({ x: 15, y: 3.5 });
  });

  it('sans maison ni rue, tout nait au centre de la parcelle comme avant', () => {
    const { c, etat } = monter([parcelle()], null);
    c.ajouterTerrasse({});
    expect(centreDe(etat.objects[1]!)).toEqual({ x: 15, y: 20 });
    const seul = monter([parcelle()], null);
    seul.c.ajouterAbri('carport');
    expect(centreDe(seul.etat.objects[1]!)).toEqual({ x: 15, y: 20 });
  });
});
