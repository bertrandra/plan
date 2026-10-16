import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  departementDuCode, contexteProfilsFacades, descriptionFacadesDuBatiment, partMitoyenneFacades, profilFacadesDuBatiment, CONTEXTE_PROFILS_FACADES_VIDE,
} from '../../../../../src/facade/regles/facades/profils.js';
import { ouverturesAutomatiques, fenetresDesPignons, niveaux } from '../../../../../src/facade/ouvertures.js';
import { lireReglagesFacades, valeursDuProfil, REGLAGES_FACADES, PROFIL_FACADES_DEFAUT } from '../../../../../src/regles/facades/reglages.js';
import type { CorpsToit, PtBrut } from '../../../../../src/model/types.js';

// Le choix du profil de facades d'un batiment (F§15.2, D19) et la disposition qu'il donne.

const racine = join(__dirname, '../../../../..');
const livre = JSON.parse(readFileSync(join(racine, 'regles/facades/reglages.json'), 'utf8')) as Record<string, unknown>;
const essai = (JSON.parse(readFileSync(join(racine, 'tests/fixtures/regles-facades/profils-essai.json'), 'utf8')) as { profils: unknown[] }).profils;
const PROFILS = lireReglagesFacades({ ...livre, profils: essai }).profils;

const p = (x: number, y: number): PtBrut => ({ x, y });
const rect = (x0: number, y0: number, l: number, w: number) => [p(x0, y0), p(x0 + l, y0), p(x0 + l, y0 + w), p(x0, y0 + w)];
const parcelle = { key: 'parcelle', fonction: 'terrain', pts: rect(-50, -50, 200, 200), cadastre: { idu: '78650000AE0101', codeInsee: '78650' } };
const batiment = (key: string, pts: PtBrut[], bdtopo: Record<string, unknown> = {}) => ({ key, fonction: 'batiment', pts, bdtopo: { usage1: 'Résidentiel', ...bdtopo } });

describe('ce qu on sait d un batiment', () => {
  it('tire le departement de l IDU, a defaut du code INSEE', () => {
    expect(departementDuCode('78650000AE0101')).toBe('78');
    expect(departementDuCode('2A004000AB0012')).toBe('2A');
    expect(departementDuCode('97105')).toBe('971');
    expect(departementDuCode('20004')).toBeNull();
    expect(departementDuCode('78')).toBeNull();
    expect(departementDuCode(null)).toBeNull();
    expect(contexteProfilsFacades([{ key: 'parcelle', cadastre: { codeInsee: '13001' } }], PROFILS).departement).toBe('13');
  });

  it('ne decrit rien sans profil : le contexte vide', () => {
    expect(contexteProfilsFacades([parcelle, batiment('a', rect(0, 0, 10, 8))], [])).toBe(CONTEXTE_PROFILS_FACADES_VIDE);
  });

  it('lit l usage, les etages, l epoque, et la part du contour collee aux voisins', () => {
    const a = batiment('a', rect(0, 0, 10, 8), { nombreEtages: 2, dateApparition: '1885-01-01' });
    const b = batiment('b', rect(10.2, 0, 10, 8));
    const c = batiment('c', rect(-10, 0, 10, 8));
    const ctx = contexteProfilsFacades([parcelle, a, b, c], PROFILS);
    expect(descriptionFacadesDuBatiment(a, ctx)).toEqual({ departement: '78', epoque: 1885, usage: 'Résidentiel', etages: 2, mitoyennete: 'forte' });
    // Colle d'un cote seulement : 8 m sur 36.
    const seul = contexteProfilsFacades([parcelle, a, b], PROFILS);
    expect(partMitoyenneFacades(a, a.pts, seul.voisins)).toBeCloseTo(8 / 36, 1);
    expect(descriptionFacadesDuBatiment(a, seul).mitoyennete).toBe('partielle');
    expect(descriptionFacadesDuBatiment(batiment('d', rect(40, 40, 6, 6), { usage1: null, nombreEtages: null }), ctx)).toMatchObject({ usage: null, etages: null, epoque: null, mitoyennete: 'aucune' });
  });
});

describe('le profil d un batiment', () => {
  it('choisit selon les declencheurs, le plus precis l emporte', () => {
    const a = batiment('a', rect(0, 0, 10, 8));
    const b = batiment('b', rect(10.2, 0, 10, 8));
    const c = batiment('c', rect(-10, 0, 10, 8));
    const isole = contexteProfilsFacades([parcelle, a], PROFILS);
    expect(profilFacadesDuBatiment(a, isole, PROFILS).id).toBe('pavillon-essai');
    const enRang = contexteProfilsFacades([parcelle, a, b, c], PROFILS);
    expect(profilFacadesDuBatiment(a, enRang, PROFILS).id).toBe('maison-de-rang-essai');
    expect(profilFacadesDuBatiment(batiment('g', rect(0, 0, 10, 8), { usage1: 'Annexe' }), isole, PROFILS).id).toBe(PROFIL_FACADES_DEFAUT);
  });

  it('sans profil, le defaut, au bit pres', () => {
    const r = profilFacadesDuBatiment(batiment('a', rect(0, 0, 10, 8)), CONTEXTE_PROFILS_FACADES_VIDE, []);
    expect(r).toEqual({ id: PROFIL_FACADES_DEFAUT, valeurs: REGLAGES_FACADES });
  });
});

describe('la disposition suit le profil retenu', () => {
  const maison = rect(0, 0, 12, 8);
  const volumes = [{ pts: maison, hauteur: 6 }];

  it('le profil par defaut donne exactement la disposition d avant', () => {
    const sans = ouverturesAutomatiques(maison, volumes, 6, { etages: 2 });
    expect(ouverturesAutomatiques(maison, volumes, 6, { etages: 2, profil: REGLAGES_FACADES })).toEqual(sans);
    expect(sans).toHaveLength(28);
  });

  it('un profil d essai change les dimensions, l appui et l entraxe', () => {
    const pavillon = valeursDuProfil(PROFILS[0]!);
    const l = ouverturesAutomatiques(maison, volumes, 6, { etages: 2, profil: pavillon });
    const f = l.filter((o) => o.type === 'fenetre');
    expect(f.every((o) => o.l === 1.2 && o.h === 1.35)).toBe(true);
    expect(new Set(f.map((o) => o.y))).toEqual(new Set([0.95, 3.95]));
    // Entraxe de 3 m : 3 fenetres sur 12 m (au lieu de 4), 2 sur 8 m (au lieu de 3).
    const auNord = f.filter((o) => o.cote === 2 && o.y < 1).sort((a, b) => a.x - b.x);
    expect(auNord).toHaveLength(3);
    expect(auNord[1]!.x - auNord[0]!.x).toBeCloseTo(3, 9);
    expect(f.filter((o) => o.cote === 1 && o.y < 1)).toHaveLength(2);
    expect(l.length).toBeLessThan(28);
  });

  it('les dimensions passees en options l emportent sur le profil, ses seuils restent', () => {
    const rang = valeursDuProfil(PROFILS[1]!);
    const l = ouverturesAutomatiques(maison, volumes, 6, { etages: 2, profil: rang, largeur: 1, entraxe: 2.4 });
    expect(l.filter((o) => o.type === 'fenetre').every((o) => o.l === 1)).toBe(true);
    // Le seuil du profil : sous 2,5 m de niveau, pas de fenetre (2 niveaux sur 4,8 m : 2,4 m chacun).
    expect(niveaux(4.8, 2, rang).n).toBe(1);
    expect(niveaux(4.8, 2).n).toBe(2);
  });

  it('les fenetres des pignons suivent le seuil du profil', () => {
    const c: CorpsToit = { pts: rect(0, 0, 10, 8), posFaitage: 4, faitage: 6.6, egouts: [5, 5], pignons: [] } as unknown as CorpsToit;
    expect(fenetresDesPignons(c).length).toBe(0);
    expect(fenetresDesPignons(c, 1, 1.2, 1.5).length).toBe(2);
  });
});
