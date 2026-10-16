import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  choisirProfils, compatibles, conflitsDeProfils, formeEmpreinteProfils, lireProfilsToits, niveauMitoyennete, precision, profilApplicable,
  ProfilsToitsIllisibles, VOCABULAIRE_PROFILS, type DescriptionBatiment,
} from '../../../../src/regles/toits/profils.js';
import { REGLAGES_TOITS, empreinteReglagesToits } from '../../../../src/regles/toits/reglages.js';

// Le moteur des profils de toits (MD/spec-regles-toits.md §6) : vocabulaire ferme, priorites, conflits.
// Les profils d'essai vivent dans tests/fixtures/toits/profils-essai.json, jamais dans le fichier livre.

const SEUILS = Object.keys(REGLAGES_TOITS);
const essai = (): unknown => JSON.parse(readFileSync(new URL('../../../fixtures/toits/profils-essai.json', import.meta.url), 'utf8'));
const lire = (profils: unknown) => lireProfilsToits(profils, SEUILS);
/** Un profil valide, a completer. */
const profil = (id: string, quand: unknown, surcharges: unknown = { SEUIL_MARCHE_M: 1 }) => ({ id, quand, surcharges, pourquoi: 'Un profil des tests, jamais livre.', cas: ['essai/a', 'essai/b'] });
/** Un batiment dont on ne sait rien : aucune condition n'est remplie. */
const inconnu: DescriptionBatiment = { departement: null, latitude: null, materiauMurs: null, materiauToiture: null, hauteur: null, surface: null, mitoyennete: null, formeContour: null, epoque: null };
const yvelines: DescriptionBatiment = { ...inconnu, departement: '78', latitude: 48.9, mitoyennete: 'aucune', formeContour: 'composee', surface: 120, hauteur: 6.5 };

describe('lecture des profils', () => {
  it('lit les profils d’essai, dans l’ordre du fichier', () => {
    const p = lire(essai());
    expect(p.map((x) => x.id)).toEqual(['essai-yvelines', 'essai-yvelines-mitoyen', 'essai-nord']);
    // Un mot seul vaut une liste : `"mitoyennete": "forte"`, comme l'exemple de la spec.
    expect(p[1]!.quand).toEqual({ departements: ['78'], mitoyennete: ['forte'] });
    expect(p.map(precision)).toEqual([1, 2, 1]);
  });

  it('une liste vide ou absente : aucun profil', () => {
    expect(lire([])).toEqual([]);
    expect(lire(undefined)).toEqual([]);
  });

  it('refuse ce qui sort du vocabulaire ferme', () => {
    expect(() => lire([profil('a', { adresse: ['2 allee des Limites'] })])).toThrow(/condition inconnue adresse/);
    expect(() => lire([profil('a', { cleabs: ['BATIMENT0000000322509199'] })])).toThrow(ProfilsToitsIllisibles);
    expect(() => lire([profil('a', { departements: ['780'] })])).toThrow(/ne connait pas/);
    expect(() => lire([profil('a', { mitoyennete: ['totale'] })])).toThrow(/ne connait pas/);
    expect(() => lire([profil('a', { formeContour: 'rond' })])).toThrow(/ne connait pas/);
    expect(() => lire([profil('a', { materiauxMurs: ['1'] })])).toThrow(/ne connait pas/);
    expect(() => lire([profil('a', { latitude: { min: 45, max: 44 } })])).toThrow(/vide/);
    expect(() => lire([profil('a', { latitude: { sud: 45 } })])).toThrow(/min et max/);
    expect(() => lire([profil('a', { hauteur: {} })])).toThrow(/sans borne/);
    // Les departements corses et d'outre-mer sont du vocabulaire.
    expect(lire([profil('a', { departements: ['2A', '2B', '971'] })])[0]!.quand.departements).toEqual(['2A', '2B', '971']);
  });

  it('refuse un profil sans condition, sans surcharge, sur un seuil inconnu, ou sans deux cas', () => {
    expect(() => lire([profil('a', {})])).toThrow(/au moins une condition/);
    expect(() => lire([profil('a', { departements: ['13'] }, {})])).toThrow(/au moins un seuil/);
    expect(() => lire([profil('a', { departements: ['13'] }, { SEUIL_INVENTE: 1 })])).toThrow(/seuil inconnu SEUIL_INVENTE/);
    expect(() => lire([profil('a', { departements: ['13'] }, { SEUIL_MARCHE_M: '1' })])).toThrow(/nombre/);
    expect(() => lire([{ ...profil('a', { departements: ['13'] }), cas: ['gordes/1'] }])).toThrow(/deux cas/);
    expect(() => lire([{ ...profil('a', { departements: ['13'] }), pays: 'fr' }])).toThrow(/champ inconnu/);
    expect(() => lire([profil('A b', { departements: ['13'] })])).toThrow(/id/);
    expect(() => lire([profil('a', { departements: ['13'] }), profil('a', { departements: ['62'] })])).toThrow(/deux profils s'appellent a/);
  });

  it('le vocabulaire est celui de la spec §6', () => {
    expect(VOCABULAIRE_PROFILS).toEqual(['departements', 'latitude', 'materiauxMurs', 'materiauxToiture', 'hauteur', 'surface', 'mitoyennete', 'formeContour', 'epoque']);
  });
});

describe('conflits : a precision egale, la CI refuse le fichier', () => {
  it('deux profils de meme precision sur le meme seuil, qui peuvent toucher le meme batiment : refuses', () => {
    const a = profil('provence', { departements: ['13', '84'] }), b = profil('trapezes', { formeContour: ['trapeze'] });
    expect(() => lire([a, b])).toThrow(/provence et trapezes : meme precision \(1\) sur SEUIL_MARCHE_M/);
    // Deux plages qui se recouvrent sur la meme condition.
    expect(() => lire([profil('bas', { hauteur: { max: 7 } }), profil('moyen', { hauteur: { min: 5, max: 9 } })])).toThrow(ProfilsToitsIllisibles);
  });

  it('pas de conflit si une condition commune les separe, si la precision differe, ou si les seuils different', () => {
    expect(lire(essai())).toHaveLength(3);
    // Des plages qui se suivent ne se recouvrent pas : `max` est exclu.
    expect(lire([profil('bas', { hauteur: { max: 7 } }), profil('haut', { hauteur: { min: 7 } })])).toHaveLength(2);
    expect(lire([profil('a', { departements: ['13'] }), profil('b', { departements: ['13'] }, { TOLERANCE_REFONTE: 1.3 })])).toHaveLength(2);
    expect(lire([profil('a', { departements: ['13'] }), profil('b', { departements: ['13'], formeContour: 'trapeze' })])).toHaveLength(2);
  });

  it('compatibles : des conditions differentes ne se comparent pas, par prudence', () => {
    expect(compatibles({ departements: ['13'] }, { latitude: { min: 50 } })).toBe(true);
    expect(compatibles({ departements: ['13'] }, { departements: ['62'] })).toBe(false);
    expect(compatibles({ epoque: { max: 1900 } }, { epoque: { min: 1950 } })).toBe(false);
    expect(conflitsDeProfils([])).toEqual([]);
  });
});

describe('declencheurs', () => {
  const p = (quand: unknown) => lire([profil('p', quand)])[0]!;

  it('toutes les conditions doivent etre remplies ; une valeur inconnue n’en remplit aucune', () => {
    expect(profilApplicable(p({ departements: ['78'] }), yvelines)).toBe(true);
    expect(profilApplicable(p({ departements: ['78'], formeContour: 'trapeze' }), yvelines)).toBe(false);
    expect(profilApplicable(p({ departements: ['78'] }), inconnu)).toBe(false);
    expect(profilApplicable(p({ epoque: { max: 1950 } }), yvelines)).toBe(false);
  });

  it('chaque condition du vocabulaire', () => {
    const d: DescriptionBatiment = { departement: '62', latitude: 50.5, materiauMurs: 'brique', materiauToiture: 'tuile', hauteur: 6, surface: 140, mitoyennete: 'forte', formeContour: 'rectangle', epoque: 1890 };
    expect(profilApplicable(p({ departements: ['59', '62'] }), d)).toBe(true);
    expect(profilApplicable(p({ latitude: { min: 49 } }), d)).toBe(true);
    expect(profilApplicable(p({ latitude: { max: 46 } }), d)).toBe(false);
    expect(profilApplicable(p({ materiauxMurs: ['brique', 'pierre'] }), d)).toBe(true);
    expect(profilApplicable(p({ materiauxMurs: ['meuliere'] }), d)).toBe(false);
    expect(profilApplicable(p({ materiauxToiture: ['tuile'] }), d)).toBe(true);
    expect(profilApplicable(p({ materiauxToiture: ['ardoise'] }), d)).toBe(false);
    expect(profilApplicable(p({ hauteur: { min: 4, max: 8 } }), d)).toBe(true);
    expect(profilApplicable(p({ hauteur: { max: 6 } }), d)).toBe(false);
    expect(profilApplicable(p({ hauteur: { min: 6 } }), d)).toBe(true);
    expect(profilApplicable(p({ surface: { min: 100 } }), d)).toBe(true);
    expect(profilApplicable(p({ mitoyennete: ['partielle', 'forte'] }), d)).toBe(true);
    expect(profilApplicable(p({ mitoyennete: 'aucune' }), d)).toBe(false);
    expect(profilApplicable(p({ formeContour: ['rectangle'] }), d)).toBe(true);
    expect(profilApplicable(p({ epoque: { max: 1914 } }), d)).toBe(true);
  });

  it('les niveaux de mitoyennete', () => {
    expect(niveauMitoyennete(0)).toBe('aucune');
    expect(niveauMitoyennete(0.04)).toBe('aucune');
    expect(niveauMitoyennete(0.25)).toBe('partielle');
    expect(niveauMitoyennete(0.4)).toBe('forte');
  });
});

describe('priorites : le plus precis l’emporte, seuil par seuil', () => {
  const profils = lire(essai());

  it('sans profil applicable, aucune surcharge', () => {
    expect(choisirProfils(profils, inconnu)).toEqual({ surcharges: {}, source: {}, applicables: [] });
    expect(choisirProfils([], yvelines).surcharges).toEqual({});
  });

  it('un seul profil applicable : ses surcharges', () => {
    expect(choisirProfils(profils, yvelines)).toEqual({
      surcharges: { DEPASSEMENT_VEGETATION_M: 5, SEUIL_MARCHE_M: 1.2 },
      source: { DEPASSEMENT_VEGETATION_M: 'essai-yvelines', SEUIL_MARCHE_M: 'essai-yvelines' },
      applicables: ['essai-yvelines'],
    });
  });

  it('deux profils applicables : le plus precis l’emporte sur leur seuil commun, l’autre garde le reste', () => {
    const c = choisirProfils(profils, { ...yvelines, mitoyennete: 'forte' });
    expect(c.applicables).toEqual(['essai-yvelines', 'essai-yvelines-mitoyen']);
    expect(c.surcharges).toEqual({ SEUIL_MARCHE_M: 1.5, DEPASSEMENT_VEGETATION_M: 5 });
    expect(c.source).toEqual({ SEUIL_MARCHE_M: 'essai-yvelines-mitoyen', DEPASSEMENT_VEGETATION_M: 'essai-yvelines' });
    // L'ordre du fichier n'y fait rien.
    expect(choisirProfils([...profils].reverse(), { ...yvelines, mitoyennete: 'forte' }).surcharges).toEqual(c.surcharges);
  });

  it('le profil d’une autre region ne s’applique pas', () => {
    expect(choisirProfils(profils, { ...yvelines, departement: '62' }).surcharges).toEqual({ SEUIL_MARCHE_M: 0.6 });
  });
});

describe('empreinte des profils', () => {
  it('sans profil, la forme d’empreinte est une liste vide : l’empreinte d’avant le moteur', () => {
    expect(formeEmpreinteProfils([])).toEqual([]);
    expect(empreinteReglagesToits(REGLAGES_TOITS, formeEmpreinteProfils([]))).toBe(empreinteReglagesToits(REGLAGES_TOITS));
  });

  it('un profil, ses conditions ou ses surcharges changent l’empreinte ; ses raisons et ses cas non', () => {
    const base = lire(essai());
    const e = (p: unknown) => empreinteReglagesToits(REGLAGES_TOITS, formeEmpreinteProfils(lire(p)));
    const brut = essai() as Record<string, unknown>[];
    expect(e(brut)).not.toBe(e([]));
    expect(e(brut.map((p, i) => (i === 0 ? { ...p, pourquoi: 'Une autre raison, plus longue.', cas: ['x/1', 'x/2'] } : p)))).toBe(e(brut));
    expect(e(brut.map((p, i) => (i === 0 ? { ...p, surcharges: { SEUIL_MARCHE_M: 1.25, DEPASSEMENT_VEGETATION_M: 5 } } : p)))).not.toBe(e(brut));
    // L'ordre d'ecriture des conditions et des surcharges n'y fait rien.
    expect(e(brut.map((p, i) => (i === 1 ? { ...p, quand: { mitoyennete: 'forte', departements: ['78'] } } : p)))).toBe(e(brut));
    expect(e(brut.map((p, i) => (i === 0 ? { ...p, surcharges: { DEPASSEMENT_VEGETATION_M: 5, SEUIL_MARCHE_M: 1.2 } } : p)))).toBe(e(brut));
    expect(base).toHaveLength(3);
  });
});
