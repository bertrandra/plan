import { describe, it, expect } from 'vitest';
import { aChange, annuler, creerHistorique, empiler, peutAnnuler, peutRetablir, photographier, restaurer, retablir, revenirAuDepart } from '../../../../src/facade/modeToit/sessionToit.js';
import { corpsVisibles, facadeProche, facadeVersLePoint, facadesDuBatiment, orientationDe } from '../../../../src/facade/modeToit/facadesDesCorps.js';
import { OBLIQUE, cadreOblique, poseDeDessus } from '../../../../src/three/poseFacade.js';
import type { CorpsToit, ObjetPlan } from '../../../../src/model/types.js';
import { champsBatiment } from '../../../../src/model/champsFonction.js';

const rect = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }];
const batiment = (): ObjetPlan => ({ key: 'b', type: 'polygon', pts: rect, toit: { forme: 'deux-pans', hauteur: 2.5, angleFaitage: 0, source: 'bdtopo' } } as unknown as ObjetPlan);
const corps = (): CorpsToit => ({ pts: rect, posFaitage: 3, faitage: 7, egouts: [3, 3], pignons: [], ecart: 0 });

describe('la session d edition du toit', () => {
  it('photographie une copie profonde, sans les champs absents', () => {
    const o = batiment();
    const c = photographier(o);
    expect(Object.keys(c)).toEqual(['toit']);
    (c.toit as { hauteur: number }).hauteur = 9;
    expect(o.batiment?.toit?.hauteur).toBe(2.5);
  });

  it('annule, retablit et revient au depart, en retirant ce qui n existait pas', () => {
    const o = batiment(), h = creerHistorique(o);
    expect(peutAnnuler(h)).toBe(false);
    champsBatiment(o).corpsToit = [corps()]; champsBatiment(o).toitFige = true;
    expect(empiler(h, o)).toBe(true);
    o.batiment!.corpsToit![0]!.faitage = 8;
    expect(empiler(h, o)).toBe(true);
    expect(aChange(h)).toBe(true);
    expect(annuler(h, o)).toBe(true);
    expect(o.batiment?.corpsToit![0]!.faitage).toBe(7);
    expect(peutRetablir(h)).toBe(true);
    expect(retablir(h, o)).toBe(true);
    expect(o.batiment?.corpsToit![0]!.faitage).toBe(8);
    expect(revenirAuDepart(h, o)).toBe(true);
    expect(o.batiment?.corpsToit).toBeUndefined();
    expect(o.batiment?.toitFige).toBeUndefined();
    // Revenir au depart est une etape : on peut l'annuler.
    expect(annuler(h, o)).toBe(true);
    expect(o.batiment?.corpsToit![0]!.faitage).toBe(8);
  });

  it('un geste sans effet n empile rien, un geste apres annulation coupe la suite', () => {
    const o = batiment(), h = creerHistorique(o);
    expect(empiler(h, o)).toBe(false);
    champsBatiment(o).toitFige = true; empiler(h, o);
    annuler(h, o);
    champsBatiment(o).modeToit = 'corps'; empiler(h, o);
    expect(peutRetablir(h)).toBe(false);
    expect(h.pas).toHaveLength(2);
  });

  it('restaurer rend le depart sans rien garder de ce qui a ete pose', () => {
    const o = batiment(), depart = photographier(o);
    champsBatiment(o).corpsToit = [corps()]; champsBatiment(o).toitFige = true;
    restaurer(o, depart);
    expect(o.batiment?.corpsToit).toBeUndefined();
    expect(o.batiment?.toitFige).toBeUndefined();
    expect(o.batiment?.toit?.hauteur).toBe(2.5);
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

describe('la camera oblique de la facade', () => {
  // Un mur de 10 m le long de x (plan), normale sortante -y : vu de dehors, sa droite est +x de la scene.
  const mur = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -1 }] as const;
  const boite = [0, 10].flatMap((x) => [0, 6].flatMap((y) => [0, 7].map((h) => ({ x, y: h, z: -y }))));
  const ecran = (c: ReturnType<typeof cadreOblique>, p: { x: number; y: number; z: number }) => {
    // Le point dans le repere de la camera (inverse d'une rotation pure), puis la projection, en coordonnees normalisees.
    const m = c.monde, d = [p.x - (m[3] as number), p.y - (m[7] as number), p.z - (m[11] as number)];
    const v = [0, 1, 2].map((k) => (m[k] as number) * (d[0] as number) + (m[4 + k] as number) * (d[1] as number) + (m[8 + k] as number) * (d[2] as number));
    const q = c.projection;
    return { x: (q[0] as number) * (v[0] as number) + (q[2] as number) * (v[2] as number) + (q[3] as number), y: (q[5] as number) * (v[1] as number) + (q[6] as number) * (v[2] as number) + (q[7] as number) };
  };

  it('montre le mur a l echelle, sans fuite, et fait monter et glisser ce qui est derriere', () => {
    const c = cadreOblique(mur[0], mur[1], mur[2], boite, { x: 0, y: 0 }, 1000, 600);
    const g = ecran(c, { x: 0, y: 0, z: 0 }), d = ecran(c, { x: 10, y: 0, z: 0 }), h = ecran(c, { x: 0, y: 7, z: 0 });
    expect(d.x).toBeGreaterThan(g.x);
    expect(d.y).toBeCloseTo(g.y, 9);
    // Un metre de mur vaut autant a l'ecran en largeur qu'en hauteur (pixels carres).
    expect(((d.x - g.x) * 1000) / 10).toBeCloseTo(((h.y - g.y) * 600) / 7, 6);
    // Le coin du fond (6 m derriere le mur) glisse a droite et monte, de K et M fois sa profondeur.
    const fond = ecran(c, { x: 0, y: 0, z: -6 }), metre = (d.x - g.x) / 10;
    expect((fond.x - g.x) / metre).toBeCloseTo(6 * OBLIQUE.k, 6);
    expect(((fond.y - g.y) * 600) / (metre * 1000)).toBeCloseTo(6 * OBLIQUE.m, 6);
  });

  it('tient le batiment entier dans l image, et dans la partie libre quand un panneau la recouvre', () => {
    const libre = cadreOblique(mur[0], mur[1], mur[2], boite, { x: 0, y: 0 }, 1000, 600, { largeur: 1000, hauteur: 600, droite: 400, bas: 0 });
    for (const p of boite) {
      const e = ecran(libre, p);
      expect(Math.abs(e.y)).toBeLessThanOrEqual(1);
      // A gauche de la colonne du panneau : x normalise sous 1 - 2 * 400 / 1000.
      expect(e.x).toBeGreaterThanOrEqual(-1);
      expect(e.x).toBeLessThanOrEqual(0.2 + 1e-9);
    }
  });

  it('tourne avec un mur de biais : le mur reste horizontal a l ecran', () => {
    const a = { x: 0, y: 0 }, b = { x: 6, y: 8 }, n = { x: 0.8, y: -0.6 };
    const c = cadreOblique(a, b, n, [{ x: 0, y: 0, z: 0 }, { x: 6, y: 5, z: -8 }], { x: 0, y: 0 }, 800, 600);
    const pa = ecran(c, { x: a.x, y: 0, z: -a.y }), pb = ecran(c, { x: b.x, y: 0, z: -b.y });
    expect(pb.y).toBeCloseTo(pa.y, 9);
    expect(pb.x).toBeGreaterThan(pa.x);
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
