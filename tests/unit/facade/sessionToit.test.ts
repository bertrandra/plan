import { describe, it, expect } from 'vitest';
import { aChange, annuler, creerHistorique, empiler, peutAnnuler, peutRetablir, photographier, restaurer, retablir, revenirAuDepart } from '../../../src/facade/regles/toits/sessionToit.js';
import { corpsVisibles, facadeProche, facadeVersLePoint, facadesDuBatiment, orientationDe } from '../../../src/facade/regles/toits/facadesDesCorps.js';
import { poseDeDessus, poseDeFacade } from '../../../src/three/poseFacade.js';
import type { CorpsToit, ObjetPlan } from '../../../src/model/types.js';

const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
const batiment = (): ObjetPlan => ({ key: 'b', type: 'polygon', pts: rect, toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } as unknown as ObjetPlan);
const corps = (): CorpsToit => ({ pts: rect, posFaitage: 3, faitage: 7, egouts: [3, 3], pignons: [], ecart: 0 });

describe('la session d edition du toit', () => {
  it('photographie une copie profonde, sans les champs absents', () => {
    const o = batiment();
    const c = photographier(o);
    expect(Object.keys(c)).toEqual(['toit']);
    (c.toit as { hauteur: number }).hauteur = 9;
    expect(o.toit?.hauteur).toBe(2.5);
  });

  it('annule, retablit et revient au depart, en retirant ce qui n existait pas', () => {
    const o = batiment(), h = creerHistorique(o);
    expect(peutAnnuler(h)).toBe(false);
    o.corpsToit = [corps()]; o.toitFige = true;
    expect(empiler(h, o)).toBe(true);
    o.corpsToit[0]!.faitage = 8;
    expect(empiler(h, o)).toBe(true);
    expect(aChange(h)).toBe(true);
    expect(annuler(h, o)).toBe(true);
    expect(o.corpsToit![0]!.faitage).toBe(7);
    expect(peutRetablir(h)).toBe(true);
    expect(retablir(h, o)).toBe(true);
    expect(o.corpsToit![0]!.faitage).toBe(8);
    expect(revenirAuDepart(h, o)).toBe(true);
    expect(o.corpsToit).toBeUndefined();
    expect(o.toitFige).toBeUndefined();
    // Revenir au depart est une etape : on peut l'annuler.
    expect(annuler(h, o)).toBe(true);
    expect(o.corpsToit![0]!.faitage).toBe(8);
  });

  it('un geste sans effet n empile rien, un geste apres annulation coupe la suite', () => {
    const o = batiment(), h = creerHistorique(o);
    expect(empiler(h, o)).toBe(false);
    o.toitFige = true; empiler(h, o);
    annuler(h, o);
    o.modeToit = 'corps'; empiler(h, o);
    expect(peutRetablir(h)).toBe(false);
    expect(h.pas).toHaveLength(2);
  });

  it('restaurer rend le depart sans rien garder de ce qui a ete pose', () => {
    const o = batiment(), depart = photographier(o);
    o.corpsToit = [corps()]; o.toitFige = true;
    restaurer(o, depart);
    expect(o.corpsToit).toBeUndefined();
    expect(o.toitFige).toBeUndefined();
    expect(o.toit?.hauteur).toBe(2.5);
  });
});

describe('les facades du batiment', () => {
  it('sans corps, les cotes du contour ; avec des corps, leurs murs', () => {
    expect(facadesDuBatiment(null, rect).map((f) => f.rang)).toEqual([null, null, null, null]);
    expect(facadesDuBatiment([corps(), corps()], rect)).toHaveLength(8);
  });

  it('le mur le plus proche d un point, avec sa normale sortante', () => {
    const f = facadeProche(facadesDuBatiment(null, rect), { x: 5, y: -0.4 })!;
    expect(f.mur).toBe(0);
    expect(f.n.y).toBeCloseTo(-1, 5);
    expect(f.L).toBeCloseTo(10, 5);
    const g = facadeProche(facadesDuBatiment(null, rect), { x: 10.6, y: 3 })!;
    expect(g.mur).toBe(1);
    expect(g.n.x).toBeCloseTo(1, 5);
  });

  it('nomme l orientation comme le releve de facade', () => {
    expect(typeof orientationDe(facadeProche(facadesDuBatiment(null, rect), { x: 5, y: 7 })!)).toBe('string');
  });

  it('un mur de biais a sa propre normale', () => {
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const biais = rect.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }));
    const f = facadeProche(facadesDuBatiment(null, biais), { x: 5 * c + 0.4 * s, y: 5 * s - 0.4 * c })!;
    expect(f.mur).toBe(0);
    expect(f.n.x).toBeCloseTo(s, 5);
    expect(f.n.y).toBeCloseTo(-c, 5);
  });
});

describe('la camera devant une facade', () => {
  it('se place sur la normale, a mi-hauteur, en regardant le milieu du mur', () => {
    const p = poseDeFacade({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -1 }, 7, { x: 5, y: 3 }, 50, 1.6);
    expect(p.cible.x).toBeCloseTo(0, 5);
    expect(p.cible.y).toBeCloseTo(3.5, 5);
    expect(p.cible.z).toBeCloseTo(3, 5);
    // La normale -y du plan devient +z de la scene : la camera est du cote z plus grand.
    expect(p.position.z).toBeGreaterThan(p.cible.z + 5);
    expect(p.position.x).toBeCloseTo(p.cible.x, 5);
    expect(p.position.y).toBeCloseTo(p.cible.y, 5);
  });

  it('se cadre dans la partie libre quand un panneau recouvre l ecran', () => {
    const sans = poseDeFacade({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -1 }, 7, { x: 5, y: 3 }, 50, 1.6);
    const colonne = poseDeFacade({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -1 }, 7, { x: 5, y: 3 }, 50, 1.6, { largeur: 1400, hauteur: 700, droite: 400, bas: 0 });
    // La camera recule (moins d'image libre) et se decale a droite : la facade passe a gauche, hors de la colonne.
    expect(Math.abs(colonne.position.z - colonne.cible.z)).toBeGreaterThan(Math.abs(sans.position.z - sans.cible.z));
    expect(colonne.cible.x).toBeGreaterThan(sans.cible.x + 0.5);
    const bandeau = poseDeFacade({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -1 }, 7, { x: 5, y: 3 }, 50, 1.6, { largeur: 1400, hauteur: 700, droite: 0, bas: 300 });
    expect(bandeau.cible.y).toBeLessThan(sans.cible.y);
  });

  it('recule davantage devant un long mur', () => {
    const court = poseDeFacade({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: -1 }, 5, { x: 0, y: 0 }, 50, 1.6);
    const long = poseDeFacade({ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: -1 }, 5, { x: 0, y: 0 }, 50, 1.6);
    expect(Math.abs(long.position.z - long.cible.z)).toBeGreaterThan(Math.abs(court.position.z - court.cible.z));
  });
});

describe('le navigateur et les vues du mode', () => {
  const aile = (): CorpsToit => ({ pts: [{ x: 10, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 4 }, { x: 10, y: 4 }], posFaitage: 0, faitage: 4, egouts: [3, 3], pignons: [], ecart: 0 });
  const bow = (): CorpsToit => ({ ...aile(), saillie: { genre: 'bow-window', hote: 0, mur: 0, centreM: 5, largeurM: 2, profondeurM: 1, forme: 'rectangle', niveau: 'rdc', toit: 'pan' } });

  it('tous les corps sont visibles tant qu aucun n est isole', () => {
    const l = [corps(), aile()];
    expect(corpsVisibles(l, null)).toHaveLength(2);
    expect(corpsVisibles(null, 0)).toBeNull();
  });

  it('isoler un corps garde ce qui est pose sur lui, et seulement lui', () => {
    const l = [corps(), aile(), bow()];
    expect(corpsVisibles(l, 0)!.map((c) => c.saillie?.genre ?? 'corps')).toEqual(['corps', 'bow-window']);
    expect(corpsVisibles(l, 1)).toHaveLength(1);
    // Un rang qui n'existe plus : tous les corps reviennent.
    expect(corpsVisibles(l, 9)).toHaveLength(3);
  });

  it('toucher un corps prend sa facade la plus tournee vers la camera', () => {
    const f = facadesDuBatiment([corps(), aile()], rect);
    expect(facadeVersLePoint(f, 0, { x: 5, y: -20 })!.mur).toBe(0);
    expect(facadeVersLePoint(f, 0, { x: 5, y: 30 })!.mur).toBe(2);
    expect(facadeVersLePoint(f, 0, { x: 40, y: 3 })!.mur).toBe(1);
    expect(facadeVersLePoint(f, 7, { x: 5, y: -20 })).toBeNull();
  });

  it('la camera de dessus est au-dessus du centre, presque a la verticale, et plus haut pour un grand batiment', () => {
    const petit = poseDeDessus({ x: 5, y: 3 }, 6, { x: 5, y: 3 }, 50, 1.6), grand = poseDeDessus({ x: 5, y: 3 }, 30, { x: 5, y: 3 }, 50, 1.6);
    expect(petit.cible).toEqual({ x: 0, y: 0, z: 0 });
    expect(petit.position.x).toBeCloseTo(0, 5);
    expect(petit.position.y).toBeGreaterThan(5);
    expect(Math.abs(petit.position.z)).toBeLessThan(petit.position.y * 0.05);
    expect(grand.position.y).toBeGreaterThan(petit.position.y);
  });
});
