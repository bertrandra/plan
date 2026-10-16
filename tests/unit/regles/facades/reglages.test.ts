import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REGLAGES_FACADES, PROFILS_FACADES, DESCRIPTION_REGLAGES_FACADES, EMPREINTE_REGLAGES_FACADES, LECTURES_FACADES, VERSION_LECTURE_FACADES,
  PROFIL_FACADES_DEFAUT, lireReglagesFacades, choisirProfilFacades, empreinteReglagesFacades, versionLectureFacades, valeursFacadesDe,
  valeursDuProfil, niveauMitoyennete, conflitsProfilsFacades, ReglagesFacadesIllisibles, type DescriptionFacades,
} from '../../../../src/regles/facades/reglages.js';
import { FENETRE, PORTE, ENTRAXE_FENETRES_M, FENETRES_3D_DEFAUT, fenetres3dDe } from '../../../../src/model/fenetres3d.js';
import { HAUTEUR_ETAGE_M } from '../../../../src/geo/bdtopo.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Les reglages des facades sortis du code dans regles/facades/reglages.json (F§15.2, D18, D19).

/**
 * Les constantes que facade/ouvertures.ts et model/fenetres3d.ts portaient avant le fichier
 * (claude/g11-mesure-facades, 27a8b65), recopiees une fois : le profil par defaut doit les redonner
 * au bit pres, et la version de lecture 1 en etre l'empreinte.
 */
const VALEURS_DU_CODE: Record<string, number> = {
  FENETRE_LARGEUR_M: 1.0, FENETRE_HAUTEUR_M: 1.2, FENETRE_APPUI_M: 0.9, PORTE_LARGEUR_M: 0.9, PORTE_HAUTEUR_M: 2.1,
  ENTRAXE_FENETRES_M: 2.4, FENETRES_MAX_PAR_MUR: 8, HAUTEUR_NIVEAU_M: 2.7, HAUTEUR_NIVEAU_MIN_M: 2.2, LARGEUR_MUR_MIN_M: 2,
  HAUTEUR_PIGNON_FENETRE_M: 1.8,
};

const racine = join(__dirname, '../../../..');
const livre = JSON.parse(readFileSync(join(racine, 'regles/facades/reglages.json'), 'utf8')) as Record<string, unknown>;
const essai = (JSON.parse(readFileSync(join(racine, 'tests/fixtures/regles-facades/profils-essai.json'), 'utf8')) as { profils: unknown[] }).profils;
const avec = (profils: unknown[]) => ({ ...livre, profils });
const PROFILS_ESSAI = lireReglagesFacades(avec(essai)).profils;

const decrire = (d: Partial<DescriptionFacades>): DescriptionFacades => ({ departement: null, epoque: null, usage: null, etages: null, mitoyennete: null, ...d });

describe('le profil par defaut', () => {
  it('redonne les constantes d avant, au bit pres', () => {
    expect({ ...REGLAGES_FACADES }).toEqual(VALEURS_DU_CODE);
    for (const [nom, v] of Object.entries(VALEURS_DU_CODE)) expect(Object.is(REGLAGES_FACADES[nom as keyof typeof REGLAGES_FACADES], v)).toBe(true);
    expect(FENETRE).toEqual({ l: 1, h: 1.2, appui: 0.9 });
    expect(PORTE).toEqual({ l: 0.9, h: 2.1 });
    expect(ENTRAXE_FENETRES_M).toBe(2.4);
    expect(FENETRES_3D_DEFAUT).toEqual({ mode: 'toutes', largeur: 1, hauteur: 1.2, appui: 0.9, entraxe: 2.4 });
    // La hauteur d'un niveau est celle de la BD TOPO (geo/bdtopo.ts) : compter les niveaux comme on compte la hauteur.
    expect(REGLAGES_FACADES.HAUTEUR_NIVEAU_M).toBe(HAUTEUR_ETAGE_M);
  });

  it('est le seul profil livre : le premier lot n en contient pas d autre (G12)', () => {
    expect(PROFILS_FACADES).toEqual([]);
  });

  it('decrit chaque reglage : unite, module, raison', () => {
    for (const [nom, d] of Object.entries(DESCRIPTION_REGLAGES_FACADES)) {
      expect(d.unite, nom).toBeTruthy();
      expect(d.ou, nom).toMatch(/\.ts/);
      expect(d.pourquoi.length, nom).toBeGreaterThan(20);
    }
  });

  it('a son empreinte dans les versions de lecture : version 1, la disposition d avant', () => {
    // Un reglage ou un profil change sans ligne nouvelle : ajouter { version: n + 1, reglages: '<cette empreinte>' }.
    expect(LECTURES_FACADES.map((l) => l.reglages)).toContain(EMPREINTE_REGLAGES_FACADES);
    expect(EMPREINTE_REGLAGES_FACADES).toBe(empreinteReglagesFacades(VALEURS_DU_CODE, []));
    expect(VERSION_LECTURE_FACADES).toBe(1);
  });
});

describe('la lecture du fichier', () => {
  const refuse = (donnees: unknown, motif: RegExp) => {
    expect(() => lireReglagesFacades(donnees)).toThrow(ReglagesFacadesIllisibles);
    expect(() => lireReglagesFacades(donnees)).toThrow(motif);
  };
  const profil = (p: Record<string, unknown>) => ({ id: 'p', quand: { departements: ['78'] }, surcharges: { FENETRE_LARGEUR_M: 1.1 }, pourquoi: 'Un profil pour essayer la lecture.', cas: ['essai/x'], ...p });

  it('lit les profils d essai, dans l ordre du vocabulaire', () => {
    expect(PROFILS_ESSAI.map((p) => p.id)).toEqual(['pavillon-essai', 'maison-de-rang-essai', 'ancien-essai']);
    expect(Object.keys(PROFILS_ESSAI[1]!.quand)).toEqual(['departements', 'usages', 'mitoyennete']);
  });

  it('refuse un fichier abime', () => {
    refuse(null, /format inconnu/);
    refuse({ ...livre, format: 'autre' }, /format inconnu/);
    const seuils = { ...(livre.seuils as Record<string, unknown>) };
    delete seuils.ENTRAXE_FENETRES_M;
    refuse({ ...livre, seuils }, /ENTRAXE_FENETRES_M manquant/);
    refuse({ ...livre, seuils: { ...(livre.seuils as object), LARGEUR_MUR_MIN_M: { valeur: 'deux' } } }, /sans valeur numerique/);
    refuse(avec({} as unknown as unknown[]), /une liste est attendue/);
  });

  it('refuse ce qui sort du vocabulaire ferme', () => {
    refuse(avec([profil({ quand: { adresse: ['2 allée des Limites'] } })]), /condition inconnue adresse/);
    refuse(avec([profil({ quand: { usages: ['Pavillon'] } })]), /usages ne connait pas "Pavillon"/);
    refuse(avec([profil({ quand: { departements: ['20'] } })]), /departements ne connait pas "20"/);
    refuse(avec([profil({ quand: { epoque: { min: 1950, max: 1900 } } })]), /epoque vide/);
    refuse(avec([profil({ quand: { etages: { de: 2 } } })]), /ne connait que min et max/);
    refuse(avec([profil({ quand: {} })]), /au moins une condition/);
  });

  it('refuse un reglage inconnu, un id reserve ou en double, un profil sans cas', () => {
    refuse(avec([profil({ surcharges: { PIGNON_AVEUGLE: 1 } })]), /reglage inconnu PIGNON_AVEUGLE/);
    refuse(avec([profil({ surcharges: { FENETRE_LARGEUR_M: -1 } })]), /nombre positif/);
    refuse(avec([profil({ id: PROFIL_FACADES_DEFAUT })]), /reserve/);
    refuse(avec([profil({}), profil({ quand: { departements: ['92'] } })]), /deux profils s'appellent p/);
    refuse(avec([profil({ cas: [] })]), /cas/);
  });

  it('refuse deux profils de meme precision qui peuvent tomber sur le meme batiment', () => {
    // Des conditions differentes ne se comparent pas : un departement et une epoque peuvent se rencontrer.
    refuse(avec([profil({}), profil({ id: 'q', quand: { epoque: { max: 1900 } } })]), /precision egale.*p et q/);
    // Des listes sans mot commun, des plages disjointes : ils ne se rencontrent jamais.
    expect(lireReglagesFacades(avec([profil({}), profil({ id: 'q', quand: { departements: ['13'] } })])).profils).toHaveLength(2);
    expect(lireReglagesFacades(avec([profil({ quand: { epoque: { max: 1900 } } }), profil({ id: 'q', quand: { epoque: { min: 1900 } } })])).profils).toHaveLength(2);
    // A precision differente, le plus precis l'emporte : pas de conflit.
    expect(conflitsProfilsFacades(PROFILS_ESSAI)).toEqual([]);
  });
});

describe('le choix du profil', () => {
  const choix = (d: Partial<DescriptionFacades>) => choisirProfilFacades(PROFILS_ESSAI, decrire(d))?.id ?? PROFIL_FACADES_DEFAUT;

  it('retient le profil dont toutes les conditions sont remplies', () => {
    expect(choix({ departement: '78', usage: 'Résidentiel' })).toBe('pavillon-essai');
    expect(choix({ departement: '92', usage: 'Résidentiel', mitoyennete: 'forte' })).toBe('pavillon-essai');
    expect(choix({ departement: '78', usage: 'Annexe' })).toBe(PROFIL_FACADES_DEFAUT);
    expect(choix({ departement: '75', usage: 'Résidentiel' })).toBe(PROFIL_FACADES_DEFAUT);
  });

  it('donne la priorite au plus precis', () => {
    expect(choix({ departement: '78', usage: 'Résidentiel', mitoyennete: 'forte' })).toBe('maison-de-rang-essai');
    expect(choix({ departement: '78', usage: 'Résidentiel', mitoyennete: 'partielle' })).toBe('pavillon-essai');
  });

  it('ne remplit rien avec une valeur inconnue, et lit les plages min compris, max exclu', () => {
    expect(choix({ departement: '13', etages: 3 })).toBe(PROFIL_FACADES_DEFAUT);
    expect(choix({ departement: '13', etages: 3, epoque: 1899 })).toBe('ancien-essai');
    expect(choix({ departement: '13', etages: 3, epoque: 1900 })).toBe(PROFIL_FACADES_DEFAUT);
    expect(choix({ departement: '13', etages: 2, epoque: 1850 })).toBe('ancien-essai');
    expect(choix({ departement: '13', etages: 1, epoque: 1850 })).toBe(PROFIL_FACADES_DEFAUT);
  });

  it('applique le profil en entier, par-dessus le defaut', () => {
    const v = valeursDuProfil(PROFILS_ESSAI[1]!);
    expect(v.FENETRE_LARGEUR_M).toBe(0.8);
    expect(v.ENTRAXE_FENETRES_M).toBe(1.8);
    // Ce qu'il ne dit pas reste au defaut, pas a la valeur d'un profil moins precis.
    expect(v.FENETRE_HAUTEUR_M).toBe(1.2);
    expect(valeursDuProfil(null)).toBe(REGLAGES_FACADES);
  });

  it('lit le profil range sur un batiment ; un id inconnu donne le defaut', () => {
    expect(valeursFacadesDe({ profilFacades: { id: 'pavillon-essai' } }, PROFILS_ESSAI).FENETRE_LARGEUR_M).toBe(1.2);
    expect(valeursFacadesDe({ profilFacades: { id: 'retire' } }, PROFILS_ESSAI)).toBe(REGLAGES_FACADES);
    expect(valeursFacadesDe({})).toBe(REGLAGES_FACADES);
    expect(valeursFacadesDe(null)).toBe(REGLAGES_FACADES);
  });

  it('les dimensions du profil livre initialisent les fenetres du batiment ; un reglage ecrit l emporte', () => {
    const o = { profilFacades: { id: PROFIL_FACADES_DEFAUT, version: 1 } } as unknown as ObjetPlan;
    expect(fenetres3dDe(o)).toEqual(FENETRES_3D_DEFAUT);
    expect(fenetres3dDe({ ...o, fenetres3d: { ...FENETRES_3D_DEFAUT, largeur: 1.5 } } as ObjetPlan).largeur).toBe(1.5);
  });

  it('dit la mitoyennete en trois niveaux', () => {
    expect([0, 0.04, 0.05, 0.25, 0.4, 1].map(niveauMitoyennete)).toEqual(['aucune', 'aucune', 'partielle', 'partielle', 'forte', 'forte']);
  });
});

describe('l empreinte', () => {
  it('suit les valeurs et les profils, pas les raisons', () => {
    const base = empreinteReglagesFacades(REGLAGES_FACADES, []);
    expect(empreinteReglagesFacades({ ...REGLAGES_FACADES, ENTRAXE_FENETRES_M: 2.5 }, [])).not.toBe(base);
    expect(empreinteReglagesFacades(REGLAGES_FACADES, PROFILS_ESSAI)).not.toBe(base);
    const reecrit = lireReglagesFacades(avec(essai.map((p) => ({ ...(p as object), pourquoi: 'Une autre raison, plus longue.' })))).profils;
    expect(empreinteReglagesFacades(REGLAGES_FACADES, reecrit)).toBe(empreinteReglagesFacades(REGLAGES_FACADES, PROFILS_ESSAI));
  });

  it('une empreinte inconnue donne la version suivante', () => {
    expect(versionLectureFacades([{ version: 1, reglages: 'a' }], 'a')).toBe(1);
    expect(versionLectureFacades([{ version: 1, reglages: 'a' }], 'b')).toBe(2);
    expect(versionLectureFacades([{ version: 1, reglages: 'a' }, { version: 2, reglages: 'b' }, { version: 3, reglages: 'a' }], 'a')).toBe(3);
  });
});

describe('les modules ne portent plus les nombres', () => {
  it('aucun reglage n est defini en dur dans facade/ouvertures.ts ni model/fenetres3d.ts', () => {
    for (const f of ['src/facade/ouvertures.ts', 'src/model/fenetres3d.ts']) {
      const texte = readFileSync(join(racine, f), 'utf8');
      for (const nom of Object.keys(VALEURS_DU_CODE)) expect(texte, f + ' : ' + nom).not.toMatch(new RegExp('\\b' + nom + '\\s*=\\s*\\d'));
      expect(texte, f).not.toMatch(/\{\s*l:\s*\d/);
    }
  });
});
