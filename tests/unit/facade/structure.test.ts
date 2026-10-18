import { describe, it, expect } from 'vitest';
import { ajouterDansLaGrille, completer, croisementsLibres, mediane, memeHauteurNiveau, memeTailleTravee, regulariser, structurer, type BoiteOuverture, type EvaluerZone } from '../../../src/facade/structure.js';
import { REGLAGES_STRUCTURE, reglagesStructure, type NomReglageStructure } from '../../../src/facade/regles/facades/structure.js';

// La structure d'une facade (spec-facades §10, lot L15) : niveaux et travees, regularisation bornee a
// 10 cm, completion dans les zones cachees ou peu sures, gestes de la verification (§12).

const f = (x: number, y: number, l = 1.2, h = 1.35): BoiteOuverture => ({ type: 'fenetre', x, y, l, h });
const porte = (x: number): BoiteOuverture => ({ type: 'porte', x, y: 0, l: 0.95, h: 2.15 });
/** Trois travees, deux niveaux, la porte au milieu du rez-de-chaussee. */
const reguliere = (): BoiteOuverture[] => [f(1, 0.9), porte(4.52), f(7.8, 0.9), f(1, 3.8), f(4.4, 3.8), f(7.8, 3.8)];

describe('structurer', () => {
  it('trouve les niveaux (porte et fenetres du rez ensemble) et les travees', () => {
    const s = structurer(reguliere(), 10);
    expect(s.grille.niveaux).toHaveLength(2);
    expect(s.grille.niveaux[0]).toEqual({ appuiM: 0.9, linteauM: 2.25 });
    expect(s.grille.niveaux[1]).toEqual({ appuiM: 3.8, linteauM: 5.15 });
    expect(s.grille.travees.map((t) => t.xM)).toEqual([1.6, 5, 8.4]);
    expect(s.niveauDe).toEqual([0, 0, 0, 1, 1, 1]);
    expect(s.traveeDe).toEqual([0, 1, 2, 0, 1, 2]);
    expect(s.etagesPlausibles).toBe(true);
    expect(s.symetrique).toBe(true);
  });

  it('dit une facade non symetrique, et des etages trop hauts', () => {
    const s = structurer([f(1, 0.9), f(6, 0.9), f(1, 4.9)], 10);
    expect(s.symetrique).toBe(false);
    expect(s.etagesPlausibles).toBe(false);
  });

  it('prend la mediane des valeurs', () => {
    expect(mediane([3, 1, 2])).toBe(2);
    expect(mediane([4, 1, 2, 3])).toBe(2.5);
    expect(mediane([])).toBe(0);
  });
});

describe('regulariser', () => {
  it('donne la largeur mediane de la travee et la hauteur mediane du niveau, centre et appui gardes', () => {
    const os = [f(1, 0.9, 1.22, 1.33), f(1.02, 3.8, 1.18, 1.37), f(7.4, 0.9, 1.2, 1.35), f(7.4, 3.8, 1.2, 1.36)];
    const r = regulariser(os, structurer(os, 9.6));
    expect(r[0]?.l).toBe(1.2);
    expect(r[0]?.x).toBe(1.01);
    expect(r[1]?.l).toBe(1.2);
    expect(r[0]?.h).toBe(1.34);
    expect(r[2]?.h).toBe(1.34);
    expect(r[3]?.h).toBe(1.37);
    expect(r[0]?.y).toBe(0.9);
  });

  it('ne melange pas les types : une porte garde sa largeur sous la fenetre de sa travee', () => {
    const os = [porte(4.5), f(4.45, 3.9, 1.1, 1.4)];
    const r = regulariser(os, structurer(os, 10));
    expect(r[0]).toEqual(os[0]);
    expect(r[1]).toEqual(os[1]);
  });

  it('n aligne pas deux baies seules : leur mediane serait leur moyenne, et tirerait la bonne vers l autre', () => {
    const os = [f(1, 0.9, 1.2, 1.34), f(4, 0.93, 1.2, 1.34)];
    expect(regulariser(os, structurer(os, 9.6))).toEqual(os);
  });

  it('met une rangee de fenetres sous le meme linteau, et une travee sur le meme axe, a 5 cm pres', () => {
    // Trois fenetres d'un etage mesurees sur une photo : linteaux a 2,24 / 2,27 / 2,22 ; une travee de trois, axes 1,61 / 1,64 / 1,61.
    const os = [f(1, 0.9, 1.2, 1.34), f(4, 0.93, 1.2, 1.34), f(7, 0.88, 1.2, 1.34), f(1.04, 3.8, 1.2, 1.34), f(1, 6.7, 1.2, 1.34)];
    const r = regulariser(os, structurer(os, 9.6));
    expect(new Set(r.slice(0, 3).map((o) => Math.round((o.y + o.h) * 100)))).toEqual(new Set([224]));
    expect((r[3]?.x ?? 0) + (r[3]?.l ?? 0) / 2).toBeCloseTo((r[0]?.x ?? 0) + (r[0]?.l ?? 0) / 2, 2);
  });

  it('laisse a sa place une baie a plus de 5 cm du linteau de sa rangee (un oeil-de-boeuf, une imposte)', () => {
    const os = [f(1, 0.9, 1.2, 1.34), f(4, 0.9, 1.2, 1.34), f(7, 1.0, 1.2, 1.34)];
    const r = regulariser(os, structurer(os, 9.6));
    expect(r[2]?.y).toBe(1.0);
  });

  it('ne touche pas une baie a plus de 5 cm de la mediane', () => {
    const os = [f(1, 0.9, 1.2), f(1.05, 3.8, 1.1), f(1, 6.7, 1.2)];
    const r = regulariser(os, structurer(os, 9.6));
    expect(r[1]?.l).toBe(1.1);
  });

  it('ne deplace jamais un bord de plus de 10 cm (garde-fou)', () => {
    const os = [f(1, 0.9, 1.2, 1.35), f(1, 3.8, 1.2, 1.35)];
    const s = structurer(os, 9.6);
    // Un reglage d'egalisation large pousserait la largeur ; le garde-fou rend la mesure.
    const r = regulariser([os[0] as BoiteOuverture, { ...(os[1] as BoiteOuverture), l: 1.5, x: 0.85 }], s, { 'facades.structure.egaliserM': 0.5 });
    for (const [a, b] of r.map((o, i) => [o, i === 0 ? os[0] : { ...(os[1] as BoiteOuverture), l: 1.5, x: 0.85 }] as const)) {
      expect(Math.abs(a.x - (b?.x ?? 0))).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(Math.abs(a.x + a.l - ((b?.x ?? 0) + (b?.l ?? 0)))).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });
});

describe('completer', () => {
  // La fenetre de gauche du rez manque : sa zone est cachee, vue et mur, ou peu sure.
  const sans = reguliere().filter((_, i) => i !== 0);
  const s = structurer(sans, 10);
  const zone = (etat: { cache: number; mur: number }): EvaluerZone => () => etat;

  it('devine une baie cochee au croisement cache, aux cotes de la grille', () => {
    const d = completer(sans, s, 10, 6, zone({ cache: 1, mur: 0 }));
    expect(d).toHaveLength(1);
    const g = d[0];
    expect(g?.type).toBe('fenetre');
    expect(g?.x).toBe(1);
    expect(g?.l).toBe(1.2);
    expect(g?.y).toBe(0.9);
    expect(g?.niveau).toBe(0);
    expect(g?.travee).toBe(0);
    expect(g?.cochee).toBe(true);
    expect(g?.confiance).toBeGreaterThanOrEqual(0.6);
  });

  it('ne devine rien dans une zone vue et nettement mur', () => {
    expect(completer(sans, s, 10, 6, zone({ cache: 0, mur: 0.95 }))).toEqual([]);
  });

  it('laisse decochee, en pointille, une baie devinee dans une zone vue peu sure', () => {
    const d = completer(sans, s, 10, 6, zone({ cache: 0, mur: 0.3 }));
    expect(d).toHaveLength(1);
    expect(d[0]?.cochee).toBe(false);
    expect(d[0]?.confiance).toBeLessThan(0.6);
  });

  it('ne complete pas une seule rangee', () => {
    const une = [f(1, 0.9), f(7.4, 0.9)];
    expect(completer(une, structurer(une, 9.6), 9.6, 6, zone({ cache: 1, mur: 0 }))).toEqual([]);
  });

  it('ne pose pas de baie qui toucherait une autre ou sortirait du mur', () => {
    const os = [f(1, 0.9), f(1, 3.8), f(4.4, 3.8), { type: 'porte' as const, x: 3.8, y: 0, l: 2.4, h: 2.2 }];
    expect(croisementsLibres(os, structurer(os, 9.6), 9.6, 6)).toEqual([]);
  });
});

describe('gestes de la verification', () => {
  it('« Meme taille pour la travee » : la largeur et le centre de la choisie aux baies de meme type', () => {
    const os = [f(1, 0.9, 1.2), f(1.03, 3.8, 1.12), porte(4.52)];
    const r = memeTailleTravee(os, 0, 9.6);
    expect(r.touchees).toEqual([1]);
    expect(r.ouvertures[1]).toMatchObject({ x: 1, l: 1.2 });
    expect(memeTailleTravee(r.ouvertures, 0, 9.6).touchees).toEqual([]);
  });

  it('« Meme hauteur pour le niveau » : l appui et la hauteur aux baies de meme type de la rangee', () => {
    const os = [f(1, 0.9, 1.2, 1.35), porte(4.52), f(7.4, 0.95, 1.2, 1.3)];
    const r = memeHauteurNiveau(os, 0, 9.6);
    expect(r.touchees).toEqual([2]);
    expect(r.ouvertures[2]).toMatchObject({ y: 0.9, h: 1.35 });
    expect(r.ouvertures[1]).toEqual(os[1]);
  });

  it('« Ajouter dans la grille » : le croisement libre le plus proche', () => {
    const sans = reguliere().filter((_, i) => i !== 0 && i !== 2);
    const b = ajouterDansLaGrille(sans, 10, 6, { x: 8, y: 1 });
    // La rangee n'a qu'une porte : la baie prend la hauteur des fenetres de sa travee, sous le linteau de la porte.
    expect(b).toMatchObject({ type: 'fenetre', x: 7.8, y: 0.8, l: 1.2, h: 1.35, travee: 2, niveau: 0 });
    expect(ajouterDansLaGrille(sans, 10, 6, { x: 1, y: 1 })?.travee).toBe(0);
    expect(ajouterDansLaGrille(reguliere(), 10, 6)).toBeNull();
    expect(ajouterDansLaGrille([], 10, 6)).toBeNull();
  });
});

describe('reglages de la structure et du classement', () => {
  it('nomme chaque reglage, avec une unite et une raison', () => {
    const noms = Object.keys(REGLAGES_STRUCTURE) as NomReglageStructure[];
    for (const nom of noms) {
      expect(/^facades\.(structure|classement)\./.test(nom), nom).toBe(true);
      expect(REGLAGES_STRUCTURE[nom].pourquoi.length, nom).toBeGreaterThan(30);
    }
  });

  it('garde les seuils de la spec (§10) et applique les surcharges', () => {
    const v = reglagesStructure({ 'facades.structure.traveeM': 0.2 });
    expect(v['facades.structure.traveeM']).toBe(0.2);
    expect(v['facades.structure.gardeFouM']).toBe(0.1);
    expect(v['facades.structure.egaliserM']).toBe(0.05);
    expect(v['facades.structure.etageMinM']).toBe(2.5);
    expect(v['facades.structure.etageMaxM']).toBe(3.2);
  });
});
