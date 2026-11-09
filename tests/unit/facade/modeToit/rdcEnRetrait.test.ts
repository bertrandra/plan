import { describe, it, expect } from 'vitest';
import {
  accorderLesRetraits, corpsAuPied, corpsDeSaillie, facettesBowWindow, facettesEncorbellement, morceauxSousEtage, murDuCorps, profondeurDOuverture, replacerSaillie, retraitDuRdc,
  retraitsDuRdc, retraitsSurLaFacade
} from '../../../../src/facade/modeToit/saillies.js';
import { appliquerChoix, groupesDe, valeurDuGroupe, type CibleElement } from '../../../../src/facade/modeToit/elements.js';
import { saillieValide } from '../../../../src/model/corpsToitEtendu.js';
import type { CorpsToit, SaillieFacade } from '../../../../src/model/types.js';

// Une maison a etage : 10 x 6 m, egout a 5,5 m. Le mur 0 (y = 0) donne sur la rue, sa normale sortante vers y < 0.
const maison = (): CorpsToit => ({ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], posFaitage: 3, faitage: 9, egouts: [5.5, 5.5], pignons: [], ecart: 0 });
const bow = (plus: Partial<SaillieFacade> = {}): SaillieFacade => ({ genre: 'bow-window', hote: 0, mur: 0, centreM: 5, largeurM: 2.4, profondeurM: 0.8, forme: 'pans', niveau: 'rdc', toit: 'pan', ...plus });
const avecBows = (...s: SaillieFacade[]): CorpsToit[] => { const h = maison(); return [h, ...s.map((x) => corpsDeSaillie(h, x))]; };
const cible = (rang: number): CibleElement => ({ type: 'saillie', rang, i: 0 });

describe('le rez-de-chaussee en retrait sous l etage', () => {
  it('sans retrait, le bow-window est celui d avant, octet pour octet', () => {
    const h = maison();
    const avant = corpsDeSaillie(h, bow());
    expect(avant.saillie).not.toHaveProperty('rdcEnRetraitM');
    expect(JSON.stringify(corpsDeSaillie(h, bow({ rdcEnRetraitM: undefined })))).toBe(JSON.stringify(avant));
    expect(retraitsDuRdc([h, avant]).size).toBe(0);
    expect(corpsAuPied(h, undefined)).toBe(h);
    const l = [h, avant];
    expect(accorderLesRetraits(l)).toEqual(l);
  });

  it('glisse le bow-window sous l etage : il part du mur recule, son avant a fleur de l etage, du sol au dessous de l etage, sans toit propre', () => {
    const c = corpsDeSaillie(maison(), bow({ rdcEnRetraitM: 0.8 }));
    // Le cote contre la maison est sur le mur recule (y = 0,8), l'avant sur le nu de l'etage (y = 0).
    expect(c.pts[0]!.y).toBeCloseTo(0.8, 2);
    expect(c.pts[3]!.y).toBeCloseTo(0, 2);
    expect(Math.min(...c.egouts)).toBeCloseTo(2.7, 2);
    expect(c.faitage).toBe(c.egouts[0]);
    expect(c.croupes).toBeUndefined();
    // Pas de couverture : le dessus se ferme, l'etage le couvre ; le choix du toit reste ecrit.
    const f = facettesBowWindow(c);
    expect(f.pans).toHaveLength(0);
    expect(c.saillie!.toit).toBe('pan');
    // Sa hauteur propre, si la personne la regle, est le dessous de l'etage ; jamais au-dessus de l'egout.
    expect(Math.min(...corpsDeSaillie(maison(), bow({ rdcEnRetraitM: 0.8, hauteurM: 3 })).egouts)).toBeCloseTo(3, 2);
    expect(Math.min(...corpsDeSaillie(maison(), bow({ rdcEnRetraitM: 0.8, niveau: 'toit', hauteurM: 9 })).egouts)).toBeCloseTo(5.5, 2);
  });

  it('borne le recul : au moins 10 cm, au plus 3 m, et une piece d un metre derriere', () => {
    expect(corpsDeSaillie(maison(), bow({ rdcEnRetraitM: 0.02 })).saillie!.rdcEnRetraitM).toBe(0.1);
    expect(corpsDeSaillie(maison(), bow({ rdcEnRetraitM: 9 })).saillie!.rdcEnRetraitM).toBe(3);
    const etroite: CorpsToit = { ...maison(), pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 2 }, { x: 0, y: 2 }] };
    expect(corpsDeSaillie(etroite, bow({ rdcEnRetraitM: 2 })).saillie!.rdcEnRetraitM).toBe(1);
    // Une galerie n'a pas de rez-de-chaussee en retrait.
    expect(retraitDuRdc({ ...bow({ rdcEnRetraitM: 1 }), genre: 'galerie' })).toBe(0);
  });

  it('recule le pied du corps hote sur toute la largeur du mur ; l etage reste au nu de la facade', () => {
    const l = avecBows(bow({ rdcEnRetraitM: 0.8 }));
    const r = retraitsDuRdc(l).get(l[0]!);
    expect(r).toEqual([{ mur: 0, reculM: 0.8, hauteurM: 2.7, devant: [[l[1]!.pts[0], l[1]!.pts[1]]] }]);
    const pied = corpsAuPied(l[0]!, r);
    expect(pied.pts).toEqual([{ x: 0, y: 0.8 }, { x: 10, y: 0.8 }, { x: 10, y: 6 }, { x: 0, y: 6 }]);
    // Le corps lui-meme ne bouge pas (le toit, les murs hauts restent sur son rectangle).
    expect(l[0]!.pts[0]).toEqual({ x: 0, y: 0 });
    // L'etage qui avance : le dessous a 2,7 m entre le nu et le mur recule, le mur au nu jusqu'a l'egout, ses deux retours, le dessus.
    const faces = facettesEncorbellement(l[0]!, r);
    expect(faces).toHaveLength(5);
    const dessous = faces[0]!;
    expect(dessous.every((q) => q.z === 2.7)).toBe(true);
    expect(Math.min(...dessous.map((q) => q.y))).toBeCloseTo(0, 6);
    expect(Math.max(...dessous.map((q) => q.y))).toBeCloseTo(0.8, 6);
    const nu = faces[1]!;
    expect(nu.every((q) => Math.abs(q.y) < 1e-9)).toBe(true);
    expect(Math.max(...nu.map((q) => q.z))).toBe(5.5);
  });

  it('un seul rez-de-chaussee par mur : le plus grand recul, et l autre bow-window s adapte', () => {
    const l = accorderLesRetraits(avecBows(bow({ centreM: 2.5, largeurM: 2 }), bow({ centreM: 7.5, largeurM: 2, rdcEnRetraitM: 1 })));
    expect(l[1]!.saillie!.rdcEnRetraitM).toBe(1);
    expect(l[1]!.pts[0]!.y).toBeCloseTo(1, 2);
    expect(retraitsDuRdc(l).get(l[0]!)![0]!.devant).toHaveLength(2);
    // Celui que la personne regle mene : un plus petit recul s'applique aux deux, le retirer les remet tous deux devant le mur.
    const moins = replacerSaillie(l, 1, { rdcEnRetraitM: 0.5 });
    expect([moins[1]!.saillie!.rdcEnRetraitM, moins[2]!.saillie!.rdcEnRetraitM]).toEqual([0.5, 0.5]);
    const sans = replacerSaillie(moins, 2, { rdcEnRetraitM: undefined });
    expect(sans.slice(1).map((c) => retraitDuRdc(c.saillie))).toEqual([0, 0]);
    // Un autre reglage (la forme) ne retire pas le retrait du voisin.
    const forme = replacerSaillie(l, 1, { forme: 'arc' });
    expect(forme.slice(1).map((c) => c.saillie!.rdcEnRetraitM)).toEqual([1, 1]);
    // La hauteur sous l'etage est la meme pour les deux.
    const haut = replacerSaillie(l, 2, { hauteurM: 3 });
    expect(haut.slice(1).map((c) => Math.min(...c.egouts))).toEqual([3, 3]);
    // Un bow-window sur un autre mur garde sa facade droite.
    const ailleurs = accorderLesRetraits([...l, corpsDeSaillie(l[0]!, bow({ mur: 2 }))]);
    expect(retraitDuRdc(ailleurs[3]!.saillie)).toBe(0);
  });

  it('se lit et se garde a la relecture ; mal forme, il est retire et le bow-window reste', () => {
    expect(saillieValide({ ...bow(), rdcEnRetraitM: 0.8 })).toEqual({ ...bow(), rdcEnRetraitM: 0.8 });
    expect(saillieValide({ ...bow(), rdcEnRetraitM: -1 })).toEqual(bow());
    expect(saillieValide({ ...bow(), rdcEnRetraitM: 4 })).toEqual(bow());
    expect(saillieValide({ ...bow(), genre: 'galerie', rdcEnRetraitM: 1 })).not.toHaveProperty('rdcEnRetraitM');
  });

  it('au Mode Toit : le groupe « Rez-de-chaussée », a fleur de l etage par defaut ; niveau et toit propre s effacent', () => {
    let corps = avecBows(bow());
    expect(valeurDuGroupe(corps, cible(1), 'rdc')).toBe('0');
    corps = appliquerChoix(corps, cible(1), 'rdc', 'aligne');
    expect(corps[1]!.saillie!.rdcEnRetraitM).toBe(0.8);
    expect(valeurDuGroupe(corps, cible(1), 'rdc')).toBe('aligne');
    expect(groupesDe(corps, cible(1)).map((g) => g.groupe)).toEqual(['forme', 'rdc']);
    corps = appliquerChoix(corps, cible(1), 'rdc', '1');
    expect(valeurDuGroupe(corps, cible(1), 'rdc')).toBe('1');
    // Un recul regle a la main qui ne tombe sur aucun choix : rien n'est enfonce.
    expect(valeurDuGroupe(replacerSaillie(corps, 1, { rdcEnRetraitM: 0.65 }), cible(1), 'rdc')).toBeNull();
    corps = appliquerChoix(corps, cible(1), 'rdc', '0');
    expect(corps[1]!.saillie).not.toHaveProperty('rdcEnRetraitM');
    expect(groupesDe(corps, cible(1)).map((g) => g.groupe)).toEqual(['forme', 'niveau', 'rdc', 'toit']);
    expect(murDuCorps(corps[0]!, 0).L).toBe(10);
  });
});

describe('la photo d un releve sur un rez-de-chaussee en retrait (decision du proprietaire, 9 novembre 2026)', () => {
  // Les facades de la maison, vues de dehors : la rue (mur 0, y = 0) et le pignon est (mur 1, x = 10).
  const rue = { gauche: { x: 0, y: 0 }, droite: { x: 10, y: 0 }, largeur: 10, normale: { x: 0, y: -1 } };
  const est = { gauche: { x: 10, y: 0 }, droite: { x: 10, y: 6 }, largeur: 6, normale: { x: 1, y: 0 } };
  const nord = { gauche: { x: 10, y: 6 }, droite: { x: 0, y: 6 }, largeur: 10, normale: { x: 0, y: 1 } };
  const aire = (c: { x: number; y: number }[]) => Math.abs(c.reduce((t, q, i) => { const r = c[(i + 1) % c.length]!; return t + q.x * r.y - r.x * q.y; }, 0)) / 2;

  it('lit le retrait sur la facade qui le porte : toute la largeur du mur, le recul, le dessous de l etage, le bow-window devant', () => {
    const l = avecBows(bow({ rdcEnRetraitM: 0.8 }));
    const r = retraitsSurLaFacade(rue, retraitsDuRdc(l));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ de: 0, a: 10, hauteurM: 2.7 });
    expect(r[0]!.profondeurM).toBeCloseTo(0.8, 9);
    expect(r[0]!.devant).toEqual([[3.8, 6.2]]);
    // Le pignon voisin, raccourci au pied : sous l'etage, son bout cote rue est l'entree du retrait, ouverte.
    expect(retraitsSurLaFacade(est, retraitsDuRdc(l))).toEqual([{ de: 0, a: 0.8, profondeurM: 0, hauteurM: 2.7, devant: [[0, 0.8]] }]);
    // Le mur d'en face n'en sait rien ; sans retrait, rien du tout.
    expect(retraitsSurLaFacade(nord, retraitsDuRdc(l))).toEqual([]);
    expect(retraitsSurLaFacade(rue, retraitsDuRdc(avecBows(bow())))).toEqual([]);
    expect(retraitsSurLaFacade(rue, null)).toEqual([]);
    // Un corps qui n'est pas dessine (un autre isole au Mode Toit) ne recule pas la photo.
    expect(retraitsSurLaFacade(rue, retraitsDuRdc(l), [])).toEqual([]);
  });

  it('coupe la photo au dessous de l etage : le haut au nu, le bas recule, rien derriere le bow-window ; la photo entiere sinon', () => {
    const l = avecBows(bow({ rdcEnRetraitM: 0.8 }));
    const mur = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5.5 }, { x: 0, y: 5.5 }];
    const m = morceauxSousEtage(mur, [[0, 10]], retraitsSurLaFacade(rue, retraitsDuRdc(l)));
    const haut = m.filter((k) => k.profondeurM === 0), bas = m.filter((k) => k.profondeurM > 0);
    expect(haut).toHaveLength(1);
    expect(Math.min(...haut[0]!.contour.map((q) => q.y))).toBeCloseTo(2.7, 9);
    expect(aire(haut[0]!.contour)).toBeCloseTo(10 * 2.8, 6);
    expect(bas).toHaveLength(2);
    expect(bas.every((k) => Math.abs(k.profondeurM - 0.8) < 1e-9 && Math.max(...k.contour.map((q) => q.y)) <= 2.7 + 1e-9)).toBe(true);
    expect(bas.reduce((t, k) => t + aire(k.contour), 0)).toBeCloseTo((10 - 2.4) * 2.7, 6);
    // Sous un appentis ouvert (portions fermees), la photo reste absente ou elle l'etait.
    const ouvert = morceauxSousEtage(mur, [[0, 2], [8, 10]], retraitsSurLaFacade(rue, retraitsDuRdc(l)));
    expect(ouvert.reduce((t, k) => t + aire(k.contour), 0)).toBeCloseTo(4 * 5.5, 6);
  });

  it('pose les baies du releve comme la disposition automatique : le bas sur le mur recule, rien derriere le bow-window ni a cheval', () => {
    const r = retraitsSurLaFacade(rue, retraitsDuRdc(avecBows(bow({ rdcEnRetraitM: 0.8 }))));
    expect(profondeurDOuverture({ x: 1.2, y: 0.9, l: 1.2, h: 1.35 }, r)).toBeCloseTo(0.8, 9);
    expect(profondeurDOuverture({ x: 4.6, y: 0, l: 0.95, h: 2.15 }, r)).toBeNull();
    expect(profondeurDOuverture({ x: 1.2, y: 3.8, l: 1.2, h: 1.35 }, r)).toBe(0);
    expect(profondeurDOuverture({ x: 1.2, y: 2, l: 1.2, h: 1.35 }, r)).toBeNull();
    expect(profondeurDOuverture({ x: 1.2, y: 0.9, l: 1.2, h: 1.35 }, [])).toBe(0);
  });
});
