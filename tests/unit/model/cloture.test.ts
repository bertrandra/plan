import { describe, it, expect } from 'vitest';
import {
  clotureDe, synchroniserAnciensChamps, reglageDuCote, reglerCote, retirerCote, changerType, tronconsDuCote,
  nouveauPortail, coteDAcces, accolerPortillon, alertesAcces, alertesHauteur, vantauxDe, profilDuVantail,
  longueurDuCote, resumeReglage, resumeAcces, hauteurTotale, poserAcces, coteLePlusProche,
} from '../../../src/model/cloture.js';
import type { ObjetPlan, ObjetPolygone, Portail } from '../../../src/model/types.js';

// La cloture cote par cote et ses acces (model/cloture.ts, MD/spec-cloture.md §2) : lecture depuis
// les anciens champs, reglage d'un cote, troncons entre acces, alertes, accolement d'un portillon.

const parcelle = (plus: Partial<ObjetPlan> = {}): ObjetPolygone => ({
  key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'terrain',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
  ...plus,
} as ObjetPolygone);

describe('clotureDe', () => {
  it('se construit des anciens champs sans les ecrire', () => {
    const p = parcelle({ clotureActive: true, clotureHauteur: 2, clotureCouleur: '#e19951', clotureTexture: { id: 't', nom: 'T', url: 'u' } });
    const cl = clotureDe(p);
    expect(cl.active).toBe(true);
    expect(cl.defaut).toEqual({ type: 'palissade', hauteur: 2, couleur: '#e19951', texture: { id: 't', nom: 'T', url: 'u' } });
    expect(cl.cotes).toEqual([]);
    expect(cl.portails).toEqual([]);
    expect(p.cloture).toBeUndefined();
  });

  it('pose la structure sur la parcelle en mode creer, et tient les anciens champs a jour', () => {
    const p = parcelle({ clotureActive: false });
    const cl = clotureDe(p, true);
    expect(p.cloture).toBe(cl);
    cl.active = true;
    cl.defaut.hauteur = 1.2;
    cl.defaut.couleur = '#123456';
    synchroniserAnciensChamps(p);
    expect(p.clotureActive).toBe(true);
    expect(p.clotureHauteur).toBe(1.2);
    expect(p.clotureCouleur).toBe('#123456');
    expect(p.clotureTexture).toBeNull();
  });

  it('comble les tableaux manquants d une structure lue', () => {
    const p = parcelle({ cloture: { active: true, defaut: { type: 'mur', hauteur: 2 } } as never });
    const cl = clotureDe(p);
    expect(cl.cotes).toEqual([]);
    expect(cl.portails).toEqual([]);
  });
});

describe('cotes', () => {
  it('un cote regle a part suit son propre reglage, les autres le defaut', () => {
    const cl = clotureDe(parcelle({ clotureActive: true }), true);
    const c = reglerCote(cl, 2);
    changerType(c, 'mur');
    expect(reglageDuCote(cl, 2).type).toBe('mur');
    expect(reglageDuCote(cl, 0).type).toBe('palissade');
    expect(reglerCote(cl, 2)).toBe(c);
    retirerCote(cl, 2);
    expect(reglageDuCote(cl, 2).type).toBe('palissade');
  });

  it('changerType suit les defauts du type sans ecraser une couleur choisie', () => {
    const cl = clotureDe(parcelle(), true);
    changerType(cl.defaut, 'haie');
    expect(cl.defaut).toMatchObject({ type: 'haie', hauteur: 1.8, couleur: '#4f7a3a', epaisseur: 0.6 });
    cl.defaut.couleur = '#ff0000';
    cl.defaut.hauteur = 1.2;
    changerType(cl.defaut, 'mur');
    expect(cl.defaut).toMatchObject({ type: 'mur', hauteur: 1.2, couleur: '#ff0000', epaisseur: 0.2, soubassement: null });
  });

  it('hauteurTotale ajoute le soubassement', () => {
    expect(hauteurTotale({ type: 'grillage', hauteur: 1.5, soubassement: { hauteur: 0.5, parement: 'enduit' } })).toBe(2);
    expect(hauteurTotale({ type: 'aucune', hauteur: 1.5 })).toBe(0);
  });

  it('signale les cotes au-dela de la hauteur maximale de leur limite', () => {
    const cl = clotureDe(parcelle(), true);
    cl.hauteurMaxRue = 2;
    cl.hauteurMaxSeparative = 2.5;
    const rue = reglerCote(cl, 0); rue.limite = 'rue'; rue.hauteur = 2.2;
    const voisin = reglerCote(cl, 1); voisin.limite = 'separative'; voisin.hauteur = 2.2;
    const alertes = alertesHauteur(cl, 4);
    expect(alertes).toHaveLength(1);
    expect(alertes[0]).toContain('côté 1');
    expect(alertes[0]).toContain('sur rue');
  });
});

describe('acces', () => {
  it('un portail neuf se pose au milieu du cote sur rue, sinon du plus long', () => {
    const p = parcelle();
    const cl = clotureDe(p, true);
    expect(coteDAcces(cl, p.pts)).toBe(0);
    reglerCote(cl, 3).limite = 'rue';
    expect(coteDAcces(cl, p.pts)).toBe(3);
    const a = nouveauPortail('portail', 0, longueurDuCote(p.pts, 0));
    expect(a).toMatchObject({ nature: 'portail', cote: 0, x: 8.25, largeur: 3.5, ouverture: 'battant-2', piliers: { largeur: 0.3 } });
    expect(nouveauPortail('portillon', 0, 20)).toMatchObject({ nature: 'portillon', largeur: 1, ouverture: 'battant-1', x: 9.5 });
  });

  it('tronconsDuCote laisse la cloture entre les acces, piliers compris', () => {
    const cl = clotureDe(parcelle(), true);
    cl.portails.push({ ...nouveauPortail('portail', 0, 20), x: 5 });
    expect(tronconsDuCote(cl, 0, 20)).toEqual([{ debut: 0, fin: 4.7 }, { debut: 8.8, fin: 20 }]);
    cl.portails.push({ ...nouveauPortail('portillon', 0, 20), x: 8.8 + 0.3 });
    expect(tronconsDuCote(cl, 0, 20).map(t => ({ debut: +t.debut.toFixed(6), fin: +t.fin.toFixed(6) }))).toEqual([{ debut: 0, fin: 4.7 }, { debut: 10.4, fin: 20 }]);
    // Un acces hors du cote est tronque, pas ignore.
    cl.portails = [{ ...nouveauPortail('portail', 0, 20), x: 18 }];
    expect(tronconsDuCote(cl, 0, 20)).toEqual([{ debut: 0, fin: 17.7 }]);
    expect(tronconsDuCote(cl, 1, 10)).toEqual([{ debut: 0, fin: 10 }]);
  });

  it('les vantaux se partagent la largeur, avec un petit vantail au tiers', () => {
    const a = nouveauPortail('portail', 0, 20);
    expect(vantauxDe(a)).toEqual([1.75, 1.75]);
    a.petitVantail = 'gauche';
    expect(vantauxDe(a).map(v => +v.toFixed(4))).toEqual([1.1667, 2.3333]);
    a.ouverture = 'coulissant';
    expect(vantauxDe(a)).toEqual([3.5]);
  });

  it('le profil d un vantail suit la forme', () => {
    const a = { ...nouveauPortail('portail', 0, 20), hauteur: 1.5, fleche: 0.4 };
    expect(profilDuVantail(a, 1.75, 0)).toEqual([{ x: 0, y: 0 }, { x: 1.75, y: 0 }, { x: 1.75, y: 1.5 }, { x: 0, y: 1.5 }]);
    a.forme = 'chapeau-de-gendarme';
    const profil = profilDuVantail(a, 3.5, 0, 4);
    expect(profil).toHaveLength(2 + 5);
    // Le sommet de la courbe au milieu, la hauteur nominale aux bouts.
    expect(profil[4]).toEqual({ x: 1.75, y: 1.9 });
    expect(profil[2]?.y).toBeCloseTo(1.5, 6);
    expect(profil[6]?.y).toBeCloseTo(1.5, 6);
    a.forme = 'chapeau-inverse';
    expect(profilDuVantail(a, 3.5, 0, 4)[4]?.y).toBeCloseTo(1.5, 6);
    expect(profilDuVantail(a, 3.5, 0, 4)[2]?.y).toBeCloseTo(1.9, 6);
    // Deux battants : la courbe du battant droit continue celle du gauche.
    const gauche = profilDuVantail({ ...a, forme: 'chapeau-de-gendarme' }, 1.75, 0, 4);
    const droite = profilDuVantail({ ...a, forme: 'chapeau-de-gendarme' }, 1.75, 1.75, 4);
    expect(gauche[2]?.y).toBeCloseTo(1.9, 6);
    expect(droite[6]?.y).toBeCloseTo(1.9, 6);
  });

  it('alertesAcces dit ce qui ne va pas, et rien quand tout va', () => {
    const cl = clotureDe(parcelle(), true);
    const a: Portail = { ...nouveauPortail('portail', 0, 20), x: 5 };
    cl.portails.push(a);
    expect(alertesAcces(cl, a, 20)).toEqual([]);
    a.x = 18;
    expect(alertesAcces(cl, a, 20)[0]).toContain('dépasse le côté');
    a.x = 1;
    a.ouverture = 'coulissant';
    a.refoulement = 'gauche';
    expect(alertesAcces(cl, a, 20)[0]).toContain('se ranger à gauche');
    a.refoulement = 'droite';
    expect(alertesAcces(cl, a, 20)).toEqual([]);
    a.ouverture = 'battant-2';
    a.sens = 'exterieur';
    expect(alertesAcces(cl, a, 20)).toEqual([]);
    reglerCote(cl, 0).limite = 'rue';
    expect(alertesAcces(cl, a, 20)[0]).toContain('vers la rue');
  });

  it('accolerPortillon colle le portillon contre le portail le plus proche', () => {
    const cl = clotureDe(parcelle(), true);
    const portail: Portail = { ...nouveauPortail('portail', 0, 20), x: 5 };
    const portillon: Portail = { ...nouveauPortail('portillon', 0, 20), x: 15 };
    cl.portails.push(portail, portillon);
    expect(accolerPortillon(cl, portillon, 'droite')).toBe(true);
    // Pilier du portail (8,5 a 8,8), pilier du portillon (8,8 a 9,1), puis le portillon.
    expect(portillon.x).toBeCloseTo(9.1, 6);
    expect(accolerPortillon(cl, portillon, 'gauche')).toBe(true);
    expect(portillon.x).toBeCloseTo(5 - 0.3 - 0.3 - 1, 6);
    portillon.cote = 1;
    expect(accolerPortillon(cl, portillon, 'gauche')).toBe(false);
  });

  it('poserAcces centre l acces sur le point clique, sans sortir du cote', () => {
    const cote = { cote: 2, gauche: { x: 20, y: 10 }, droite: { x: 0, y: 10 }, largeur: 20 };
    const a = nouveauPortail('portail', 0, 20);
    poserAcces(a, cote, { x: 12, y: 10.4 });
    expect(a).toMatchObject({ cote: 2, x: 6.25 });
    poserAcces(a, cote, { x: 19.9, y: 10 });
    expect(a.x).toBe(0.3);
    poserAcces(a, cote, { x: -5, y: 10 });
    expect(a.x).toBe(16.2);
  });

  it('coteLePlusProche rend le cote et la distance', () => {
    const pts = parcelle().pts;
    expect(coteLePlusProche(pts, { x: 5, y: 0.4 })).toEqual({ cote: 0, distance: 0.4 });
    expect(coteLePlusProche(pts, { x: 19, y: 5 })).toEqual({ cote: 1, distance: 1 });
    expect(coteLePlusProche(pts, { x: -2, y: 12 }).cote).toBe(2);
  });

  it('resume un reglage et un acces en francais', () => {
    expect(resumeReglage({ type: 'mur', hauteur: 1.8, parement: 'pierre' })).toBe('Mur 1,80 m · pierre');
    expect(resumeReglage({ type: 'grillage', hauteur: 1.5, soubassement: { hauteur: 0.5, parement: 'enduit' } })).toBe('Grillage 1,50 m · rigide · muret 0,50 m');
    expect(resumeReglage({ type: 'aucune', hauteur: 0 })).toBe('Aucune');
    expect(resumeAcces({ ...nouveauPortail('portail', 0, 20), x: 4.2 })).toBe('Portail 3,50 m · deux battants · à 4,20 m');
  });
});
